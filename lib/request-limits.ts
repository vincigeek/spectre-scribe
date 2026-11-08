/** Request size limits shared by Route Handlers and their tests. */

/** 256 KiB is far above any useful sample and bounds the work per analyse request. */
export const MAX_ANALYSE_BODY_BYTES = 256 * 1024;
