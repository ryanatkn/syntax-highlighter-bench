import { assert, describe, test } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;

/** Every source file under a directory of `src/`, as paths relative to `src/`. */
const list_files = (dir: string): Array<string> =>
	readdirSync(join(SRC, dir), { recursive: true, encoding: 'utf8' })
		.filter((file) => /\.(ts|svelte)$/.test(file))
		.map((file) => join(dir, file));

/**
 * An import of the harness in any form: `from`, a side-effect import, a dynamic
 * import, or an import type, quoted any way. A url in prose is not one.
 */
const HARNESS_IMPORT = /(?:\bfrom\s+|\bimport\s*\(?\s*)['"`][^'"`]*\/bench\/[^'"`]*['"`]/;

/**
 * The module specifiers a file loads at runtime: every static import and
 * `export … from` but the type-only ones, and every dynamic import. A type
 * written as `import('…')` reads as a dynamic import here, which errs on the
 * side of catching too much.
 */
const to_runtime_imports = (file: string): Array<string> => {
	const source = readFileSync(join(SRC, file), 'utf8');
	return [
		...source.matchAll(/^\s*import\s+(?!type\b)(?:[^'"`]*?\bfrom\s+)?['"`]([^'"`]+)['"`]/gm),
		...source.matchAll(/^\s*export\s+(?!type\b)[^'"`;]*?\bfrom\s+['"`]([^'"`]+)['"`]/gm),
		...source.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g)
	].map((match) => match[1]!);
};

const SITE_FILES = [...list_files('lib'), ...list_files('routes')];

/** The modules that only a server load runs, at build time. */
const is_server_only = (file: string): boolean =>
	file.startsWith('lib/server/') ||
	file === 'lib/site_results.ts' ||
	file === 'lib/results_schema.ts' ||
	file.endsWith('.server.ts');

describe('what the site imports', () => {
	test('the harness check catches every way of importing', () => {
		for (const source of [
			"import { x } from '../../bench/run.ts';",
			"import '../../bench/run.ts';",
			"await import('../../bench/run.ts');",
			'await import(`../../bench/run.ts`);',
			"const x: import('../../bench/run.ts').X = 1;",
			"export { x } from '../../bench/run.ts';"
		]) {
			assert.match(source, HARNESS_IMPORT);
		}
		assert.notMatch("const url = 'https://a.fuz.dev/blob/main/bench/corpus';", HARNESS_IMPORT);
	});

	test('the runtime imports of a file include its dynamic imports and its re-exports', () => {
		const dir = mkdtempSync(join(tmpdir(), 'site_imports_'));
		try {
			writeFileSync(
				join(dir, 'probe.ts'),
				[
					"import type { A } from './type_only.ts';",
					"import { b } from './static.ts';",
					"import './side_effect.ts';",
					"export { c } from './reexport.ts';",
					"export type { D } from './type_reexport.ts';",
					"export const e = (): Promise<unknown> => import('./dynamic.ts');",
					'export const f = (): Promise<unknown> => import(`./template.ts`);'
				].join('\n')
			);
			assert.deepStrictEqual(to_runtime_imports(relative(SRC, join(dir, 'probe.ts'))).sort(), [
				'./dynamic.ts',
				'./reexport.ts',
				'./side_effect.ts',
				'./static.ts',
				'./template.ts'
			]);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});

	test('finds the files and their imports', () => {
		assert.include(SITE_FILES, 'lib/matrix.ts');
		assert.include(SITE_FILES, 'routes/(site)/results/+page.svelte');
		assert.include(to_runtime_imports('lib/site_results.ts'), './results_schema.ts');
		assert.notInclude(to_runtime_imports('lib/matrix.ts'), './results_schema.ts');
	});

	test('nothing under src/lib or src/routes imports the harness', () => {
		for (const file of SITE_FILES) {
			const source = readFileSync(join(SRC, file), 'utf8');
			assert.notMatch(source, HARNESS_IMPORT, file);
		}
	});

	test('only a server load reads a results file or the test fixtures', () => {
		for (const file of SITE_FILES) {
			if (is_server_only(file)) continue;
			const source = readFileSync(join(SRC, file), 'utf8');
			assert.notMatch(source, /fixture_run|node:fs/, file);
			for (const specifier of to_runtime_imports(file)) {
				assert.notMatch(
					specifier,
					/\/server\/|\/test\/|site_results\.ts$/,
					`${file}: ${specifier}`
				);
				// `virtual:pkg.json` is a build-time module, not a file
				assert.ok(
					specifier.startsWith('virtual:') || !specifier.endsWith('.json'),
					`${file}: ${specifier}`
				);
			}
		}
	});

	test('no page loads the schema at runtime: it validates at build time, in the server loads', () => {
		for (const file of SITE_FILES) {
			if (is_server_only(file)) continue;
			for (const specifier of to_runtime_imports(file)) {
				assert.notMatch(specifier, /results_schema\.ts$/, file);
				assert.notStrictEqual(specifier, 'zod', file);
			}
		}
	});
});
