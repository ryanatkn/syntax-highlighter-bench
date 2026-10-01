const a = 1;

const b: string = 'b';

const c = true;

export type SomeType = 1 | 'b' | true;

declare const some_decorator: any;

abstract class Base {
	abstract abstract_method(): void;
}

/* eslint-disable no-console */

@some_decorator
class D extends Base {
	readonly d1: string = 'd';
	d2: number;
	d3 = $state(null);

	@some_decorator
	decorated = true;

	constructor(d2: number) {
		super();
		this.d2 = d2;
	}

	abstract_method(): void {
		// implementation
	}

	@some_decorator('example', {option: true})
	class_method(): string {
		return `Hello, ${this.d1}`;
	}

	instance_method = (): void => {
		/* ... */
		let i = 0;
		do {
			i++;
		} while (i < 3);

		for (const c2 of this.d1) {
			if (c2 === 'd') continue;
			if (!c2) break;
			this.#private_method(a, c2);
		}

		switch (this.d1) {
			case 'a':
				console.log('case a');
				break;
			case 'b':
			case 'c':
				console.log('case b or c');
				break;
			default:
				console.log('default');
		}

		const obj: {has_d1?: boolean; is_d: boolean} = {
			has_d1: 'd1' in this,
			is_d: this instanceof D,
		};
		delete obj.has_d1;
		// foo
	};

	#private_method(a2: number, c2: any): void {
		throw new Error(`${this.d1}
			multiline
			etc ${a2 + c2}
		`);
	}

	*generator(): Generator<number | Array<number>> {
		yield 1;
		yield* [2, 3];
	}

	async *async_generator(): AsyncGenerator<number> {
		yield await Promise.resolve(4);
	}

	protected async protected_method(): Promise<void> {
		try {
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (Math.random() > 0.5) {
				console.log(new Date());
			} else if (Math.random() > 0.2) {
				console.log('else if branch');
			} else {
				console.log('else branch');
			}
		} catch (error: unknown) {
			console.error(error);
		} finally {
			console.log('finally block');
		}
	}
}

// comment

/*
other comment

const comment = false;
*/

/**
 * JSDoc comment
 */

import {sample_langs, type SampleLang} from '$lib/code_sample.ts';
import * as A from '$lib/code_sample.ts';

export {a, A, b, c, D};

sample_langs as unknown as SampleLang satisfies SampleLang;

export interface SomeE<T = null> {
	name: string;
	age: number;
	t?: T;
}

const e: {name: string; age: number} = {name: 'A. H.', age: 100};
const v = [['', e]] as const;
export const some_e: Map<string, SomeE> = new Map(v);

export function add(x: number, y: number): number {
	return x + y;
}

export const plus = (a: any, b: any): any => a + b;

// boundary test cases
export const str_with_keywords = 'const class function string';
export const str_with_comment = '// this is not a comment';
export const template_with_expr = `Value: ${1 + 2}`;

// regex that looks like comment
export const regex = /\/\/.*/g;
export const complex_regex = /^(?:\/\*.*?\*\/|\/\/.*|[^/])+$/;

// string in comment should not be highlighted as string
// const commented = "this string is in a comment";
