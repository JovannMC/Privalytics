const WINDOW_MS = 60_000;
const PROJECT_LIMIT = envLimit('PROJECT_REPORT_RATE_LIMIT', 600);
const ENTITY_LIMIT = envLimit('ENTITY_REPORT_RATE_LIMIT', 12);

function envLimit(name: string, fallback: number): number {
	const value = process.env[name];
	if (value === undefined) return fallback;

	const limit = Number(value);
	if (!Number.isInteger(limit) || limit < 1) throw new Error(`${name} must be a positive integer`);

	return limit;
}

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

function checkLimit(key: string, limit: number, now = Date.now()): RateLimitResult {
	const window = Math.floor(now / WINDOW_MS);
	if (now - lastCleanup >= WINDOW_MS) {
		for (const [bucketKey, bucket] of buckets) {
			if (bucket.window < window) buckets.delete(bucketKey);
		}
		lastCleanup = now;
	}

	let bucket = buckets.get(key);
	if (!bucket || bucket.window !== window) {
		bucket = { window, count: 0 };
		buckets.set(key, bucket);
	}

	const retryAfter = Math.ceil(((window + 1) * WINDOW_MS - now) / 1000);
	if (bucket.count >= limit) return { allowed: false, retryAfter };
	bucket.count++;
	return { allowed: true, retryAfter };
}

interface Bucket {
	window: number;
	count: number;
}

export function checkLimitProjectReport(projectSlug: string): RateLimitResult {
	return checkLimit(`project:${projectSlug}`, PROJECT_LIMIT);
}

export function checkLimitEntityReport(projectSlug: string, entityId: string): RateLimitResult {
	return checkLimit(`entity:${projectSlug}:${entityId}`, ENTITY_LIMIT);
}

export interface RateLimitResult {
	allowed: boolean;
	retryAfter: number;
}
