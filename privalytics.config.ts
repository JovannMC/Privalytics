import type { AnalyticsProject } from './src/lib/server/project-schema';

// example project ig, lol
const projects = [
	{
		slug: 'slimetora',
		title: 'SlimeTora',
		description: 'A middleware program that connects the HaritoraX trackers to the SlimeVR Server',
		fields: [{ type: 'version', key: 'appVersion', label: 'App version', required: true }]
	}
] satisfies AnalyticsProject[];

export default projects;
