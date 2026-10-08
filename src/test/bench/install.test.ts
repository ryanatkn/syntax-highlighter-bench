import { assert, describe, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { measure_install, measure_installs, to_closure_hash } from '../../../bench/install.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';

/** Writes a package into a directory's `node_modules`, with a manifest and files. */
const write_package = (
	dir: string,
	name: string,
	manifest: Record<string, unknown> = {},
	files: Record<string, string> = {}
): string => {
	const package_dir = join(dir, 'node_modules', name);
	mkdirSync(package_dir, { recursive: true });
	writeFileSync(
		join(package_dir, 'package.json'),
		JSON.stringify({ name, version: '1.0.0', ...manifest })
	);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(package_dir, path, '..'), { recursive: true });
		writeFileSync(join(package_dir, path), content);
	}
	return package_dir;
};

const manifest_bytes = (name: string, manifest: Record<string, unknown> = {}): number =>
	JSON.stringify({ name, version: '1.0.0', ...manifest }).length;

const with_dir = (fn: (dir: string) => void): void => {
	const dir = mkdtempSync(join(tmpdir(), 'install-test-'));
	try {
		fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

describe('measure_install', () => {
	test('follows dependencies and required peers, each package once', () => {
		with_dir((dir) => {
			const a = {
				dependencies: { b: '1', c: '1' },
				peerDependencies: { d: '1', e: '1' },
				peerDependenciesMeta: { e: { optional: true } },
				devDependencies: { f: '1' }
			};
			write_package(dir, 'a', a, { 'index.js': 'abc', 'lib/x.js': 'de' });
			write_package(dir, 'b', { dependencies: { c: '1' } });
			write_package(dir, 'c');
			write_package(dir, 'd');
			write_package(dir, 'e');
			write_package(dir, 'f');
			const bytes =
				manifest_bytes('a', a) +
				5 +
				manifest_bytes('b', { dependencies: { c: '1' } }) +
				manifest_bytes('c') +
				manifest_bytes('d');
			assert.deepStrictEqual(measure_install(['a'], dir), {
				packages: 4,
				files: 6,
				bytes,
				closure: to_closure_hash(['a@1.0.0', 'b@1.0.0', 'c@1.0.0', 'd@1.0.0'])
			});
		});
	});

	test('resolves a nested version from the package that needs it, apart from its own files', () => {
		with_dir((dir) => {
			const a_dir = write_package(dir, 'a', { dependencies: { b: '2' } });
			write_package(dir, 'b', {}, { 'one.js': 'x' });
			write_package(a_dir, 'b', { version: '2' }, { 'two.js': 'yy' });
			const install = measure_install(['a'], dir);
			assert.strictEqual(install.packages, 2);
			// the hoisted b is not in the closure, and a's nested node_modules is not a's files
			assert.strictEqual(install.files, 3);
		});
	});

	test('counts a package installed twice at the same version once', () => {
		with_dir((dir) => {
			const a_dir = write_package(dir, 'a', { version: '1', dependencies: { b: '1', c: '1' } });
			write_package(dir, 'b', { version: '1', dependencies: { c: '1' } });
			write_package(dir, 'c', { version: '1' });
			// a's own copy of c, the same version as the hoisted one
			write_package(a_dir, 'c', { version: '1' }, { 'extra.js': 'x' });
			const install = measure_install(['a'], dir);
			assert.strictEqual(install.packages, 3);
			assert.strictEqual(install.closure, to_closure_hash(['a@1', 'b@1', 'c@1']));
		});
	});

	test('skips an optional dependency that is missing or gated by platform', () => {
		with_dir((dir) => {
			const a = { optionalDependencies: { gated: '1', missing: '1', plain: '1' } };
			write_package(dir, 'a', { ...a, dependencies: { gated: '1' } });
			write_package(dir, 'gated', { os: ['linux'] });
			write_package(dir, 'plain');
			assert.strictEqual(measure_install(['a'], dir).packages, 2);
		});
	});

	test('throws for a required package that is missing, and for a symbolic link', () => {
		with_dir((dir) => {
			write_package(dir, 'a', { dependencies: { missing: '1' } });
			assert.throws(() => measure_install(['a'], dir), /"missing", which a needs/);
			const b_dir = write_package(dir, 'b');
			symlinkSync(join(b_dir, 'package.json'), join(b_dir, 'link.json'));
			assert.throws(() => measure_install(['b'], dir), /neither a file nor a directory/);
		});
	});
});

describe('measure_installs', () => {
	test('counts every library of the roster whole, on its own', () => {
		const install = measure_installs(ADAPTERS);
		assert.deepStrictEqual(
			Object.keys(install),
			ADAPTERS.map((adapter) => adapter.id)
		);
		// the two Shiki adapters install one package
		assert.deepStrictEqual(install.shiki_js, install.shiki_wasm);
		for (const adapter of ADAPTERS) {
			const own = install[adapter.id]!;
			assert.ok(own.packages >= 1 + (adapter.extra_packages?.length ?? 0), adapter.id);
		}
	});
});
