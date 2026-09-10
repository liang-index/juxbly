import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
// The patch builder lives in core, not storage: the UI must not depend on the package
// that can read `juxbly:settings` (§12.2) — see `packages/core/src/settings.ts`.
import { buildSettingsPatch } from '@juxbly/core'
import type { Settings } from '@juxbly/core'
import { t } from '../copy'
import { FREE_TIER_URL } from '../onboarding/key-request'
import type { ConnectivityClass } from './connectivity'
import { CONNECTIVITY_COPY, classifyConnectivity } from './connectivity'
import type { SettingsPorts } from './ports'

/**
 * The BYOK form — `task/stage-1-13.md` Scope 2, `docs/PRODUCT.md` §7.1.
 *
 * Three fields and one decision. The endpoint and model are optional in the sense that a
 * blank means "the default", not in the sense that anything goes: a base URL that is not
 * http(s) is refused by the storage layer, because it would otherwise become a fetch the
 * user never intended.
 *
 * The key is masked by default and revealed only by an explicit click (Security: "options
 * shows the key masked; viewing needs an explicit action"). The hint beside it — `…1234`
 * — is what the background computed, so the panel never needs the value to tell the user
 * which key is in there.
 */
export interface ByokFormProps {
  ports: SettingsPorts
  onSaved?(): void
}

export interface ByokFormState {
  key: string
  endpoint: string
  model: string
  reveal: boolean
  saving: boolean
  saved: boolean
  error: string | null
  testing: boolean
  testClass: ConnectivityClass | null
  tested: boolean
}

