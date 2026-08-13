import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Run the serverless function in Stockholm, next to the Supabase
			// project (eu-north-1). The default (iad1, US east) makes every
			// request cross the Atlantic twice: once to reach the function,
			// once more for each auth check and database query.
			adapter: adapter({ regions: ['arn1'] })
		})
	]
});
