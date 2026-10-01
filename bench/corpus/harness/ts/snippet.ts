interface Options {
	retries: number;
	timeout_ms?: number;
}

// Fetches JSON, retrying on a network failure.
export const fetch_json = async <T>(url: string, options: Options): Promise<T> => {
	for (let attempt = 0; attempt <= options.retries; attempt++) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(options.timeout_ms ?? 5000)
			});
			if (response.ok) return (await response.json()) as T;
		} catch {
			continue;
		}
	}
	throw new Error(`failed to fetch ${url}`);
};
