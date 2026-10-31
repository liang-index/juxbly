import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { t } from '../copy'
import type { PresetItem, PresetPackPorts } from './ports'

/**
 * The preset pack section (stage 3-2 Track B) — ready-made tools for named pages.
 *
 * Deliberately un-clever: a list of what exists, an Add button, and the two honest
 * failure states. What a card claims about itself comes from its recipe data, never from
 * copy here, so a preset that ships is the preset that was verified (`docs/recipes/`).
 * The gesture rule from the BYOK form governs the click: the origin ask fires before any
 * await, so `permissions.request` runs inside the user gesture and the store build's
 * prompt is never lost to a round trip.
 */
export function PresetPack({ ports }: { ports: PresetPackPorts }): ReactNode {
  const presets = ports.list()
  const [installed, setInstalled] = useState<ReadonlySet<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [problem, setProblem] = useState<{ id: string; denied: boolean } | null>(null)

  useEffect(() => {
    let live = true
    void ports
      .installedIds()
      .then((ids) => {
        if (live) setInstalled(new Set(ids))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [ports])

  const install = (preset: PresetItem): void => {
    setBusyId(preset.id)
    setProblem(null)
    void ports
      .ensureSiteAccess(preset.urlPattern)
      .then((granted) => {
        if (!granted) {
          setBusyId(null)
          setProblem({ id: preset.id, denied: true })
          return
        }
        void ports.install(preset.definition).then((outcome) => {
          setBusyId(null)
          if (outcome === 'failed') {
            setProblem({ id: preset.id, denied: false })
            return
          }
          // 'already' marks too: a card must not keep offering what storage already has.
          setInstalled((previous) => new Set(previous).add(preset.definition.tool_id))
        })
      })
      .catch(() => {
        setBusyId(null)
        setProblem({ id: preset.id, denied: false })
      })
  }

  // An empty pack renders as no section at all — an empty list is not content.
  if (presets.length === 0) return null

  return (
    <section className="jx-options-section">
      <h2 className="jx-options-heading">{t('options.presets.heading')}</h2>
      <p className="jx-options-note">{t('options.presets.note')}</p>
      <ul className="jx-options-list">
        {presets.map((preset) => {
          const isInstalled = installed.has(preset.definition.tool_id)
          const busy = busyId === preset.id
          return (
            <li key={preset.id} className="jx-options-row">
              <span className="jx-options-row-main">
                <span className="jx-options-row-name">{preset.title}</span>
                <span className="jx-options-row-meta">{preset.description}</span>
                <span className="jx-options-row-meta">
                  {preset.siteLabel}
                  <span className="jx-popup-sep">·</span>
                  {preset.capabilities.join(' · ')}
                </span>
              </span>
              <button
                type="button"
                className="jx-options-secondary"
                aria-label={t('options.presets.install_aria', { title: preset.title })}
                disabled={isInstalled || busy}
                onClick={() => install(preset)}
              >
                {isInstalled
                  ? t('options.presets.added')
                  : busy
                    ? t('options.presets.installing')
                    : t('options.presets.install')}
              </button>
            </li>
          )
        })}
      </ul>
      {problem === null ? null : (
        <p className="jx-options-result" data-tone="error">
          {problem.denied ? t('options.presets.access_denied') : t('options.presets.failed')}
        </p>
      )}
    </section>
  )
}
