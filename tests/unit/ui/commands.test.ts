import { describe, expect, it, vi } from 'vitest'
import { createCommandRegistry, createRunCommands, ENTRY_IDS } from '@juxbly/ui'

/**
 * The command registry — `task/stage-1-16.md` Scope 4 / AC 3, `docs/UI_SPEC.md` §10.
 *
 * The invariant under test is the one the task file states as a prohibition: **there is
 * no behaviour that can only be reached by typing a command.** A command names a control
 * that is already on screen, and `SlashCommand.via` — required, not optional — is where
 * that naming is enforced. These tests assert the declaration; the panel-level test in
 * `packages/ui/src/run/command-entries.test.tsx` asserts the panel actually renders
 * every id these commands name.
 */
describe('command registry (§10)', () => {
  it('matches a typed name, tolerating case and surrounding whitespace', () => {
    const registry = createCommandRegistry()
    const run = vi.fn()
    registry.register({ name: '/edit', run, via: 'tab-config' })

    expect(registry.match(' /EDIT ')?.name).toBe('/edit')
    expect(registry.match('  /edit')?.name).toBe('/edit')
  })

  it('answers null for anything that is not a command — an input is never a guess', () => {
    const registry = createCommandRegistry()
    registry.register({ name: '/edit', run: () => {}, via: 'tab-config' })

    expect(registry.match('')).toBeNull()
    expect(registry.match('edit')).toBeNull()
    expect(registry.match('/edits')).toBeNull()
    expect(registry.match('what do you need from this page?')).toBeNull()
  })

  it('replaces a re-registered name instead of keeping two chips for it', () => {
    const registry = createCommandRegistry()
    registry.register({ name: '/edit', run: () => {}, via: 'tab-config' })
    registry.register({ name: '/edit', run: vi.fn(), via: 'tab-config' })

    expect(registry.all()).toHaveLength(1)
  })

  it('keeps registration order, which is what the chip row draws', () => {
    const registry = createCommandRegistry()
    registry.register({ name: '/b', run: () => {}, via: 'x' })
    registry.register({ name: '/a', run: () => {}, via: 'y' })

    expect(registry.all().map((command) => command.name)).toEqual(['/b', '/a'])
  })
})

describe('run panel commands (AC 3)', () => {
  const actions = {
    openConfig: vi.fn(),
    openInspect: vi.fn(),
    showVersions: vi.fn(),
  }

  it('has exactly the three the task file names — no more, in V1', () => {
    const registry = createRunCommands(actions)

    expect(registry.all().map((command) => command.name)).toEqual([
      '/edit',
      '/inspect',
      '/versions',
    ])
  })

  it('every command names a distinct clickable entry — a command with none cannot exist', () => {
    const vias = createRunCommands(actions).all().map((command) => command.via)

    expect(vias).toEqual([ENTRY_IDS.config, ENTRY_IDS.inspect, ENTRY_IDS.versions])
    expect(new Set(vias).size).toBe(vias.length)
    for (const via of vias) expect(via.trim()).not.toBe('')
  })

  it('dispatches to the action it names', () => {
    const fresh = { openConfig: vi.fn(), openInspect: vi.fn(), showVersions: vi.fn() }
    const registry = createRunCommands(fresh)

    registry.match('/edit')?.run()
    registry.match('/inspect')?.run()
    registry.match('/versions')?.run()

    expect(fresh.openConfig).toHaveBeenCalledTimes(1)
    expect(fresh.openInspect).toHaveBeenCalledTimes(1)
    expect(fresh.showVersions).toHaveBeenCalledTimes(1)
  })
})
