import { configs } from '@ryanatkn/eslint-config';

// the corpus is input data, not code
export default [...configs, { ignores: ['bench/corpus/'] }];
