import type { SvgData } from '@fuzdev/fuz_ui/svg.ts';

/**
 * The site's mark: four lines of highlighted code that are also the bars of a
 * chart. `static/logo.svg` and `static/favicon.png` are the same drawing.
 */
export const logo_syntax_highlighter_bench: SvgData = {
	label: 'four lines of highlighted code, drawn as the bars of a chart',
	paths: [
		{ fill: '#6199d1', d: 'M6.25 15.625h31.25v12.5h-31.25z' },
		{ fill: '#f4672f', d: 'M43.75 15.625h50v12.5h-50z' },
		{ fill: '#3db33d', d: 'M18.75 34.375h37.5v12.5h-37.5z' },
		{ fill: '#8866cc', d: 'M62.5 34.375h18.75v12.5h-18.75z' },
		{ fill: '#f4672f', d: 'M18.75 53.125h12.5v12.5h-12.5z' },
		{ fill: '#6199d1', d: 'M37.5 53.125h37.5v12.5h-37.5z' },
		{ fill: '#8866cc', d: 'M6.25 71.875h18.75v12.5h-18.75z' },
		{ fill: '#3db33d', d: 'M31.25 71.875h25v12.5h-25z' }
	]
};
