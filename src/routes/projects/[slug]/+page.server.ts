import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import projectDefinitions from '#root/privalytics.config';
import { getProjectSummary } from '#lib/server/database';

export const load: PageServerLoad = ({ params, url, setHeaders }) => {
	const project = projectDefinitions.find((definition) => definition.slug === params.slug);
	if (!project) error(404, 'Project not found');

	const requestedDays = url.searchParams.get('days');
	const days = requestedDays === null ? 30 : Number(requestedDays);
	if (!Number.isSafeInteger(days) || days < 1) error(400, 'Days must be a positive integer');

	const now = new Date();
	const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	firstDay.setUTCDate(firstDay.getUTCDate() - days + 1);
	if (!Number.isFinite(firstDay.getTime())) error(400, 'Days is too large');

	const summary = getProjectSummary(project.slug, days);
	if (!summary) error(404, 'Project not found');

	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { project, summary, days };
};
