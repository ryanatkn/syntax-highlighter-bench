import type { SvgData } from '@fuzdev/fuz_ui/svg.ts';

/**
 * The site's mark: a bench built from highlighted code, its backrest and seat
 * lines of colored tokens on two posts. `static/logo.svg` and
 * `static/favicon.png` are the same drawing.
 */
export const logo_syntax_highlighter_bench: SvgData = {
	label:
		'a bench built from highlighted code: lines of colored tokens for its backrest and seat, on two posts',
	paths: [
		{ fill: '#98775c', d: 'M7.8125 12.5h9.375v75h-9.375z' },
		{ fill: '#98775c', d: 'M82.8125 12.5h9.375v75h-9.375z' },
		{ fill: '#cb7e99', d: 'M0 12.5h43.75v9.375h-43.75z' },
		{ fill: '#42ad9b', d: 'M50 12.5h50v9.375h-50z' },
		{ fill: '#9e8cd1', d: 'M0 32.8125h21.875v5.46875h-21.875z' },
		{ fill: '#679dd5', d: 'M28.125 32.8125h37.5v5.46875h-37.5z' },
		{ fill: '#cb7e99', d: 'M71.875 32.8125h28.125v5.46875h-28.125z' },
		{ fill: '#42ad9b', d: 'M0 49.21875h56.25v7.03125h-56.25z' },
		{ fill: '#9e8cd1', d: 'M62.5 49.21875h37.5v7.03125h-37.5z' }
	]
};
