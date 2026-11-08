import type { PageServerLoad } from './$types';
import projectDefinitions from '#root/privalytics.config';
import { getProjectSummary } from '#lib/server/database';

export const load: PageServerLoad = ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'public, max-age=60' });

	return {
		projects: projectDefinitions.map((project) => {
			const summary = getProjectSummary(project.slug, 30);
			if (!summary) throw new Error(`Project "${project.slug}" was not found`);
			return { ...project, summary };
		})
	};
};
