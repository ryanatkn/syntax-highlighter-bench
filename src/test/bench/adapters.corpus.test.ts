import { ADAPTERS } from '../../../bench/libraries.ts';
import { SLOW_ADAPTER_IDS, describe_corpus_output_check } from './corpus_check_helpers.ts';

// every library but the slow ones, so a new library is covered without a change here
describe_corpus_output_check(
	ADAPTERS.map((a) => a.id).filter((id) => !SLOW_ADAPTER_IDS.includes(id))
);
