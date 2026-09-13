import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Why not omit fallback: 404.html acts as a client-side SPA fallback for direct URL visits or reloads on GitHub Pages.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		// Why not hardcode base path: Enables seamless execution in both local dev (root) and GitHub Pages subpath deployment.
		paths: {
			base: process.argv.includes('dev') ? '' : process.env.BASE_PATH || ''
		}
	}
};

export default config;
