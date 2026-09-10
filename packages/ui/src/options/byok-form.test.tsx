// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings, SettingsView } from '@juxbly/core'
import { t } from '../copy'
import { ByokForm } from './byok-form'
import type { SettingsPorts } from './ports'

/**
 * The BYOK form — `task/stage-1-13.md` AC 2 / 2a / 2b / 4, `docs/PRODUCT.md` §7.1.
 *
 * Four rules, all of them about what the page must *not* do on its own:
 *
 *   1. **The probe never fires by itself.** It spends the user's money, so it runs on a
 *      click and on nothing else — not on mount, not on save, not on a field change.
 *   2. **A failed probe does not block the save.** Someone configuring Juxbly on a plane
 *      still has to be able to keep what they typed (edge cases, AC 2b).
 *   3. **The key is masked until asked for** — one explicit click, and the value shown is
 *      the hint the background computed, never the key.
 *   4. **The zero-cost path is present and unquantified**: it says a free tier can exist
 *      and quotes no allowance, because a provider's policy is not ours to promise.
 */
const VIEW: SettingsView = {
  key_set: true,
  key_hint: '…1234',
  api_base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  floating_ball_enabled: true,
}

function ports(overrides: Partial<SettingsPorts> = {}): SettingsPorts {
  return {
    load: async () => VIEW,
    save: async () => true,
    test: async () => null,
    ...overrides,
  }
}

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = undefined
  container.remove()
})

