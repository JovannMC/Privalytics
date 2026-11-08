import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import projectDefinitions from '#root/privalytics.config';
import {
	ProjectValuesError,
	sanitizeProjectValues,
	type AnalyticsProject,
	type ProjectField
} from './project-schema';

type DatabaseConnection = InstanceType<typeof Database>;

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS entities (
		project_slug TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		values_json TEXT NOT NULL CHECK (json_valid(values_json)),
		first_seen_at TEXT NOT NULL,
		last_seen_at TEXT NOT NULL,
		PRIMARY KEY (project_slug, entity_id)
	) WITHOUT ROWID;

	CREATE INDEX IF NOT EXISTS entities_last_seen_at
		ON entities (last_seen_at);

	CREATE TABLE IF NOT EXISTS entity_registry (
		project_slug TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		first_seen_at TEXT NOT NULL,
		PRIMARY KEY (project_slug, entity_id)
	) WITHOUT ROWID;

	CREATE TABLE IF NOT EXISTS daily_activity (
		project_slug TEXT NOT NULL,
		activity_date TEXT NOT NULL,
		entity_count INTEGER NOT NULL CHECK (entity_count >= 0),
		PRIMARY KEY (project_slug, activity_date)
	) WITHOUT ROWID;

	INSERT OR IGNORE INTO entity_registry (project_slug, entity_id, first_seen_at)
		SELECT project_slug, entity_id, first_seen_at FROM entities;
