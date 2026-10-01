/**
 * The corpus inputs of a results file, arranged for the inputs table of the
 * docs: by source, with a home input under the library whose samples it is.
 *
 * @module
 */

import type { BenchInput, BenchProvenance } from './results_schema.ts';
import { format_hash } from './bench_format.ts';
import {
	format_source_key,
	format_source_note,
	to_source_key,
	to_source_keys
} from './cell_groups.ts';

/** The inputs of one source. */
export interface InputGroup {
	source_key: string;
	label: string;
	note: string;
	inputs: Array<BenchInput>;
}

/** The inputs in groups of one source, in source order, each ordered by file. */
export const group_inputs = (inputs: ReadonlyArray<BenchInput>): Array<InputGroup> =>
	to_source_keys(inputs).map((source_key) => ({
		source_key,
		label: format_source_key(source_key),
		note: format_source_note(source_key),
		inputs: inputs
			.filter((input) => to_source_key(input) === source_key)
			.sort((a, b) => a.file.localeCompare(b.file))
	}));

/** The page of an upstream file at its pinned commit. */
export const to_provenance_url = (
	provenance: Pick<BenchProvenance, 'repo' | 'commit' | 'path'>
): string =>
	`${provenance.repo}/blob/${provenance.commit}/${provenance.path.split('/').map(encodeURIComponent).join('/')}`;

/** An upstream file as `owner/repo@commit`, the commit shortened. */
export const format_provenance = (provenance: Pick<BenchProvenance, 'repo' | 'commit'>): string =>
	`${provenance.repo.split('/').slice(-2).join('/')}@${format_hash(provenance.commit)}`;