export function ByokForm({ ports, onSaved }: ByokFormProps): ReactNode {
  const [state, setState] = useState<ByokFormState>({
    key: '',
    endpoint: '',
    model: '',
    reveal: false,
    saving: false,
    saved: false,
    error: null,
    testing: false,
    testClass: null,
    tested: false,
  })
  const [saved, setSaved] = useState<{ key_set: boolean; key_hint: string | null }>({
    key_set: false,
    key_hint: null,
  })

  // What is already configured is prefilled — a user opening the page to check something
  // must not have to retype a base URL to see it.
  useEffect(() => {
    let live = true
    void ports
      .load()
      .then((view) => {
        if (!live) return
        setSaved({ key_set: view.key_set, key_hint: view.key_hint })
        setState((current) => ({
          ...current,
          endpoint: view.api_base_url ?? '',
          model: view.model ?? '',
        }))
      })
      .catch(() => {
        // An unread page renders empty; the save path is the one that has to be loud.
      })
    return () => {
      live = false
    }
  }, [ports])

  const patch = (part: Partial<ByokFormState>): void =>
    setState((current) => ({ ...current, ...part }))

  const candidate = (): Partial<Settings> =>
    buildSettingsPatch({
      ...(state.key.trim() === '' ? {} : { key: state.key.trim() }),
      endpoint: state.endpoint.trim(),
      model: state.model.trim(),
    })

  const save = (): void => {
    patch({ saving: true, saved: false, error: null })
    void ports.save(candidate()).then((ok) => {
      patch({ saving: false, saved: ok, error: ok ? null : 'SAVE_FAILED' })
      if (ok) onSaved?.()
    })
  }

  const test = (): void => {
    patch({ testing: true, tested: false, testClass: null })
    void ports.test(candidate()).then((code) => {
      patch({
        testing: false,
        tested: true,
        // `classifyConnectivity(null)` is the passing case.
        testClass: classifyConnectivity(code),
      })
    })
  }

  /**
   * Rotating a key means removing one, so the form has to be able to forget it.
   *
   * The patch is `{ key: null }` rather than an empty object: `applySettingsPatch`
   * merges, so "say nothing" would leave the old key in place and the user would be
   * told it was removed while it was still there.
   */
  const removeKey = (): void => {
    patch({ saving: true, saved: false, error: null })
    void ports.save(buildSettingsPatch({ key: null })).then((ok) => {
      patch({ saving: false, saved: false, error: ok ? null : 'SAVE_FAILED' })
      if (!ok) return
      setSaved({ key_set: false, key_hint: null })
      patch({ key: '', reveal: false })
    })
  }

  // Only the key is required to probe: a blank model falls back to the documented
  // default, so a user who pasted a key can press the button without first learning
  // what a model name is (friction ceiling, PRODUCT §10.4).
  const canTest = state.key.trim() !== ''

  return (
    <section className="jx-options-section">
      <h2 className="jx-options-heading">{t('options.byok.heading')}</h2>
      <p className="jx-options-note">{t('options.byok.body')}</p>

      <label className="jx-options-field">
        <span className="jx-options-label">{t('options.byok.key_label')}</span>
        <span className="jx-options-key-row">
          <input
            className="jx-options-input"
            type={state.reveal ? 'text' : 'password'}
            value={state.key}
            placeholder={t('options.byok.key_placeholder')}
            aria-label={t('options.byok.key_aria')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => patch({ key: event.target.value, saved: false })}
          />
          <button
            type="button"
            className="jx-options-secondary"
            onClick={() => patch({ reveal: !state.reveal })}
          >
            {state.reveal ? t('options.byok.hide') : t('options.byok.show')}
          </button>
          {saved.key_set ? (
            <button
              type="button"
              className="jx-options-secondary"
              aria-label={t('options.byok.remove_aria')}
              disabled={state.saving}
              onClick={removeKey}
            >
              {t('options.byok.remove')}
            </button>
          ) : null}
        </span>
        {saved.key_set ? (
          <span className="jx-options-note">
            {t('options.byok.key_set')}
            {saved.key_hint === null
              ? ''
              : ` — ${t('options.byok.key_hint_aria')} ${saved.key_hint.replace('…', '')}`}
          </span>
        ) : null}
      </label>

      <label className="jx-options-field">
        <span className="jx-options-label">{t('options.byok.endpoint_label')}</span>
        <input
          className="jx-options-input"
          type="url"
          value={state.endpoint}
          placeholder={t('options.byok.endpoint_placeholder')}
          aria-label={t('options.byok.endpoint_aria')}
          spellCheck={false}
          onChange={(event) => patch({ endpoint: event.target.value, saved: false })}
        />
      </label>

      <label className="jx-options-field">
        <span className="jx-options-label">{t('options.byok.model_label')}</span>
        <input
          className="jx-options-input"
          type="text"
          value={state.model}
          placeholder={t('options.byok.model_placeholder')}
          aria-label={t('options.byok.model_aria')}
          spellCheck={false}
          onChange={(event) => patch({ model: event.target.value, saved: false })}
        />
      </label>

      <div className="jx-options-actions">
        <button
          type="button"
          className="jx-options-primary"
          disabled={state.saving}
          onClick={save}
        >
          {state.saving ? t('options.byok.saving') : t('options.byok.save')}
        </button>
        <button
          type="button"
          className="jx-options-secondary"
          disabled={state.testing || !canTest}
          onClick={test}
        >
          {state.testing ? t('options.connectivity.testing') : t('options.connectivity.test')}
        </button>
        <span className="jx-options-note">{t('options.connectivity.cost')}</span>
      </div>

      {state.tested && state.testClass !== null ? (
        <p className={`jx-options-result jx-options-result--${state.testClass}`}>
          {t(CONNECTIVITY_COPY[state.testClass])}
          {state.testClass !== 'ok' ? ` ${t('options.connectivity.not_saved')}` : ''}
        </p>
      ) : null}

      {state.saved ? <p className="jx-options-result jx-options-result--ok">{t('options.byok.saved')}</p> : null}
      {state.error !== null ? <p className="jx-options-result jx-options-result--error">{t('options.byok.save_failed')}</p> : null}

      <p className="jx-options-note">
        {t('options.free.note')}{' '}
        <a
          className="jx-link"
          href={FREE_TIER_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('options.free.link')}
        </a>
      </p>
    </section>
  )
}
