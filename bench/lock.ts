/**
 * The machine lock: one measurement process at a time, machine-wide. Two timed
 * runs at once don't give two noisy results, they give two wrong ones, because
 * each changes the other's caches, frequency ceiling, and scheduling.
 *
 * The lock is a file at a fixed path under the OS temp directory, shared by
 * every checkout on the machine, created exclusively and naming its holder. A
 * holder whose process is gone is stale, and its lock is taken over. A run
 * holds the lock from before its first reading until its results are ready to
 * write. The lock is as machine-wide as `TMPDIR`: two users with different temp
 * directories don't see each other's. And a parent killed outright (SIGKILL)
 * leaves the child it was waiting on running, with the lock looking stale.
 *
 * Two limits, both narrow. A process id reused by an unrelated process makes a
 * stale lock look held, and the refusal names the file to delete. And two runs
 * that take over the same stale lock in the same instant can both believe they
 * hold it, so `release` reports whether the lock was still this process's, and a
 * run that lost it doesn't write results.
 *
 * Node-only.
 *
 * @module
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The lock's path: the same file for every checkout on the machine. */
export const MACHINE_LOCK_PATH = join(tmpdir(), 'syntax-highlighter-bench.lock');

/** What a lock file says about the process holding it. */
export interface LockHolder {
	pid: number;
	/** What the holder is doing, like the kind of run. */
	label: string;
	/** The holder's working directory. */
	cwd: string;
	/** When the lock was taken, as an ISO timestamp. */
	started_at: string;
}

/** A held lock. */
export interface MachineLock {
	path: string;
	/**
	 * Releases the lock. Safe to call again.
	 *
	 * @returns whether the lock was still this process's when first released
	 */
	release: () => boolean;
}

/** A lock that was taken, or the holder that refused it. */
export type AcquireLockResult =
	{ ok: true; lock: MachineLock } | { ok: false; path: string; holder: LockHolder | null };

const read_holder = (path: string): LockHolder | null => {
	try {
		const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
		if (
			typeof data === 'object' &&
			data !== null &&
			'pid' in data &&
			typeof data.pid === 'number' &&
			'label' in data &&
			typeof data.label === 'string' &&
			'cwd' in data &&
			typeof data.cwd === 'string' &&
			'started_at' in data &&
			typeof data.started_at === 'string'
		) {
			return { pid: data.pid, label: data.label, cwd: data.cwd, started_at: data.started_at };
		}
	} catch {
		// missing or unreadable: no holder to name
	}
	return null;
};

const pid_is_alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// the process exists but belongs to another user
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

const try_create = (path: string, holder: LockHolder): boolean => {
	try {
		writeFileSync(path, JSON.stringify(holder), { flag: 'wx' });
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
		throw error;
	}
};

/**
 * Takes the machine lock, or reports who holds it. It never waits: a second run
 * is refused, not queued.
 *
 * @param label - what this process is doing, shown to a run that is refused
 * @param path - the lock file
 * @returns the lock, or the holder when a live process has it
 */
export const acquire_machine_lock = (
	label: string,
	path: string = MACHINE_LOCK_PATH
): AcquireLockResult => {
	const holder: LockHolder = {
		pid: process.pid,
		label,
		cwd: process.cwd(),
		started_at: new Date().toISOString()
	};
	if (!try_create(path, holder)) {
		const current = read_holder(path);
		// an unreadable lock has no process to probe, so it is refused rather than broken
		if (current === null || pid_is_alive(current.pid)) return { ok: false, path, holder: current };
		// stale: its process is gone
		try {
			rmSync(path, { force: true });
		} catch (error) {
			// another user's stale lock in a sticky temp directory can't be removed from here
			if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
			return { ok: false, path, holder: current };
		}
		if (!try_create(path, holder)) return { ok: false, path, holder: read_holder(path) };
	}
	let released: boolean | null = null;
	const release = (): boolean => {
		if (released !== null) return released;
		released = read_holder(path)?.pid === process.pid;
		if (released) rmSync(path, { force: true });
		return released;
	};
	return { ok: true, lock: { path, release } };
};

/** Says who holds the lock, for the message a refused run prints. */
export const format_lock_holder = (path: string, holder: LockHolder | null): string =>
	holder === null
		? `the machine lock ${path} exists but names no holder: delete it if no run is in progress`
		: `the machine lock is held by pid ${holder.pid} (${holder.label}, in ${holder.cwd}, since ${holder.started_at}): wait for it, or delete ${path} if that process is not a benchmark run`;
