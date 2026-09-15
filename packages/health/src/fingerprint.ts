/**
 * Structure-fingerprint layer — `docs/ARCHITECTURE.md` §8.1 / §10, `task/stage-1-11.md`.
 *
 * A fingerprint is **statistics, never a snapshot**: storing a DOM snapshot would mean
 * storing page content, which breaks the minimal-state rule the whole storage contract is
 * built on (§8.1). What is kept is how many containers matched, the shape of the first
 * one, and how often each field had a value — enough to notice "the page restructured",
 * not enough to reconstruct anything.
 *
 * Two rules that keep this layer honest:
 *
 * - **No baseline is not drift.** The first successful run captures; it does not judge.
 *   A tool that has just started cannot have drifted from a shape it never recorded, and
 *   a tool predating the field is in exactly the same position after migration.
 * - **`tag_path` is recorded but not judged** (C4, 2026-09-02). Every site nests
 *   differently, so a usable threshold needs per-site calibration that V1 has no data
 *   for; switching it on early would manufacture false positives, and false positives
 *   cost more trust than misses (`docs/PRODUCT.md` §14.2).
 */
import type { ExtractResult, StructureFingerprint } from '@juxbly/core'
import { FINGERPRINT_CONTAINER_DROP_RATIO, FINGERPRINT_PRESENCE_DROP } from './constants'
import type { StructureLayer } from './types'

export interface StructureJudgement {
  layer: StructureLayer
  reason: string
}

export interface CaptureOptions {
  /** Tag path of the first matched container, subscripts already stripped. */
  tagPath?: string
  /** ISO 8601; injected so a capture is reproducible in tests. */
  at?: string
}

export function captureFingerprint(
  extract: Pick<ExtractResult, 'hitCount' | 'fieldPresence'>,
  options: CaptureOptions = {},
): StructureFingerprint {
  return {
    captured_at: options.at ?? new Date().toISOString(),
    container_count: extract.hitCount,
    tag_path: options.tagPath ?? '',
    field_presence: { ...extract.fieldPresence },
  }
}

export function judgeStructure(
  baseline: StructureFingerprint | null,
  current: StructureFingerprint,
): StructureJudgement {
  if (baseline === null) {
    return { layer: 'no-baseline', reason: 'no structure baseline yet — this run becomes it' }
  }

  // A baseline of zero records nothing: "the container used to match nothing" is not an
  // expectation worth defending, so it never counts as a drop.
  if (baseline.container_count > 0) {
    const floor = baseline.container_count * (1 - FINGERPRINT_CONTAINER_DROP_RATIO)
    if (current.container_count < floor) {
      return { layer: 'drifted', reason: 'far fewer repeating blocks matched than before' }
    }
  }

  for (const [field, expected] of Object.entries(baseline.field_presence)) {
    const actual = current.field_presence[field] ?? 0
    if (expected - actual >= FINGERPRINT_PRESENCE_DROP) {
      return { layer: 'drifted', reason: `the "${field}" field is missing far more often` }
    }
  }

  return { layer: 'ok', reason: 'the page structure still matches the baseline' }
}
