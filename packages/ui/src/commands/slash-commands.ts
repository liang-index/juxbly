/**
 * The run panel's commands (stage 1-16).
 *
 * Three of them, and each one is a shortcut to a control that is already on screen:
 * the two tabs and the version list. Nothing here is reachable *only* by typing — see
 * `via` in `registry.ts`, and the equivalence test that asserts the panel renders every
 * id these commands name.
 *
 * The ids are declared here and rendered by the panel, which is the one place a typo
 * could silently break the invariant; `ENTRY_IDS` is exported so the test can compare
 * the two lists instead of trusting them.
 */
import { createCommandRegistry, type CommandRegistry } from './registry'

export const ENTRY_IDS = {
  config: 'tab-config',
  inspect: 'tab-inspect',
  versions: 'versions',
} as const

export interface RunCommandActions {
  openConfig(): void
  openInspect(): void
  showVersions(): void
}

export function createRunCommands(actions: RunCommandActions): CommandRegistry {
  const registry = createCommandRegistry()

  registry.register({
    name: '/edit',
    run: actions.openConfig,
    via: ENTRY_IDS.config,
  })
  registry.register({
    name: '/inspect',
    run: actions.openInspect,
    via: ENTRY_IDS.inspect,
  })
  registry.register({
    name: '/versions',
    run: actions.showVersions,
    via: ENTRY_IDS.versions,
  })

  return registry
}
