import { createMockAdapter } from '@juxbly/browser'
import type { BrowserAdapter } from '@juxbly/browser'
import type { OnboardingFlags, Settings } from '@juxbly/core'
import { runConnectivityTest } from '@juxbly/llm'
import {
  applySettingsPatch,
  handleBuildSaveTool,
  loadOnboardingFlags,
  loadTools,
  markFirstToolBuilt,
  recordRunResult,
  setOnboardingFlags,
  summarizeUsage,
} from '@juxbly/storage'
import { shouldRequestKey } from '@juxbly/ui'
import type { ToolDefinition } from '@juxbly/dsl'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The onboarding flow across layers — `task/stage-1-13.md` Tests (each of the four nodes fires exactly once).
 *
 * The unit test pins each node's decision in isolation; this one walks the storage and
 * write paths the nodes sit on, because a flag that fires once in memory and twice in
 * storage would pass every unit test and still be wrong:
 *
 *   install → glow flag written once → panel open writes its own bit → key saved through
 *   the same patch path the options page uses → first successful run writes
 *   `first_tool_built` exactly once → the stats sum reads the same storage.
 */

const AT = '2026-09-09T10:00:00.000Z'
const TOOL_ID = 'tool_9a1b2c'

let adapter: BrowserAdapter

beforeEach(() => {
  adapter = createMockAdapter()
})

function definition(): ToolDefinition {
  return {
    tool_id: TOOL_ID,
    name: 'Shop results',
    description: 'Collect the product name and price.',
    category: 'data',
    url_pattern: 'https://shop.example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: '.title', price: '.price' },
        field_types: { title: 'text', price: 'text' },
        output_to: 'raw_items',
      },
      { type: 'render', view: 'table', input_from: 'raw_items' },
    ],
  }
}

const TRUE_FLAGS: OnboardingFlags = {
  first_install_glow_shown: true,
  first_chat_opened: true,
  api_key_requested: true,
  first_tool_built: true,
}

describe('flags are merge-only and independent in storage', () => {
  it('one node writes its own bit; the other three stay false', async () => {
    const merged = await setOnboardingFlags(adapter, { first_install_glow_shown: true })

    expect(merged).toEqual({
      first_install_glow_shown: true,
      first_chat_opened: false,
      api_key_requested: false,
      first_tool_built: false,
    })
  })

  it('a true flag never goes back to false, whatever a later patch says', async () => {
    await setOnboardingFlags(adapter, { first_chat_opened: true })
    const merged = await setOnboardingFlags(adapter, {
      first_chat_opened: false,
      first_tool_built: true,
    })

    expect(merged.first_chat_opened).toBe(true)
    expect(merged.first_tool_built).toBe(true)
  })

  it('re-reading after the write returns the same record', async () => {
    await setOnboardingFlags(adapter, TRUE_FLAGS)
    await expect(loadOnboardingFlags(adapter)).resolves.toEqual(TRUE_FLAGS)
  })
})

describe('node ③: the key travels one path, and the ask disappears once it is set', () => {
  it('saving a key makes the node owed no longer, before any model call', async () => {
    expect(shouldRequestKey(await loadOnboardingFlags(adapter), false)).toBe(true)

    // The same patch shape the options page and the key step send.
    const written = await applySettingsPatch(adapter, {
      api_key: 'sk-or-v1-abcdef123456',
      model: 'gpt-4o-mini',
    })
    expect(written).toBe(true)

    await setOnboardingFlags(adapter, { api_key_requested: true })
    expect(shouldRequestKey(await loadOnboardingFlags(adapter), true)).toBe(false)
  })

  it('the connectivity probe answers before saving and saves nothing itself', async () => {
    const result = await runConnectivityTest({
      api_key: 'sk-test-abcdef123456',
      model: 'gpt-4o-mini',
      api_base_url: 'https://endpoint.test/v1',
    })

    // No network in the test env: the failure must be a *category*, never a throw.
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()

    const settings = (await adapter.storage.get<Settings>('juxbly:settings')) ?? null
    expect(settings?.api_key ?? null).toBeNull()
  })
})

describe('node ④ and the stats that read the same storage', () => {
  it('the run write alone is not the milestone; only the success path marks it', async () => {
    await handleBuildSaveTool({ kind: 'build:save_tool', tool: definition() }, adapter)

    // `recordRunResult` counts the run whether it worked or not — which is exactly why it
    // cannot be the writer of `first_tool_built`. The milestone is set by the report
    // handler on `ok === true`, so a first build that failed leaves the notice owed
    // instead of spending it on a tool the user never saw work.
    await recordRunResult(adapter, TOOL_ID, { at: AT })
    const afterRun = await loadOnboardingFlags(adapter)
    expect(afterRun?.first_tool_built ?? false).toBe(false)

    await expect(markFirstToolBuilt(adapter)).resolves.toBe(true)
    await expect(loadOnboardingFlags(adapter)).resolves.toMatchObject({
      first_tool_built: true,
    })

    // A second success does not rewrite the record — the milestone is a fact about the
    // past, and the write only ever happened once.
    await expect(markFirstToolBuilt(adapter)).resolves.toBe(false)
    await expect(loadOnboardingFlags(adapter)).resolves.toMatchObject({
      first_tool_built: true,
    })
  })

  it('the three numbers are computed from the tool records, runs summed from run_count', async () => {
    await handleBuildSaveTool({ kind: 'build:save_tool', tool: definition() }, adapter)
    await recordRunResult(adapter, TOOL_ID, { at: AT })
    await recordRunResult(adapter, TOOL_ID, { at: AT })

    const records = await loadTools(adapter)
    const stats = summarizeUsage(records, new Date(AT))

    expect(stats.totalTools).toBe(1)
    expect(stats.addedThisWeek).toBe(1)
    // The result area counts the same runs: this number is the sum of `run_count`, and
    // nothing else keeps a second one.
    expect(stats.totalRuns).toBe(2)
  })
})
