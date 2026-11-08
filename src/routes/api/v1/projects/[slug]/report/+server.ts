import type { RequestHandler } from './$types';
import { validate as isUuid, version as uuidVersion } from 'uuid';
import projectDefinitions from '#root/privalytics.config';
import { saveEntityReport } from '#lib/server/database';
import { ProjectValuesError } from '#lib/server/project-schema';
import { checkLimitEntityReport, checkLimitProjectReport } from '#lib/server/rate-limit';

const MAX_BODY_BYTES = 16 * 1024;
const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

class RequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

function errorResponse(
	status: number,
	code: string,
	message: string,
	retryAfter?: number
): Response {
	const headers = {
		...CORS_HEADERS,
		...(retryAfter === undefined ? {} : { 'Retry-After': String(retryAfter) })
	};
	return Response.json({ error: { code, message } }, { status, headers });
}

async function readJson(request: Request): Promise<unknown> {
	const contentLength = request.headers.get('content-length');
	if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES)
		throw new RequestError(413, 'payload_too_large', 'Request body exceeds 16 KiB');

	if (!request.body) throw new RequestError(400, 'invalid_json', 'A JSON request body is required');

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			size += value.byteLength;
			if (size > MAX_BODY_BYTES) {
				await reader.cancel();
				throw new RequestError(413, 'payload_too_large', 'Request body exceeds 16 KiB');
			}

			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	try {
		return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
	} catch {
		throw new RequestError(400, 'invalid_json', 'Request body must contain valid JSON');
	}
}

export const POST: RequestHandler = async ({ params, request }) => {
	const project = projectDefinitions.find(({ slug }) => slug === params.slug);
	if (!project) return errorResponse(404, 'unknown_project', 'Project not found');

	const projectLimit = checkLimitProjectReport(project.slug);
	if (!projectLimit.allowed)
		return errorResponse(
			429,
			'rate_limited',
			'Project report limit exceeded',
			projectLimit.retryAfter
		);

	if (
		request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
		'application/json'
	)
		return errorResponse(415, 'unsupported_media_type', 'Content-Type must be application/json');

	let body: unknown;
	try {
		body = await readJson(request);
	} catch (error) {
		if (error instanceof RequestError)
			return errorResponse(error.status, error.code, error.message);
		return errorResponse(400, 'invalid_json', 'Request body must contain valid JSON');
	}

	if (typeof body !== 'object' || body === null || Array.isArray(body))
		return errorResponse(400, 'invalid_request', 'Request body must be an object');

	const entityId = (body as Record<string, unknown>).entityId;
	if (typeof entityId !== 'string' || !isUuid(entityId) || uuidVersion(entityId) !== 4)
		return errorResponse(400, 'invalid_entity_id', 'entityId must be UUID v4');

	const entityLimit = checkLimitEntityReport(project.slug, entityId);
	if (!entityLimit.allowed)
		return errorResponse(
			429,
			'rate_limited',
			'Entity report limit exceeded',
			entityLimit.retryAfter
		);

	try {
		saveEntityReport({
			projectSlug: project.slug,
			entityId,
			values: (body as Record<string, unknown>).values,
			reportedAt: new Date()
		});
	} catch (error) {
		if (error instanceof ProjectValuesError)
			return errorResponse(400, 'invalid_values', error.message);
		throw error;
	}

	return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });
