// Prism's component files ship without types. The core file exports the same
// API as the package root, and every other component only registers a grammar.

declare module 'prismjs/components/prism-core.js' {
	const prism: typeof import('prismjs');
	export default prism;
}

declare module 'prismjs/components/prism-*.js';

declare module 'prism-svelte';
