/**
 * Health thresholds — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md`.
 *
 * Every number that decides a user-visible state lives here, and nowhere else, for one
 * reason: Phase 2 (stage 2-4) retunes them against a real corpus, and retuning must be a
 * one-file edit with no way to accidentally change the *judgement* while doing it.
 *
 * The bias is deliberately towards **under-reporting**. A false "your tool is broken" is
 * worse than a missed one: the product promise is that breakage is caught and explained,
 * not that it is caught instantly, and a panel that cries wolf trains the user to ignore
 * it (`docs/PRODUCT.md` §6.2).
 */

/** `recent_runs` is a rolling window, not a history (§8.2). */
export const RECENT_RUNS_WINDOW = 10

/** A degraded tool needs this many clean runs in a row before it is healthy again. */
export const RECOVERY_RUNS_REQUIRED = 2

/** Minimum gap between two semantic checks of the same tool. */
export const SEMANTIC_CHECK_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Records sent to the model for a semantic check. Enough to judge, too little to leak. */
export const SEMANTIC_SAMPLE_SIZE = 5

/** Below this many historical runs there is no pattern to deviate from. */
export const RESULT_BASELINE_MIN_RUNS = 3

/** Container count must fall to this share of the baseline before it counts as drift. */
export const FINGERPRINT_CONTAINER_DROP_RATIO = 0.5

/** Absolute drop in a field's presence share (0–1) that counts as drift. */
export const FINGERPRINT_PRESENCE_DROP = 0.4
