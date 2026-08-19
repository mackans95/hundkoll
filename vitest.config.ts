import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately not the app's vite config: these tests cover pure modules
// with no Svelte or SvelteKit runtime in them, so only $lib needs resolving.
export default defineConfig({
	resolve: {
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	test: {
		include: ['tests/**/*.test.ts']
	}
});
