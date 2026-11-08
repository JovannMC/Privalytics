import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

const validEnvs = ['DATABASE_PATH', 'PROJECT_REPORT_RATE_LIMIT', 'ENTITY_REPORT_RATE_LIMIT'];

export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
	for (const name of validEnvs) {
		if (process.env[name] === undefined && env[name] !== undefined) process.env[name] = env[name];
	}

	return {
		server: {
			host: env.HOST ?? '127.0.0.1',
			port: Number(env.PORT ?? 5174),
			strictPort: true
		},
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
			})
		]
	};
});
