import { createChromeAdapter } from '@juxbly/browser'
import { Options, createManagePorts, createSettingsPorts } from '@juxbly/ui'
import type { ReactNode } from 'react'
import { JUXBLY_VERSION } from '../../manifest'

/**
 * The options page — stage 1-13 replaces the 0-3 placeholder.
 *
 * Two ports objects, both built here: the settings one is answered with the BYOK subset
 * (`settings:manage`, the read only an extension page may make) and the manage one with
 * the tool list, the three numbers and the delete. The page never touches storage.
 *
 * Stage 1-16 adds the two things a report needs: the build number (`JUXBLY_VERSION`, the
 * same constant the manifest declares) and the clipboard the diagnostic line is copied
 * with — a user action, never an automatic one.
 */
export function App(): ReactNode {
  const adapter = createChromeAdapter()

  return (
    <Options
      settings={createSettingsPorts(adapter)}
      manage={createManagePorts(adapter)}
      version={JUXBLY_VERSION}
      clipboard={adapter.clipboard}
    />
  )
}
