import { assert, describe, test } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	SITE_DETERMINISTIC_PATH,
	SITE_FIXTURE_ENV,
	SITE_FIXTURE_PATH,
	SITE_LATEST_PATH,
	load_site_results,
	site_fixture_is_enabled
} from '$lib/server/site_results_load.ts';
import {
	load_deterministic_json,
	load_fixture_json,
	to_calibration,
	to_smoke
} from '../site_test_helpers.ts';

const REPO = process.cwd();

/** The fixture's machine name, which says its numbers are invented. */
const FIXTURE_MACHINE = load_fixture_json().meta.machine!.name;

/** A directory holding the deterministic results and, when given, a latest run. No fixture. */
const create_results_dir = (latest?: unknown): string => {
	const dir = mkdtempSync(join(tmpdir(), 'site_results_'));
	mkdirSync(join(dir, 'results'));
	cpSync(join(REPO, SITE_DETERMINISTIC_PATH), join(dir, SITE_DETERMINISTIC_PATH));
	if (latest !== undefined) writeFileSync(join(dir, SITE_LATEST_PATH), JSON.stringify(latest));
	return dir;
};

describe('site_fixture_is_enabled', () => {
	test('only the variable set to exactly 1 enables the fixture', () => {
		assert.ok(site_fixture_is_enabled({ [SITE_FIXTURE_ENV]: '1' }));
		for (const value of [undefined, '', '0', 'true', 'yes', ' 1', '11']) {
			assert.ok(!site_fixture_is_enabled({ [SITE_FIXTURE_ENV]: value }), `"${value}"`);
		}
		assert.ok(!site_fixture_is_enabled({}));
		assert.ok(!site_fixture_is_enabled({ PUBLIC_RESULTS_FIXTURE: '1', FIXTURE: '1' }));
	});

	test('the tests themselves run without it', () => {
		assert.ok(!site_fixture_is_enabled(process.env));
	});
});

describe('load_site_results', () => {
	test('a default load of this repository holds real results and never the fixture', () => {
		const site = load_site_results({ dir: REPO, fixture: false });
		assert.notStrictEqual(site.source, 'fixture');
		assert.notStrictEqual(site.results.meta.machine?.name, FIXTURE_MACHINE);
		assert.notInclude(JSON.stringify(site.results), 'invented');
		// the committed deterministic file, as long as no run is published
		if (site.source === 'deterministic') {
			assert.deepStrictEqual(site.results, load_deterministic_json());
		}
	});

	test('a default load never opens the fixture file', () => {
		// a directory with no fixture file at all loads, so the file is not read
		const dir = create_results_dir();
		try {
			const site = load_site_results({ dir, fixture: false });
			assert.strictEqual(site.source, 'deterministic');
			// and asking for the fixture there fails, since it would have to be read
			assert.throws(() => load_site_results({ dir, fixture: true }), /ENOENT/);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});

	test('the fixture is rendered only when asked for', () => {
		const site = load_site_results({ dir: REPO, fixture: true });
		assert.strictEqual(site.source, 'fixture');
		assert.strictEqual(site.results.meta.machine!.name, FIXTURE_MACHINE);
		assert.deepStrictEqual(site.results, load_fixture_json());
		assert.include(SITE_FIXTURE_PATH, 'src/test/fixtures/');
	});

	test('a latest run in the results directory is rendered as published', () => {
		// the committed deterministic results are of other versions and another corpus than the
		// fixture run, so the run is a snapshot and says what has moved
		const dir = create_results_dir(load_fixture_json());
		try {
			const site = load_site_results({ dir, fixture: false });
			assert.strictEqual(site.source, 'published');
			assert.include(site.moved, 'the corpus changed');
		} finally {
			rmSync(dir, { recursive: true });
		}
	});

	const REFUSED: Array<[label: string, latest: () => unknown, says: RegExp]> = [
		['a smoke run', () => to_smoke(load_fixture_json()), /not a publishable run.*kind: smoke/],
		['a calibration', () => to_calibration(load_fixture_json()), /kind: calibrate/],
		[
			'a drifted run',
			() => ({
				...load_fixture_json(),
				meta: { ...load_fixture_json().meta, anchor: { drift: 0.05, stable: false } }
			}),
			/not a publishable run.*drifted by 5\.0%/
		],
		['the deterministic results themselves', load_deterministic_json, /it holds no timed run/],
		['a file that is not a results file', () => ({ cells: [] }), /invalid bench results/]
	];

	test.each(REFUSED)('%s as the latest run fails the load', (_label, latest, says) => {
		const dir = create_results_dir(latest());
		try {
			assert.throws(() => load_site_results({ dir, fixture: false }), says);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});
