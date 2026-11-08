import type { RequestHandler } from './$types';
import { getProjectSummary } from '#lib/server/database';

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const GET: RequestHandler = ({ params, url }) => {
	const requestedDays = url.searchParams.get('days');
	const days = requestedDays === null ? 30 : Number(requestedDays);
	if (!Number.isSafeInteger(days) || days < 1)
		return Response.json(
			{ error: { code: 'invalid_days', message: 'days must be a positive integer' } },
			{ status: 400, headers: CORS_HEADERS }
		);

	const now = new Date();
	const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
	if (!Number.isFinite(firstDay.getTime()))
		return Response.json(
			{ error: { code: 'invalid_days', message: 'days is too large' } },
			{ status: 400, headers: CORS_HEADERS }
		);

	const summary = getProjectSummary(params.slug, days);
	if (!summary)
		return Response.json(
			{ error: { code: 'unknown_project', message: 'Project not found' } },
			{ status: 404, headers: CORS_HEADERS }
		);

	return Response.json(summary, {
		headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=60' }
	});
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: CORS_HEADERS });
