import validSemver from 'semver/functions/valid';

export interface EnumOption {
	value: string;
	label: string;
}

interface FieldBase {
	key: string;
	label: string;
	required: boolean;
}

export type ProjectField =
	| (FieldBase & { type: 'boolean' })
	| (FieldBase & { type: 'enum'; options: readonly EnumOption[]; multiple?: true })
	| (FieldBase & { type: 'string' })
	| (FieldBase & { type: 'number' })
	| (FieldBase & { type: 'version' });

export interface AnalyticsProject {
	slug: string;
	title: string;
	description: string;
	fields: readonly ProjectField[];
}

export class ProjectValuesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectValuesError';
	}
}

export function sanitizeProjectValues(
	project: AnalyticsProject,
	input: unknown
): Record<string, string | number | boolean | string[]> {
	if (typeof input !== 'object' || input === null || Array.isArray(input))
		throw new ProjectValuesError('Values must be an object');

	const received = input as Record<string, unknown>;
	const values: Record<string, string | number | boolean | string[]> = {};

	for (const field of project.fields) {
		const value = received[field.key];
		if (value === undefined) {
			if (field.required) throw new ProjectValuesError(`Missing required field "${field.key}"`);
			continue;
		}

		if (field.type === 'boolean') {
			if (typeof value !== 'boolean')
				throw new ProjectValuesError(`Field "${field.key}" must be boolean`);
			values[field.key] = value;
			continue;
		}

		if (field.type === 'enum') {
			if (field.multiple) {
				if (
					!Array.isArray(value) ||
					value.length === 0 ||
					value.some((item) => typeof item !== 'string')
				)
					throw new ProjectValuesError(`Field "${field.key}" must be a non-empty array of strings`);
				if (new Set(value).size !== value.length)
					throw new ProjectValuesError(`Field "${field.key}" must not contain duplicate values`);
				if (value.some((item) => !field.options.some((option) => option.value === item)))
					throw new ProjectValuesError(`Field "${field.key}" has an unsupported value`);

				const selected = new Set(value);
				values[field.key] = field.options
					.filter((option) => selected.has(option.value))
					.map((option) => option.value);
				continue;
			}

			if (typeof value !== 'string')
				throw new ProjectValuesError(`Field "${field.key}" must be a string`);
			if (!field.options.some((option) => option.value === value))
				throw new ProjectValuesError(`Field "${field.key}" has an unsupported value`);
			values[field.key] = value;
			continue;
		}

		if (field.type === 'number') {
			if (typeof value !== 'number' || !Number.isFinite(value))
				throw new ProjectValuesError(`Field "${field.key}" must be a finite number`);
			values[field.key] = value;
			continue;
		}

		if (typeof value !== 'string')
			throw new ProjectValuesError(`Field "${field.key}" must be a string`);
		if (field.type === 'version' && validSemver(value) === null)
			throw new ProjectValuesError(`Field "${field.key}" must be a semantic version`);

		values[field.key] = value;
	}

	return values;
}
