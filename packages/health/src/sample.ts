/**
 * The semantic layer's sample cap — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md`.
 *
 * `SEMANTIC_SAMPLE_SIZE` is a *privacy* number, not a formatting detail: it is the most
 * page data allowed to leave for the model in one check. A cap that each caller re-implements
 * as `slice(0, N)` has N enforcers and therefore none — one caller that forgets it leaks
 * unbounded page content, and no test can catch that, because a test cannot see a call site
 * that does not exist yet.
 *
 * So the cap lives here, next to the constant it enforces, and is the only exported way to
 * build a semantic sample. It is idempotent: already-capped input passes through unchanged,
 * which is what lets the content script cap before messaging and the background cap again
 * without either one being "the" place.
 */
import { SEMANTIC_SAMPLE_SIZE } from './constants'

/**
 * Returns at most `SEMANTIC_SAMPLE_SIZE` records, in order.
 *
 * First-seen order, not a random pick: a check that saw a different slice each time could not
 * be compared with the one before it, and the verdict has to be reproducible to be trusted.
 */
export function capSample<T>(records: readonly T[]): T[] {
  return records.slice(0, SEMANTIC_SAMPLE_SIZE)
}
