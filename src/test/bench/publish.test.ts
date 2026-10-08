import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { LATEST_FILE_NAME, main, publish_results } from '../../../bench/publish.ts';
import { load_fixture_json, to_smoke } from '../site_test_helpers.ts';

// a results directory of its own: the repository's `results/` is never touched

const FIXTURE_TEXT = readFileSync(
	new URL('../fixtures/results/fixture_run.json', import.meta.url),
	'utf8'
);

/** Holds the results directory and a sibling of it. */
let root: string;
let dir: string;
let latest: string;

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), 'bench_publish_test_')));
	dir = join(root, 'results');
	mkdirSync(dir);
	latest = join(dir, LATEST_FILE_NAME);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const write = (name: string, content: string): string => {
	const path = join(dir, name);
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, content);
	return path;
};

const assert_refused = (source: string, expected: RegExp): void => {
	const published = publish_results(source, dir);
	assert.ok(!published.ok);
	assert.match(published.message, expected);
	assert.ok(!existsSync(latest));
};

describe('publish_results', () => {
	test('copies a publishable run byte for byte, over the one before, leaving nothing else', () => {
		write(LATEST_FILE_NAME, '{"an earlier run": true}\n');
		const source = write('2026-01-01_box.json', FIXTURE_TEXT);
		assert.deepStrictEqual(publish_results(source, dir), { ok: true, path: latest });
		assert.strictEqual(readFileSync(latest, 'utf8'), FIXTURE_TEXT);
		assert.deepStrictEqual(readdirSync(dir).sort(), ['2026-01-01_box.json', LATEST_FILE_NAME]);
	});

	test('refuses a run that is not publishable, saying why', () => {
		assert_refused(
			write('smoke.json', JSON.stringify(to_smoke(load_fixture_json()))),
			/is not a publishable run: kind: smoke/
		);
		const unfloored = load_fixture_json();
		unfloored.meta.noise_floor = null;
		assert_refused(write('unfloored.json', JSON.stringify(unfloored)), /noise floor: none/);
	});

	test('refuses a file in scratch/, whatever it holds, and a link to one', () => {
		const scratch = write('scratch/full_box.json', FIXTURE_TEXT);
		assert_refused(scratch, /is in scratch\//);
		const link = join(dir, 'linked.json');
		symlinkSync(scratch, link);
		assert_refused(link, /linked\.json is in scratch\//);
	});

	test('refuses a file outside the results directory', () => {
		const sibling = join(root, 'elsewhere.json');
		writeFileSync(sibling, FIXTURE_TEXT);
		assert_refused(sibling, /is not in the results directory/);
	});

	test('refuses latest.json itself, by its name or through a link', () => {
		write(LATEST_FILE_NAME, FIXTURE_TEXT);
		const link = join(dir, 'run.json');
		symlinkSync(latest, link);
		for (const source of [latest, link]) {
			const published = publish_results(source, dir);
			assert.ok(!published.ok);
			assert.match(published.message, /is latest\.json itself/);
		}
		assert.strictEqual(readFileSync(latest, 'utf8'), FIXTURE_TEXT);
	});

	test('takes a results directory given through a link', () => {
		const linked_dir = join(root, 'linked_results');
		symlinkSync(dir, linked_dir);
		const source = write('2026-01-01_box.json', FIXTURE_TEXT);
		assert.deepStrictEqual(publish_results(source, linked_dir), { ok: true, path: latest });
		assert.strictEqual(readFileSync(latest, 'utf8'), FIXTURE_TEXT);
	});

	test('refuses what is not a results file, or is not there', () => {
		assert_refused(write('broken.json', '{"meta": {}}'), /is not a results file/);
		assert_refused(write('not_json.json', 'not json'), /is not a results file/);
		assert_refused(join(dir, 'missing.json'), /can't read/);
	});
});

describe('main', () => {
	test('exits 2 on a refusal or a bad invocation, and 0 once published', () => {
		assert.strictEqual(main([], dir), 2);
		assert.strictEqual(main(['a.json', 'b.json'], dir), 2);
		assert.strictEqual(main([join(dir, 'missing.json')], dir), 2);
		assert.strictEqual(main([write('run.json', FIXTURE_TEXT)], dir), 0);
		assert.strictEqual(readFileSync(latest, 'utf8'), FIXTURE_TEXT);
		// a path relative to the working directory, as the command is typed
		rmSync(latest);
		assert.strictEqual(main([relative(process.cwd(), join(dir, 'run.json'))], dir), 0);
		assert.strictEqual(readFileSync(latest, 'utf8'), FIXTURE_TEXT);
	});
});