`;

let connection: DatabaseConnection | undefined;

function databasePath(): string {
	const configuredPath = process.env.DATABASE_PATH?.trim();
	if (configuredPath === '') throw new Error('DATABASE_PATH must not be empty');
	const path = configuredPath || './data/privalytics.sqlite';
	return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function initDatabase(): DatabaseConnection {
	if (connection) return connection;

	const path = databasePath();
	mkdirSync(dirname(path), { recursive: true });

	const database = new Database(path);
	try {
		database.pragma('journal_mode = WAL');
		database.pragma('foreign_keys = ON');
		database.pragma('busy_timeout = 5000');
		database.exec(SCHEMA);
		connection = database;
		return database;
	} catch (error) {
		database.close();
		throw error;
	}
}

export interface EntityReport {
	projectSlug: string;
	entityId: string;
	values: unknown;
	reportedAt?: Date;
}

export function saveEntityReport(report: EntityReport): void {
	const project = getProject(report.projectSlug);
	if (!project) throw new Error(`Unknown project "${report.projectSlug}"`);
	if (!report.entityId) throw new Error('Entity ID is required');

	const values = sanitizeProjectValues(project, report.values);
	const reportedAt = report.reportedAt ?? new Date();
	if (!Number.isFinite(reportedAt.getTime()))
		throw new ProjectValuesError('Report time must be valid');

	const timestamp = reportedAt.toISOString();
	const activityDate = timestamp.slice(0, 10);
	const database = initDatabase();

	database.transaction(() => {
		database
			.prepare(
				'INSERT OR IGNORE INTO entity_registry (project_slug, entity_id, first_seen_at) VALUES (?, ?, ?)'
			)
			.run(project.slug, report.entityId, timestamp);

		const previous = database
			.prepare('SELECT last_seen_at FROM entities WHERE project_slug = ? AND entity_id = ?')
			.get(project.slug, report.entityId) as { last_seen_at: string } | undefined;
		const firstReportToday = previous?.last_seen_at.slice(0, 10) !== activityDate;

		database
			.prepare(
				`
				INSERT INTO entities (
					project_slug, entity_id, values_json, first_seen_at, last_seen_at
				)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT (project_slug, entity_id) DO UPDATE SET
					values_json = excluded.values_json,
					last_seen_at = excluded.last_seen_at
			`
			)
			.run(project.slug, report.entityId, JSON.stringify(values), timestamp, timestamp);

		if (firstReportToday) {
			database
				.prepare(
					`
					INSERT INTO daily_activity (project_slug, activity_date, entity_count)
					VALUES (?, ?, 1)
					ON CONFLICT (project_slug, activity_date) DO UPDATE SET
						entity_count = daily_activity.entity_count + 1
				`
				)
				.run(project.slug, activityDate);
		}
	})();
}

export function getProjectSummary(
	projectSlug: string,
	days: number,
	now = new Date()
): ProjectSummary | undefined {
	const project = getProject(projectSlug);
	if (!project) return undefined;
	if (!Number.isFinite(now.getTime())) throw new Error('Summary time must be valid');
	if (!Number.isSafeInteger(days) || days < 1)
		throw new Error('Summary days must be a positive integer');

	// "active" entities are those that have reported in the last 30 days
	// TODO: configurable?
	const database = initDatabase();
	const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
	const activeResult = database
		.prepare('SELECT COUNT(*) AS count FROM entities WHERE project_slug = ? AND last_seen_at >= ?')
		.get(project.slug, activeSince) as { count: number };
	const activeEntityCount = activeResult.count;
	const totalResult = database
		.prepare('SELECT COUNT(*) AS count FROM entity_registry WHERE project_slug = ?')
		.get(project.slug) as { count: number };
	const totalEntityCount = totalResult.count;

	const fields = project.fields.map((field) => {
		const multipleEnum = field.type === 'enum' && field.multiple === true;
		const jsonPath = `$.${JSON.stringify(field.key)}`;
		const rows = multipleEnum
			? (database
					.prepare(
						`
						SELECT field_value.value, field_value.type, COUNT(*) AS count
						FROM entities, json_each(entities.values_json, ?) AS field_value
						WHERE entities.project_slug = ? AND entities.last_seen_at >= ?
						GROUP BY field_value.value, field_value.type
					`
					)
					.all(jsonPath, project.slug, activeSince) as FieldCountRow[])
			: (database
					.prepare(
						`
				SELECT value, type, COUNT(*) AS count
				FROM entities, json_each(entities.values_json)
				WHERE entities.project_slug = ?
					AND entities.last_seen_at >= ?
					AND json_each.key = ?
				GROUP BY value, type
			`
					)
					.all(project.slug, activeSince, field.key) as FieldCountRow[]);

		const counts = new Map<string, number>();
		for (const row of rows) {
			const isTrue = row.type === 'true';
			const isFalse = row.type === 'false';
			const isNumber = row.type === 'integer' || row.type === 'real';
			if (!isTrue && !isFalse && !isNumber && typeof row.value !== 'string') continue;

			const key = isTrue ? 'true' : isFalse ? 'false' : String(row.value);
			counts.set(key, row.count);
		}

		const reportingEntities = multipleEnum
			? (
					database
						.prepare(
							`SELECT COUNT(*) AS count FROM entities
							 WHERE project_slug = ? AND last_seen_at >= ?
							 AND json_type(values_json, ?) IS NOT NULL`
						)
						.get(project.slug, activeSince, jsonPath) as { count: number }
				).count
			: [...counts.values()].reduce((sum, count) => sum + count, 0);
		const coveragePercent =
			activeEntityCount === 0 ? 0 : Math.round((reportingEntities / activeEntityCount) * 100);

		return {
			key: field.key,
			label: field.label,
			type: field.type,
			multiple: multipleEnum,
			required: field.required,
			reportingEntities,
			coveragePercent,
			distribution: zeroCountDistribution(field, counts)
		};
	});

	// daily activity count for last `days` days
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const activityEndDate = today.toISOString().slice(0, 10);
	const firstDay = new Date(today);
	firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
	if (!Number.isFinite(firstDay.getTime())) throw new Error('Summary day range is too large');
	const activityStartDate = firstDay.toISOString().slice(0, 10);
	const activityRows = database
		.prepare(
			`
			SELECT activity_date, entity_count AS count
			FROM daily_activity
			WHERE project_slug = ? AND activity_date >= ?
			ORDER BY activity_date
		`
		)
		.all(project.slug, activityStartDate) as {
		activity_date: string;
		count: number;
	}[];
	const dailyActivity = activityRows.map(({ activity_date, count }) => ({
		date: activity_date,
		entityCount: count
	}));

	return {
		project: { slug: project.slug, title: project.title, description: project.description },
		totalEntityCount,
		activeEntityCount,
		activityDays: days,
		activityStartDate,
		activityEndDate,
		fields,
		dailyActivity
	};
}

export interface ProjectSummary {
	project: Pick<AnalyticsProject, 'slug' | 'title' | 'description'>;
	totalEntityCount: number;
	activeEntityCount: number;
	activityDays: number;
	activityStartDate: string;
	activityEndDate: string;
	fields: {
		key: string;
		label: string;
		type: ProjectField['type'];
		multiple: boolean;
		required: boolean;
		reportingEntities: number;
		coveragePercent: number;
		distribution: { value: string | number | boolean; label: string; count: number }[];
	}[];
	dailyActivity: { date: string; entityCount: number }[];
}

function getProject(slug: string): AnalyticsProject | undefined {
	return projectDefinitions.find((project) => project.slug === slug);
}

function zeroCountDistribution(field: ProjectField, counts: Map<string, number>) {
	if (field.type === 'enum') {
		return field.options.map(({ value, label }) => ({
			value,
			label,
			count: counts.get(value) ?? 0
		}));
	}

	if (field.type === 'boolean') {
		return [false, true].map((value) => ({
			value,
			label: value ? 'Enabled' : 'Disabled',
			count: counts.get(String(value)) ?? 0
		}));
	}

	// put the most common value first then sort numbers numerically and other values naturally
	return [...counts.entries()]
		.map(([value, count]) => ({ value, label: value, count }))
		.sort(
			(a, b) =>
				b.count - a.count ||
				(field.type === 'number'
					? Number(a.value) - Number(b.value)
					: a.value.localeCompare(b.value, undefined, { numeric: true }))
		);
}

interface FieldCountRow {
	type: string;
	value: string | number;
	count: number;
}
