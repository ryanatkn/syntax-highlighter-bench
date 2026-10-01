import type { Tome } from '@fuzdev/fuz_ui/tome.ts';
import OverviewPage from './overview/+page.svelte';
import LanguagesPage from './languages/+page.svelte';
import ResultsPage from './results/+page.svelte';
import DesignPage from './design/+page.svelte';
import ApiPage from './api/+page.svelte';
import LibraryPage from './library/+page.svelte';

export const tomes: Array<Tome> = [
	{
		slug: 'overview',
		category: 'guide',
		Component: OverviewPage,
		related_tomes: ['languages', 'results', 'design'],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'languages',
		title: 'languages and sets',
		category: 'guide',
		Component: LanguagesPage,
		related_tomes: ['results'],
		related_modules: [],
		related_declarations: ['BenchLang', 'BenchSet']
	},
	{
		slug: 'results',
		title: 'results file',
		category: 'guide',
		Component: ResultsPage,
		related_tomes: ['languages', 'design'],
		related_modules: ['results_schema.ts'],
		related_declarations: ['BenchResults', 'parse_bench_results']
	},
	{
		slug: 'design',
		category: 'guide',
		Component: DesignPage,
		related_tomes: ['overview', 'results'],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'api',
		category: 'reference',
		Component: ApiPage,
		related_tomes: ['results'],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'library',
		category: 'reference',
		Component: LibraryPage,
		related_tomes: [],
		related_modules: [],
		related_declarations: []
	}
];
