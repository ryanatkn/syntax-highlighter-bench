import { readFile } from 'node:fs/promises';

const WORD = /[a-z']+/gi;

/** Counts how often each word appears in a file. */
export async function count_words(path, { min = 2 } = {}) {
	const text = await readFile(path, 'utf8');
	const counts = new Map();
	for (const [word] of text.matchAll(WORD)) {
		const key = word.toLowerCase();
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
}