function render(node: ReactNode): HTMLElement {
  act(() => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

/** React's own event system, so `onChange` and `onClick` run as they do in a browser. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function setInput(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function buttonWith(node: HTMLElement, label: string): HTMLButtonElement {
  const button = [...node.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (button === undefined) throw new Error(`button "${label}" missing`)
  return button as HTMLButtonElement
}

function inputWithLabel(node: HTMLElement, label: string): HTMLInputElement {
  const field = [...node.querySelectorAll('label')].find(
    (element) => element.querySelector('.jx-options-label')?.textContent === label,
  )
  const input = field?.querySelector('input')
  if (input === undefined) throw new Error(`input "${label}" missing`)
  return input as HTMLInputElement
}

describe('BYOK form', () => {
  it('prefills what is already configured, so checking does not mean retyping', async () => {
    const node = render(<ByokForm ports={ports()} />)
    await flush()

    expect(inputWithLabel(node, t('options.byok.endpoint_label')).value).toBe(VIEW.api_base_url)
    expect(inputWithLabel(node, t('options.byok.model_label')).value).toBe(VIEW.model)
  })

  it('masks the key and reveals it only on an explicit click', async () => {
    const node = render(<ByokForm ports={ports()} />)
    await flush()

    const key = inputWithLabel(node, t('options.byok.key_label'))
    expect(key.getAttribute('type')).toBe('password')

    act(() => {
      buttonWith(node, t('options.byok.show')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(inputWithLabel(node, t('options.byok.key_label')).getAttribute('type')).toBe('text')
  })

  it('never probes on its own — the test is a spend and runs on a click only', async () => {
    const test = vi.fn(async () => null)
    const node = render(<ByokForm ports={ports({ test })} />)
    await flush()

    expect(test).not.toHaveBeenCalled()

    // Saving is not a probe either: the two buttons are independent on purpose.
    act(() => {
      buttonWith(node, t('options.byok.save')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await flush()
    expect(test).not.toHaveBeenCalled()
  })

  it('names which of the three things is wrong, and says the save is still possible', async () => {
    for (const [code, expected] of [
      ['AUTH', t('options.connectivity.auth')],
      ['NETWORK', t('options.connectivity.network')],
      ['HTTP_ERROR', t('options.connectivity.endpoint')],
    ] as const) {
      const node = render(<ByokForm ports={ports({ test: async () => code })} />)
      await flush()

      setInput(inputWithLabel(node, t('options.byok.key_label')), 'sk-test-abcdef123456')
      setInput(inputWithLabel(node, t('options.byok.model_label')), 'gpt-4o-mini')

      act(() => {
        buttonWith(node, t('options.connectivity.test')).dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        )
      })
      await flush()

      const result = node.querySelector('.jx-options-result')
      expect(result?.textContent).toContain(expected)
      // A failed probe is information, never a gate (edge cases).
      expect(result?.textContent).toContain(t('options.connectivity.not_saved'))
      expect(node.textContent).not.toContain(t('options.connectivity.unknown'))

      act(() => {
        root?.unmount()
      })
      root = undefined
    }
  })

  it('reports a refused save instead of showing "Saved."', async () => {
    const node = render(<ByokForm ports={ports({ save: async () => false })} />)
    await flush()

    act(() => {
      buttonWith(node, t('options.byok.save')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await flush()

    expect(node.textContent).toContain(t('options.byok.save_failed'))
    expect(node.textContent).not.toContain(t('options.byok.saved'))
  })

  it('carries the zero-cost path, with no allowance and no permanence promised', async () => {
    const node = render(<ByokForm ports={ports()} />)
    await flush()

    const text = node.textContent ?? ''
    expect(text).toContain(t('options.free.note'))
    // The discipline is structural: shipped copy never quantifies a provider's policy.
    expect(/\d+\s?(requests|tokens|credits)|permanent|forever|unlimited/i.test(text)).toBe(false)
    expect(node.querySelector('a[href*="github.com/liang-index/juxbly"]')).not.toBeNull()
  })
})

/**
 * Two things the first pass of the form could not do, both of which a user hits in the
 * first five minutes:
 *
 *   - **Forgetting a key.** Rotating a credential is the normal reason to open this page,
 *     so "remove" is not an edge case — and it has to be a real removal, not a form that
 *     forgets what storage still holds (`task/stage-1-13.md` AC 4).
 *   - **Testing with only a key.** A model name is a thing enthusiasts know and a
 *     first-time user does not, so the probe must be reachable the moment a key is
 *     pasted (friction ceiling, PRODUCT §10.4).
 */
describe('key lifecycle (AC 4 / friction ceiling)', () => {
  it('offers to remove a saved key, and patches it to null rather than to nothing', async () => {
    // The patch is captured rather than read back off `save.mock.calls`: the assertion is
    // about the *value* the form sends, and naming the argument keeps it from being dead
    // weight the linter is right to reject.
    const seen: Partial<Settings>[] = []
    const save = vi.fn(async (patch: Partial<Settings>) => {
      seen.push(patch)
      return true
    })
    const node = render(<ByokForm ports={ports({ save })} />)
    await flush()

    const remove = buttonWith(node, t('options.byok.remove'))
    act(() => {
      remove.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(save).toHaveBeenCalledTimes(1)
    const patch = (seen[0] ?? {}) as Record<string, unknown>
    // Asserted on the *shape*, never on the field name: §12.2 keeps the credential field
    // spelled in exactly one place (`packages/core/src/settings.ts`), and a UI test that
    // wrote it out would trip the key-leak source scan — which is the guard doing its job.
    // `null`, not `undefined`: an absent field is "leave it alone", and the key would still
    // be there while the UI claims it is gone. `undefined` is dropped by
    // `sanitizeSettingsPatch`, so a patch that forgot to clear it arrives as `{}`.
    expect(Object.keys(patch)).toHaveLength(1)
    expect(Object.values(patch)).toEqual([null])
    // The row stops advertising a key that no longer exists.
    expect(node.textContent).not.toContain(t('options.byok.remove'))
  })

  it('never offers removal when no key is stored — there is nothing to remove', async () => {
    const node = render(
      <ByokForm
        ports={ports({ load: async () => ({ ...VIEW, key_set: false, key_hint: null }) })}
      />,
    )
    await flush()

    expect(
      [...node.querySelectorAll('button')].some(
        (element) => element.textContent?.trim() === t('options.byok.remove'),
      ),
    ).toBe(false)
  })

  it('lets a key be probed without a model name — the default model stands in', async () => {
    const test = vi.fn(async () => null)
    const node = render(<ByokForm ports={ports({ test })} />)
    await flush()

    setInput(inputWithLabel(node, t('options.byok.key_label')), 'sk-test-abcdef123456')
    const probe = [...node.querySelectorAll('button')].find(
      (element) => element.textContent?.trim() === t('options.connectivity.test'),
    ) as HTMLButtonElement

    expect(probe.disabled).toBe(false)
    act(() => {
      probe.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(test).toHaveBeenCalledTimes(1)
  })
})
