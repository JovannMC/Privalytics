import type { AnalyticsProject } from './src/lib/server/project-schema';

// example project ig, lol
const projects = [
	{
		slug: 'slimetora',
		title: 'SlimeTora',
		description: 'A middleware program that connects the HaritoraX trackers to the SlimeVR Server',
		fields: [
			{ type: 'version', key: 'appVersion', label: 'App version', required: true },
			{ type: 'string', key: 'operatingSystem', label: 'Operating system', required: true },
			{
				type: 'enum',
				multiple: true,
				key: 'trackerModel',
				label: 'Tracker model',
				required: true,
				options: [
					{ value: 'x2', label: 'HaritoraX 2' },
					{ value: 'wireless', label: 'HaritoraX Wireless' },
					{ value: '1.1b', label: 'HaritoraX 1.1b' },
					{ value: '1.1', label: 'HaritoraX 1.1' },
					{ value: '1.0', label: 'HaritoraX 1.0' }
				]
			},
			{ type: 'number', key: 'trackerCount', label: 'Tracker count', required: true },
			{
				type: 'enum',
				multiple: true,
				key: 'connectionMode',
				label: 'Connection mode',
				required: true,
				options: [
					{ value: 'gx6', label: 'GX6 dongle' },
					{ value: 'gx2', label: 'GX2 dongle' },
					{ value: 'serial', label: 'Serial' },
					{ value: 'ble', label: 'Bluetooth LE' }
				]
			}
		]
	}
] satisfies AnalyticsProject[];

export default projects;
