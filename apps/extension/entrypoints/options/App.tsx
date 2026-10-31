import { createChromeAdapter } from '@juxbly/browser'
import {
  Options,
  createManagePorts,
  createPresetPackPorts,
  createSettingsPorts,
} from '@juxbly/ui'
import type { PresetItem } from '@juxbly/ui'
import type { ReactNode } from 'react'
import { JUXBLY_VERSION } from '../../manifest'
import { BUILTIN_PRESETS } from '../../presets/presets'

/**
 * The options page — stage 1-13 replaces the 0-3 placeholder.
 *
 * Three ports objects, all built here: the settings one is answered with the BYOK subset
 * (`settings:manage`, the read only an extension page may make), the manage one with the
 * tool list, the three numbers and the delete, and — stage 3-2 Track B — the preset one
 * with the pack bundled from `docs/recipes/`. The page never touches storage.
 *
 * Stage 1-16 adds the two things a report needs: the build number (`JUXBLY_VERSION`, the
 * same constant the manifest declares) and the clipboard the diagnostic line is copied
 * with — a user action, never an automatic one.
 */

/** The pack as the page renders it: recipe data, renamed for display and nothing else. */
const PRESET_ITEMS: readonly PresetItem[] = BUILTIN_PRESETS.map(({ id, recipe }) => ({
  id,
  title: recipe.title,
  description: recipe.description,
  siteLabel: recipe.scenario.site_label,
  urlPattern: recipe.scenario.url_pattern,
  capabilities: recipe.scenario.capabilities,
  definition: recipe.definition,
}))

export function App(): ReactNode {
  const adapter = createChromeAdapter()

  return (
    <Options
      settings={createSettingsPorts(adapter)}
      manage={createManagePorts(adapter)}
      presets={createPresetPackPorts(adapter, PRESET_ITEMS)}
      version={JUXBLY_VERSION}
      clipboard={adapter.clipboard}
    />
  )
}
