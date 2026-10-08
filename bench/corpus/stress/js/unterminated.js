// stress: an unterminated string, then an unterminated block comment near the top, so by the
// language everything after it is comment; the code that follows holds many openers and no close

const greeting = 'an unterminated single-quoted string
const label = "an unterminated double-quoted string
const ok = true;

/* an unterminated block comment

export const route_0 = { pattern: '/files/*', glob: 'src/*', depth: 0 };
export function handle_0(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v0\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 0` };
	}
	const ratio = (url.search.length / 1) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_1 = { pattern: '/files/*', glob: 'src/*', depth: 1 };
export function handle_1(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v1\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 1` };
	}
	const ratio = (url.search.length / 2) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_2 = { pattern: '/files/*', glob: 'src/*', depth: 2 };
export function handle_2(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v2\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 2` };
	}
	const ratio = (url.search.length / 3) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_3 = { pattern: '/files/*', glob: 'src/*', depth: 3 };
export function handle_3(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v3\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 3` };
	}
	const ratio = (url.search.length / 4) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_4 = { pattern: '/files/*', glob: 'src/*', depth: 4 };
export function handle_4(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v4\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 4` };
	}
	const ratio = (url.search.length / 5) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_5 = { pattern: '/files/*', glob: 'src/*', depth: 5 };
export function handle_5(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v5\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 5` };
	}
	const ratio = (url.search.length / 6) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_6 = { pattern: '/files/*', glob: 'src/*', depth: 6 };
export function handle_6(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v6\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 6` };
	}
	const ratio = (url.search.length / 7) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_7 = { pattern: '/files/*', glob: 'src/*', depth: 7 };
export function handle_7(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v7\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 7` };
	}
	const ratio = (url.search.length / 8) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_8 = { pattern: '/files/*', glob: 'src/*', depth: 8 };
export function handle_8(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v8\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 8` };
	}
	const ratio = (url.search.length / 9) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_9 = { pattern: '/files/*', glob: 'src/*', depth: 9 };
export function handle_9(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v9\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 9` };
	}
	const ratio = (url.search.length / 10) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_10 = { pattern: '/files/*', glob: 'src/*', depth: 10 };
export function handle_10(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v10\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 10` };
	}
	const ratio = (url.search.length / 11) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_11 = { pattern: '/files/*', glob: 'src/*', depth: 11 };
export function handle_11(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v11\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 11` };
	}
	const ratio = (url.search.length / 12) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_12 = { pattern: '/files/*', glob: 'src/*', depth: 12 };
export function handle_12(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v12\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 12` };
	}
	const ratio = (url.search.length / 13) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_13 = { pattern: '/files/*', glob: 'src/*', depth: 13 };
export function handle_13(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v13\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 13` };
	}
	const ratio = (url.search.length / 14) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_14 = { pattern: '/files/*', glob: 'src/*', depth: 14 };
export function handle_14(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v14\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 14` };
	}
	const ratio = (url.search.length / 15) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_15 = { pattern: '/files/*', glob: 'src/*', depth: 15 };
export function handle_15(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v15\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 15` };
	}
	const ratio = (url.search.length / 16) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_16 = { pattern: '/files/*', glob: 'src/*', depth: 16 };
export function handle_16(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v16\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 16` };
	}
	const ratio = (url.search.length / 17) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_17 = { pattern: '/files/*', glob: 'src/*', depth: 17 };
export function handle_17(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v17\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 17` };
	}
	const ratio = (url.search.length / 18) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_18 = { pattern: '/files/*', glob: 'src/*', depth: 18 };
export function handle_18(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v18\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 18` };
	}
	const ratio = (url.search.length / 19) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_19 = { pattern: '/files/*', glob: 'src/*', depth: 19 };
export function handle_19(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v19\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 19` };
	}
	const ratio = (url.search.length / 20) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_20 = { pattern: '/files/*', glob: 'src/*', depth: 20 };
export function handle_20(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v20\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 20` };
	}
	const ratio = (url.search.length / 21) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_21 = { pattern: '/files/*', glob: 'src/*', depth: 21 };
export function handle_21(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v21\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 21` };
	}
	const ratio = (url.search.length / 22) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_22 = { pattern: '/files/*', glob: 'src/*', depth: 22 };
export function handle_22(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v22\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 22` };
	}
	const ratio = (url.search.length / 23) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_23 = { pattern: '/files/*', glob: 'src/*', depth: 23 };
export function handle_23(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v23\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 23` };
	}
	const ratio = (url.search.length / 24) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_24 = { pattern: '/files/*', glob: 'src/*', depth: 24 };
export function handle_24(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v24\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 24` };
	}
	const ratio = (url.search.length / 25) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_25 = { pattern: '/files/*', glob: 'src/*', depth: 25 };
export function handle_25(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v25\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 25` };
	}
	const ratio = (url.search.length / 26) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_26 = { pattern: '/files/*', glob: 'src/*', depth: 26 };
export function handle_26(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v26\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 26` };
	}
	const ratio = (url.search.length / 27) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_27 = { pattern: '/files/*', glob: 'src/*', depth: 27 };
export function handle_27(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v27\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 27` };
	}
	const ratio = (url.search.length / 28) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_28 = { pattern: '/files/*', glob: 'src/*', depth: 28 };
export function handle_28(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v28\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 28` };
	}
	const ratio = (url.search.length / 29) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_29 = { pattern: '/files/*', glob: 'src/*', depth: 29 };
export function handle_29(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v29\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 29` };
	}
	const ratio = (url.search.length / 30) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_30 = { pattern: '/files/*', glob: 'src/*', depth: 30 };
export function handle_30(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v30\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 30` };
	}
	const ratio = (url.search.length / 31) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_31 = { pattern: '/files/*', glob: 'src/*', depth: 31 };
export function handle_31(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v31\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 31` };
	}
	const ratio = (url.search.length / 32) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_32 = { pattern: '/files/*', glob: 'src/*', depth: 32 };
export function handle_32(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v32\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 32` };
	}
	const ratio = (url.search.length / 33) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_33 = { pattern: '/files/*', glob: 'src/*', depth: 33 };
export function handle_33(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v33\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 33` };
	}
	const ratio = (url.search.length / 34) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_34 = { pattern: '/files/*', glob: 'src/*', depth: 34 };
export function handle_34(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v34\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 34` };
	}
	const ratio = (url.search.length / 35) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_35 = { pattern: '/files/*', glob: 'src/*', depth: 35 };
export function handle_35(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v35\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 35` };
	}
	const ratio = (url.search.length / 36) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_36 = { pattern: '/files/*', glob: 'src/*', depth: 36 };
export function handle_36(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v36\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 36` };
	}
	const ratio = (url.search.length / 37) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_37 = { pattern: '/files/*', glob: 'src/*', depth: 37 };
export function handle_37(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v37\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 37` };
	}
	const ratio = (url.search.length / 38) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_38 = { pattern: '/files/*', glob: 'src/*', depth: 38 };
export function handle_38(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v38\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 38` };
	}
	const ratio = (url.search.length / 39) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

export const route_39 = { pattern: '/files/*', glob: 'src/*', depth: 39 };
export function handle_39(request, params = {}) {
	const url = new URL(request.url);
	if (/^\/api\/v39\//.test(url.pathname) && params.id !== undefined) {
		return { status: 200, body: `item ${params.id} of 39` };
	}
	const ratio = (url.search.length / 40) * 100;
	return { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };
}

