/**
 * Shared React Query tuning constants for the client bundle. Keep this file
 * lean and free of side effects so it can be imported from `main.tsx` init
 * path as well as individual hooks.
 */

/** Default staleTime for long-lived reference data (e.g. workflow statuses). */
export const LONG_STALE_TIME_MS = 60 * 60 * 1000;
