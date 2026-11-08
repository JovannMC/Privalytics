import type { Handle } from '@sveltejs/kit/hooks';
import { initDatabase } from './lib/server/database';

export const handle: Handle = async ({ event, resolve }) => {
	initDatabase();
	return resolve(event);
};
