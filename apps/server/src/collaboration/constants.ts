// Backoff between attempts to persist a document whose write failed. Sized to
// outlast a database restart, so a redeploy does not discard unsaved edits.
export const STORE_RETRY_DELAYS_MS = [1000, 5000, 15000, 30000];

export const HISTORY_INTERVAL = 5 * 60 * 1000;
export const HISTORY_FAST_INTERVAL = 60 * 1000;
export const HISTORY_FAST_THRESHOLD = 5 * 60 * 1000;
export const HISTORY_RESTORE_INTERVAL = 60 * 1000;
export const HISTORY_RESTORE_STATE_TTL = 24 * 60 * 60;
