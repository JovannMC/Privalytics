import type { Handle } from '@sveltejs/kit/hooks';
import { initializeDatabase } from './lib/server/database';

export const handle: Handle = async ({ event, resolve }) => {
	initializeDatabase();
	return resolve(event);
};
