import { emptyHealth, emptyRunState } from '@juxbly/storage'
import { commitRepair, nextVersionOf, rollbackTo } from '@juxbly/repair'
import type { ToolRecord, ToolVersion } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { describe, expect, it } from 'vitest'

/**
 * Version management — `task/stage-1-12.md` Scope 3 / Scope 4, `docs/ARCHITECTURE.md`
 * §8.1 / §9.3.
 *
 * The invariant under test is the one the product is named for: **a repair always produces
 * a new version and never edits the one before it.** Everything below is a consequence of
 * it — the history grows, the replaced version is marked, and a rollback can undo any of it
 * because nothing was ever thrown away.
 *
 * These are pure functions: no adapter, no storage, no page. That is deliberate and is what
 * makes "old versions are never deleted" a property that can be asserted rather than hoped
 * for (`docs/CONVENTIONS.md` §15: no silent repair, and no code path that could perform one).
 */

const AT = '2026-09-08T10:00:00.000Z'

function definition(version: number, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    tool_id: 'tool_8f3a2b',
    name: 'Shop results',
    description: 'Collect the product name and price.',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.product',
        fields: { title: '.title' },
        field_types: { title: 'text' },
        output_to: 'raw_items',
      },
      { type: 'render', view: 'table', input_from: 'raw_items' },
    ],
    ...overrides,
  }
}

function version(number: number, everBroken = false): ToolVersion {
  return {
    version: number,
    definition: definition(number),
    note: `v${number}`,
    ever_broken: everBroken,
    created_at: AT,
  }
}

function record(versions: ToolVersion[], current = versions.length): ToolRecord {
  return {
    tool_id: 'tool_8f3a2b',
    definition: definition(current),
    versions,
    health: { ...emptyHealth(), status: 'broken' },
    run_state: { last_extract_hash: 'stale', last_llm_outputs: { out: 'stale' } },
    usage: { last_run_at: AT, run_count: 9, last_export_at: null, export_count: 0 },
    created_at: AT,
    updated_at: AT,
  }
}

const FRESH = { health: emptyHealth(), runState: emptyRunState() }

describe('commitRepair', () => {
  it('writes version + 1 and keeps every old version', () => {
    const next = commitRepair({
      record: record([version(1)]),
      origin: { trigger: 'broken', baseVersion: 1 },
      definition: definition(1),
      note: 'Repaired after the page changed',
      at: AT,
      fresh: FRESH,
    })

    expect(nextVersionOf(record([version(1)]))).toBe(2)
    expect(next.definition.version).toBe(2)
    expect(next.versions.map((entry) => entry.version)).toEqual([1, 2])
    expect(next.versions[1]?.note).toBe('Repaired after the page changed')
    // A new version has never been broken — that is a fact about this version, not the tool.
    expect(next.versions[1]?.ever_broken).toBe(false)
  })

  it('marks the replaced version ever_broken, and only that one', () => {
    const next = commitRepair({
      record: record([version(1), version(2)]),
      origin: { trigger: 'broken', baseVersion: 2 },
      definition: definition(2),
      note: 'repaired',
      at: AT,
      fresh: FRESH,
    })

    expect(next.versions.map((entry) => entry.ever_broken)).toEqual([false, true, false])
  })

  it('marks nothing for a user-initiated edit — editing is not evidence', () => {
    const next = commitRepair({
      record: record([version(1)]),
      origin: { trigger: 'user', baseVersion: 1 },
      definition: definition(1),
      note: 'Edited by you',
      at: AT,
      fresh: FRESH,
    })

    expect(next.versions.map((entry) => entry.ever_broken)).toEqual([false, false])
  })

  it('never un-marks: ever_broken is a fact, not a state', () => {
    const next = commitRepair({
      record: record([version(1, true), version(2)]),
      origin: { trigger: 'broken', baseVersion: 2 },
      definition: definition(2),
      note: 'repaired again',
      at: AT,
      fresh: FRESH,
    })

    expect(next.versions.map((entry) => entry.ever_broken)).toEqual([true, true, false])
  })

  it('takes the tool id from the record, not from the incoming definition', () => {
    // A model that renamed the tool under repair must not fork the history.
    const next = commitRepair({
      record: record([version(1)]),
      origin: { trigger: 'broken', baseVersion: 1 },
      definition: definition(1, { tool_id: 'tool_something_else' }),
      note: 'repaired',
      at: AT,
      fresh: FRESH,
    })

    expect(next.tool_id).toBe('tool_8f3a2b')
    expect(next.definition.tool_id).toBe('tool_8f3a2b')
  })

  it('starts the new version with no baseline and no cache', () => {
    const next = commitRepair({
      record: record([version(1)]),
      origin: { trigger: 'broken', baseVersion: 1 },
      definition: definition(1),
      note: 'repaired',
      at: AT,
      fresh: FRESH,
    })

    // Carrying the old version's state over would let a *different* definition be judged
    // against a baseline it never produced — and let the cache answer for selectors that
    // are no longer there.
    expect(next.health).toEqual(emptyHealth())
    expect(next.run_state).toEqual(emptyRunState())
    expect(next.health.recent_runs).toEqual([])
    expect(next.run_state.last_extract_hash).toBeNull()
  })
})

describe('rollbackTo', () => {
  it('makes the chosen version current and leaves history untouched', () => {
    const stored = record([version(1, true), version(2)])
    const next = rollbackTo({ record: stored, version: 1, at: AT, fresh: FRESH })

    expect(next?.definition.version).toBe(1)
    // Including the entry that was in effect: a rollback is itself undoable.
    expect(next?.versions).toEqual(stored.versions)
    expect(next?.versions.map((entry) => entry.ever_broken)).toEqual([true, false])
    expect(next?.health).toEqual(emptyHealth())
    expect(next?.run_state).toEqual(emptyRunState())
  })

  it('answers null for a version that is not in the history', () => {
    // An answer the caller has to handle, rather than a silently unchanged record that
    // would read as success.
    expect(rollbackTo({ record: record([version(1)]), version: 7, at: AT, fresh: FRESH })).toBeNull()
  })
})
