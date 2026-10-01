import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	MACHINE_LOCK_PATH,
	acquire_machine_lock,
	format_lock_holder,
	type LockHolder
} from '../../../bench/lock.ts';

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bench_lock_test_'));
	path = join(dir, 'bench.lock');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** The id of a process that has exited. */
const to_dead_pid = (): number => spawnSync(process.execPath, ['-e', '']).pid;

const write_holder = (holder: LockHolder): void => writeFileSync(path, JSON.stringify(holder));

describe('acquire_machine_lock', () => {
	test('takes a free lock and names its holder in the file', () => {
		const acquired = acquire_machine_lock('test run', path);
		assert.ok(acquired.ok);
		assert.strictEqual(acquired.lock.path, path);
		const holder: LockHolder = JSON.parse(readFileSync(path, 'utf8'));
		assert.strictEqual(holder.pid, process.pid);
		assert.strictEqual(holder.label, 'test run');
		assert.strictEqual(holder.cwd, process.cwd());
		assert.ok(!Number.isNaN(Date.parse(holder.started_at)));
	});

	test('refuses while a live process holds it, and names that process', () => {
		const first = acquire_machine_lock('first', path);
		assert.ok(first.ok);
		const second = acquire_machine_lock('second', path);
		assert.ok(!second.ok);
		assert.strictEqual(second.path, path);
		assert.ok(second.holder);
		assert.strictEqual(second.holder.pid, process.pid);
		assert.strictEqual(second.holder.label, 'first');
		// the refusal left the holder's lock alone
		assert.strictEqual(JSON.parse(readFileSync(path, 'utf8')).label, 'first');
	});

	test('takes over a lock whose process is gone', () => {
		write_holder({ pid: to_dead_pid(), label: 'crashed', cwd: '/', started_at: 'earlier' });
		const acquired = acquire_machine_lock('next', path);
		assert.ok(acquired.ok);
		assert.strictEqual(JSON.parse(readFileSync(path, 'utf8')).pid, process.pid);
	});

	test('refuses a lock it cannot read, rather than breaking it', () => {
		writeFileSync(path, 'not json');
		const acquired = acquire_machine_lock('next', path);
		assert.ok(!acquired.ok);
		assert.strictEqual(acquired.holder, null);
		assert.strictEqual(readFileSync(path, 'utf8'), 'not json');
	});

	test('release frees the lock, once', () => {
		const acquired = acquire_machine_lock('test run', path);
		assert.ok(acquired.ok);
		assert.strictEqual(acquired.lock.release(), true);
		assert.ok(!existsSync(path));
		// a later holder's lock is not removed by releasing again
		const next = acquire_machine_lock('next', path);
		assert.ok(next.ok);
		assert.strictEqual(acquired.lock.release(), true);
		assert.ok(existsSync(path));
	});

	test('release reports a lock that was taken over, and leaves the new holder alone', () => {
		const acquired = acquire_machine_lock('test run', path);
		assert.ok(acquired.ok);
		const other: LockHolder = { pid: 1, label: 'other', cwd: '/', started_at: 'later' };
		write_holder(other);
		assert.strictEqual(acquired.lock.release(), false);
		assert.deepStrictEqual(JSON.parse(readFileSync(path, 'utf8')), other);
		// and a lock that vanished was not held to the end either
		const again = acquire_machine_lock('again', join(dir, 'other.lock'));
		assert.ok(again.ok);
		rmSync(again.lock.path);
		assert.strictEqual(again.lock.release(), false);
	});

	test('the default path is one file for the whole machine', () => {
		assert.ok(MACHINE_LOCK_PATH.startsWith(tmpdir()));
	});
});

describe('format_lock_holder', () => {
	test('names the holder and the file', () => {
		const message = format_lock_holder(path, {
			pid: 4242,
			label: 'full run',
			cwd: '/somewhere',
			started_at: '2026-01-01T00:00:00.000Z'
		});
		assert.match(message, /pid 4242/);
		assert.match(message, /full run/);
		assert.ok(message.includes(path));
	});

	test('says what to do with a lock that names no one', () => {
		assert.ok(format_lock_holder(path, null).includes(path));
	});
});
