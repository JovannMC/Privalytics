import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
	if (process.env.DATABASE_PATH === undefined && env.DATABASE_PATH !== undefined)
		process.env.DATABASE_PATH = env.DATABASE_PATH;

	return {
		server: {
			host: env.HOST ?? '127.0.0.1',
			port: Number(env.PORT ?? 5173),
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
