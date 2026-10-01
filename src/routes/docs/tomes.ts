import type { Tome } from '@fuzdev/fuz_ui/tome.ts';
import OverviewPage from './overview/+page.svelte';
import AdaptersPage from './adapters/+page.svelte';
import CorpusPage from './corpus/+page.svelte';
import LanguagesPage from './languages/+page.svelte';
import MethodPage from './method/+page.svelte';
import DeterministicPage from './deterministic/+page.svelte';
import ResultsPage from './results/+page.svelte';
import DesignPage from './design/+page.svelte';
import ApiPage from './api/+page.svelte';
import LibraryPage from './library/+page.svelte';

export const tomes: Array<Tome> = [
	{
		slug: 'overview',
		category: 'guide',
		Component: OverviewPage,
		related_tomes: [
			'adapters',
			'corpus',
			'languages',
			'method',
			'deterministic',
			'results',
			'design'
		],
		related_modules: [],
		related_declarations: []
	},
	{
		slug: 'adapters',
		category: 'guide',
		Component: AdaptersPage,
		related_tomes: ['corpus', 'languages', 'method', 'deterministic', 'results'],
		related_modules: [],
		related_declarations: ['BenchLibrary', 'BenchCoverageEntry']
	},
	{
		slug: 'corpus',
		category: 'guide',
		Component: CorpusPage,
		related_tomes: ['adapters', 'method', 'results'],
		related_modules: [],
		related_declarations: ['BenchInput', 'BenchProvenance']
	},
	{
		slug: 'languages',
		title: 'languages and sets',
		category: 'guide',
		Component: LanguagesPage,
		related_tomes: ['adapters', 'deterministic', 'results'],
		related_modules: [],
		related_declarations: ['BenchLang', 'BenchSet']
	},
	{
		slug: 'method',
		category: 'guide',
		Component: MethodPage,
		related_tomes: ['adapters', 'corpus', 'deterministic', 'results', 'design'],
		related_modules: [],
		related_declarations: ['BenchCellValue', 'BenchRun', 'BenchNoiseFloor', 'BenchAnchor']
	},
	{
		slug: 'deterministic',
		title: 'deterministic metrics',
		category: 'guide',
		Component: DeterministicPage,
		related_tomes: ['adapters', 'languages', 'method', 'results'],
		related_modules: [],
		related_declarations: [
			'BenchBundleSizes',
			'BenchByteSizes',
			'BenchBundleEntry',
			'BenchBundler',
			'BenchCellOutput',
			'BenchCoverageEntry'
		]
	},
	{
		slug: 'results',
		title: 'results file',
		category: 'guide',
		Component: ResultsPage,
		related_tomes: ['languages', 'corpus', 'method', 'deterministic', 'design'],
		related_modules: ['results_schema.ts'],
		related_declarations: ['BenchResults', 'parse_bench_results', 'bench_results_is_publishable']
	},
	{
		slug: 'design',
		category: 'guide',
		Component: DesignPage,
		related_tomes: ['overview', 'method', 'deterministic', 'results'],
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
