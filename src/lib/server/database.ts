import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import projectDefinitions from '../../../privalytics.config';
import { ProjectValuesError, sanitizeProjectValues } from './project-schema';

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

	CREATE TABLE IF NOT EXISTS entity_activity (
		project_slug TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		activity_date TEXT NOT NULL,
		PRIMARY KEY (project_slug, entity_id, activity_date),
		FOREIGN KEY (project_slug, entity_id)
			REFERENCES entities (project_slug, entity_id)
			ON DELETE CASCADE
	) WITHOUT ROWID;

	CREATE INDEX IF NOT EXISTS entity_activity_date
		ON entity_activity (activity_date);
`;

let connection: DatabaseConnection | undefined;

function databasePath(): string {
	const configuredPath = process.env.DATABASE_PATH?.trim();
	if (configuredPath === '') throw new Error('DATABASE_PATH must not be empty');
	const path = configuredPath || './data/privalytics.sqlite';
	return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function initializeDatabase(): DatabaseConnection {
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
	const project = projectDefinitions.find(({ slug }) => slug === report.projectSlug);
	if (!project) throw new Error(`Unknown project "${report.projectSlug}"`);
	if (!report.entityId) throw new Error('Entity ID is required');

	const values = sanitizeProjectValues(project, report.values);
	const reportedAt = report.reportedAt ?? new Date();
	if (!Number.isFinite(reportedAt.getTime()))
		throw new ProjectValuesError('Report time must be valid');
	const timestamp = reportedAt.toISOString();
	const activityDate = timestamp.slice(0, 10);
	const database = initializeDatabase();

	database.transaction(() => {
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

		database
			.prepare(
				'INSERT OR IGNORE INTO entity_activity (project_slug, entity_id, activity_date) VALUES (?, ?, ?)'
			)
			.run(project.slug, report.entityId, activityDate);
	})();
}
