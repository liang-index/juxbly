import { useState } from 'react'
import type { ReactNode } from 'react'
import type { BrowserAdapter } from '@juxbly/browser'
// The patch builder lives in core, not storage: the UI is bundled into the content
// script, and the storage package is the one that can read `juxbly:settings` — the page
// context must not depend on it (§12.2).
import { buildSettingsPatch } from '@juxbly/core'
import { t } from '../copy'
import { validateKeyFormat, KEY_CREATE_URL, FREE_TIER_URL } from './key-request'
import { patchFor } from './flags'
import type { BuildCostEstimate } from './key-request'

/**
 * Node ③'s screen — the ask itself (`task/stage-1-13.md` Scope 1 + 2).
 *
 * It renders in the build panel at the moment the first real model call is next, which is
 * where the product discovers it: the endpoint read answers `NOT_CONFIGURED` before any
 * network traffic happens, so the ask costs the user nothing to reach and nothing to
 * decline.
 *
 * Two honesty rules are enforced structurally here rather than by review:
 *
 * - **The costs are numbers**, produced by `estimateBuildCost` from the page's own size
 *   and stated with the retry ceiling (A4) — never "may incur costs".
 * - **"Not now" writes no flag.** Declining is not the same as being asked-and-served;
 *   the milestone means the step actually ran, so closing the panel leaves the node owed
 *   and it comes back the next time a model call is next.
 */
export interface KeyRequestPorts {
  /** Saves the key (plus endpoint/model when given) through the background. */
  saveKey(input: { key: string; endpoint?: string; model?: string }): Promise<boolean>
  /** Marks node ③ as fired — called only when the step actually ran. */
  markRequested(): Promise<void>
}

export function createKeyRequestPorts(adapter: BrowserAdapter): KeyRequestPorts {
  return {
    async saveKey(input): Promise<boolean> {
      const reply = await adapter.messaging.send({
        kind: 'settings:set',
        // The field names live in `@juxbly/storage` (§12.2) — this file never spells one.
        patch: buildSettingsPatch({ key: input.key }),
      })
      return reply?.kind === 'settings:set_result' && reply.ok === true
    },

    async markRequested(): Promise<void> {
      // The flag's name is spoken in `flags.ts` and nowhere else: this file deals in
      // nodes, and a second spelling of the milestone is a second place to change it.
      await adapter.messaging.send({ kind: 'onboarding:set', patch: patchFor('key') })
    },
  }
}

export interface KeyRequestProps {
  ports: KeyRequestPorts
  /** The cost figures, computed by the caller from the page it is about to read. */
  cost: BuildCostEstimate
  /** Runs when the key is saved — the caller retries what it was about to do. */
  onContinue(): void
  /** Runs on "Not now" — no flag is written, the panel carries on without a key. */
  onDismiss(): void
}

export type { BuildCostEstimate }

export function KeyRequest({ ports, cost, onContinue, onDismiss }: KeyRequestProps): ReactNode {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const submit = (): void => {
    const check = validateKeyFormat(key)
    if (!check.ok) {
      setError(t(FORMAT_KEYS[check.error ?? 'empty']))
      return
    }

    setWorking(true)
    void ports
      .saveKey({ key: key.trim() })
      .then(async (saved) => {
        if (!saved) {
          setWorking(false)
          setError(t('build.error.save_failed'))
          return
        }
        await ports.markRequested()
        setWorking(false)
        onContinue()
      })
      .catch(() => {
        setWorking(false)
        setError(t('build.error.save_failed'))
      })
  }

  return (
    <section className="jx-key" aria-label={t('onboarding.key.heading')}>
      <h3 className="jx-key-heading">{t('onboarding.key.heading')}</h3>
      <p className="jx-key-note">{t('onboarding.key.body')}</p>

      <p className="jx-key-note">{t('onboarding.key.cost', { amount: cost.single })}</p>
      <p className="jx-key-note">{t('onboarding.key.cost_retry', { amount: cost.ceiling })}</p>

      <label className="jx-key-field">
        <span className="jx-key-label">{t('options.byok.key_label')}</span>
        <input
          className="jx-key-input"
          type="password"
          value={key}
          placeholder={t('onboarding.key.paste')}
          aria-label={t('onboarding.key.input_aria')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setKey(event.target.value)
            setError(null)
          }}
        />
      </label>
      {error === null ? null : <p className="jx-key-error">{error}</p>}
      <p className="jx-key-note">{t('onboarding.key.stays')}</p>

      <div className="jx-key-actions">
        <button type="button" className="jx-key-continue" disabled={working} onClick={submit}>
          {t('onboarding.key.continue')}
        </button>
        <a className="jx-link" href={KEY_CREATE_URL} target="_blank" rel="noreferrer noopener">
          {t('onboarding.key.create')}
        </a>
        <a className="jx-link" href={FREE_TIER_URL} target="_blank" rel="noreferrer noopener">
          {t('options.free.link')}
        </a>
        <button type="button" className="jx-key-dismiss" onClick={onDismiss}>
          {t('onboarding.key.not_now')}
        </button>
      </div>
    </section>
  )
}

const FORMAT_KEYS = {
  empty: 'onboarding.key.format.empty',
  too_short: 'onboarding.key.format.too_short',
  has_space: 'onboarding.key.format.has_space',
} as const
