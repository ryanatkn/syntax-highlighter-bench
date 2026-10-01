<script lang="ts">
	import 'virtual:fuz.css';
	import '@fuzdev/fuz_code/theme.css';
	import './style.css';

	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import { SiteState, site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import type { Snippet } from 'svelte';
	import pkg_json from 'virtual:pkg.json';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	// `repo_url` derives from `pkg_json`
	site_context.set(new SiteState({ pkg_json }));
</script>

<svelte:head>
	<title>syntax-highlighter-bench</title>
</svelte:head>

<ThemeRoot>
	{@render children()}
</ThemeRoot>
