// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import { fromHealth } from '@juxbly/repair'
import type { PageAnalysis } from '@juxbly/core'
import { t } from '../copy'
import type { KeyRequestPorts } from '../onboarding/KeyRequest'
import { BuildPanel } from './BuildPanel'
import type { CandidateScorer } from './build-session'

/**
 * The key ask is a **sibling of the conversation, never a replacement for it**
 * (`task/stage-1-13.md` node ③, and the defect 1-12's acceptance found).
 *
 * The case that matters is the repair: a repair sends its preset context message the
 * moment the panel opens, so on a machine with no key the very first thing that happens
 * is a `NOT_CONFIGURED`. If the ask swaps itself in for the stream, the one sentence the
 * repair exists to show — what was observed, the likely cause, the next step — is the one
 * thing the user cannot see. They land on a key form with no idea what they were in the
 * middle of, which is exactly the "empty box" the preset was written to prevent.
 */
const AT = '2026-09-09T00:00:00.000Z'

function analysis(): PageAnalysis {
  return {
    url: 'https://shop.example/search',
    title: 'Shop',
    visibleText: 'products',
    containers: [
      {
        tagPath: 'div>ul>li',
        hitCount: 10,
        sampleFields: ['title'],
        fieldHints: [{ selector: '.title', sampleText: 'A' }],
      },
    ],
    customElements: [],
    shadowHosts: [],
    scrollHint: 'none',
    truncated: false,
    analyzedAt: AT,
  }
}

const scorer: CandidateScorer = {
  score: (candidates) =>
    candidates.map((_candidate, index) => ({
      candidateIndex: index,
      hitCount: 0,
      fieldFillRate: 0,
      shapeScore: 0,
      score: 0,
    })),
  fingerprint: () => 'same',
}

function keyRequestPorts(): KeyRequestPorts {
  return {
    saveKey: async () => true,
    markRequested: async () => {},
  }
}

/** Every proposal fails before it leaves: there is no endpoint configured. */
function unconfiguredAdapter() {
  return createMockAdapter({
    onSend: (message) =>
      message.kind === 'build:propose'
        ? {
            kind: 'build:propose_result',
            requestId: message.requestId,
            ok: false,
            error: 'NOT_CONFIGURED',
          }
        : null,
  })
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function send(text: string): void {
  const input = container.querySelector('textarea.jx-input')
  if (input === null) throw new Error('composer missing')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

function panelOf(node: HTMLElement): HTMLElement {
  const panel = node.querySelector('.jx-panel')
  if (panel === null) throw new Error('panel missing')
  return panel as HTMLElement
}

describe('the key ask (stage 1-13 node ③)', () => {
  it('appears when a proposal fails with NOT_CONFIGURED, and leaves the turn on screen', async () => {
    const node = render(
      <BuildPanel
        adapter={unconfiguredAdapter()}
        analyze={analysis}
        query={() => []}
        root={document}
        scorer={scorer}
        keyRequest={{ ports: keyRequestPorts() }}
      />,
    )
    await flush()

    send('collect the product names')
    await flush()

    expect(node.querySelector('.jx-key')).not.toBeNull()
    // The ask did not eat the conversation: what the user wrote is still readable.
    expect(panelOf(node).textContent).toContain('collect the product names')
  })

  it('never hides a repair’s preset context message — the sentence the repair exists for', async () => {
    const repair = {
      request: { toolId: 'tool_1', trigger: 'broken' as const, note: 'repaired' },
      session: fromHealth(
        { toolId: 'tool_1', version: 1 },
        { reason: 'the container is gone' },
        {
          observed: t('run.repair.context.observed'),
          cause: t('run.repair.context.cause'),
          next: t('run.repair.context.next'),
        },
      ),
    }

    const node = render(
      <BuildPanel
        adapter={unconfiguredAdapter()}
        analyze={analysis}
        query={() => []}
        root={document}
        scorer={scorer}
        keyRequest={{ ports: keyRequestPorts() }}
        repair={repair}
      />,
    )
    await flush()

    // Both at once: the ask is on screen *and* the preset message is still readable above
    // it. Before this was fixed the ask replaced the stream and this assertion failed.
    expect(node.querySelector('.jx-key')).not.toBeNull()
    expect(panelOf(node).textContent).toContain(t('run.repair.context.observed'))
    expect(panelOf(node).textContent).toContain(t('run.repair.context.cause'))
  })

  it('does not ask at all when the host never handed in the ask — tests run without it', async () => {
    const node = render(
      <BuildPanel
        adapter={unconfiguredAdapter()}
        analyze={analysis}
        query={() => []}
        root={document}
        scorer={scorer}
      />,
    )
    await flush()

    send('collect the product names')
    await flush()

    expect(node.querySelector('.jx-key')).toBeNull()
    // The turn is still there; the generic failure line is the fallback (1-9's behaviour).
    expect(panelOf(node).textContent).toContain('collect the product names')
  })

  it('only writes the milestone when the key was actually saved', async () => {
    const markRequested = vi.fn(async () => {})
    const node = render(
      <BuildPanel
        adapter={unconfiguredAdapter()}
        analyze={analysis}
        query={() => []}
        root={document}
        scorer={scorer}
        keyRequest={{ ports: { ...keyRequestPorts(), markRequested } }}
      />,
    )
    await flush()

    send('collect the product names')
    await flush()
    expect(markRequested).not.toHaveBeenCalled()

    const key = node.querySelector('.jx-key-input')
    if (key === null) throw new Error('key input missing')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(key, 'sk-test-abcdef123456')
      key.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      node
        .querySelector('.jx-key-continue')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(markRequested).toHaveBeenCalledTimes(1)
  })
})
