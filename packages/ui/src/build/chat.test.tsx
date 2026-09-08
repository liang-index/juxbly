// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { ChatStream } from './chat'
import type { ChatStreamProps } from './chat'
import { SAVE_FAILED, VALIDATION_FAILED } from './build-session'
import type { BuildProposal } from './proposal'
import { toProposal } from './proposal'

/**
 * Build panel DOM behaviour — `task/stage-1-9.md` Tests (DOM half; the state machine
 * lives in `tests/unit/ui/build/`).
 *
 * The two things asserted here that a screenshot cannot show: **every string comes from
 * `copy/`** (UI_SPEC §9.5) and **the composer cannot be double-fired** (UI_SPEC §7:
 * Loading is mutually exclusive). The visual review stays with the manual acceptance table.
 */

const AT = '2026-09-07T00:00:00.000Z'

function tool(): ToolDefinition {
  return {
    tool_id: 'tool_test',
    name: 'Products',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.row',
        fields: { title: '.title', price: '.price' },
        field_types: { title: 'text', price: 'text' },
        output_to: 'raw_items',
      },
    ],
  }
}

function proposal(): BuildProposal {
  return toProposal(tool(), {
    candidateIndex: 0,
    hitCount: 4,
    fieldFillRate: 1,
    shapeScore: 1,
    score: 0.9,
  })
}

const NO_CALLS = {
  onDraftChange: () => {},
  onSend: () => {},
  onSelectSuggestion: () => {},
  onConfirm: () => {},
  onRedescribe: () => {},
  onReject: () => {},
  onPick: () => {},
  onRetryStronger: () => {},
}

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
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

function props(overrides: Partial<ChatStreamProps> = {}): ChatStreamProps {
  return {
    conversation: [],
    phase: 'idle',
    proposal: null,
    escalation: 'none',
    escalationTrail: [],
    advice: [],
    error: null,
    validation: [],
    usage: null,
    suggestions: [
      { id: 'list', label: t('build.suggestions.list') },
      { id: 'prices', label: t('build.suggestions.prices') },
      { id: 'links', label: t('build.suggestions.links') },
    ],
    draft: '',
    ...NO_CALLS,
    ...overrides,
  }
}

function render(overrides: Partial<ChatStreamProps> = {}): void {
  act(() => {
    root = createRoot(container)
    root.render(<ChatStream {...props(overrides)} />)
  })
}

/** Re-render with different state — the way the panel follows the session. */
function rerender(overrides: Partial<ChatStreamProps> = {}): void {
  act(() => {
    root?.render(<ChatStream {...props(overrides)} />)
  })
}

function textarea(): HTMLTextAreaElement {
  const node = container.querySelector<HTMLTextAreaElement>('.jx-input')
  if (node === null) throw new Error('composer missing')
  return node
}

function sendButton(): HTMLButtonElement {
  const node = container.querySelector<HTMLButtonElement>('.jx-composer button')
  if (node === null) throw new Error('send button missing')
  return node
}

describe('copy discipline (UI_SPEC §9.5)', () => {
  it('renders every string from copy/, never a literal', () => {
    render({ conversation: [{ role: 'user', content: 'Collect the list', at: AT }] })

    expect(textarea().placeholder).toBe(t('build.placeholder'))
    expect(sendButton().textContent).toBe(t('build.send'))
    expect(container.querySelector('.jx-msg.is-user')?.textContent).toBe('Collect the list')

    const source = ChatStream.toString()
    // The component's own text is keys and markup; English prose here would be copy that
    // no translator can reach.
    expect(source).not.toMatch(/'[A-Z][a-z]+ [a-z]/)
  })

  it('names a save failure with its own wording, and a rejection with the field', () => {
    render({ error: SAVE_FAILED })
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe(
      t('build.error.save_failed'),
    )

    rerender({
      phase: 'failed',
      error: VALIDATION_FAILED,
      validation: [{ path: 'steps[0].fields', code: 'X', message: 'must not be empty' }],
      suggestions: [],
    })

    // "which field" is the only useful thing to say about a rejected draft.
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe(
      'steps[0].fields: must not be empty',
    )
    expect(container.textContent).not.toContain('X')
  })
})

describe('the composer', () => {
  it('sends on Enter, and treats Shift+Enter as a newline', () => {
    const onSend = vi.fn()
    render({ draft: 'Collect the list', onSend })

    act(() => {
      textarea().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      )
    })
    expect(onSend).not.toHaveBeenCalled()

    act(() => {
      textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('is inert while a proposal is in flight — no second model call (UI_SPEC §7)', () => {
    const onSend = vi.fn()
    render({ phase: 'proposing', draft: 'again', onSend })

    expect(textarea().disabled).toBe(true)
    expect(sendButton().disabled).toBe(true)

    act(() => {
      textarea().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('cannot send an empty draft', () => {
    render({ draft: '   ' })
    expect(sendButton().disabled).toBe(true)
  })
})

describe('suggestion chips (UI_SPEC §8)', () => {
  it('moves focus with ↑/↓ and selects with a click', () => {
    const onSelectSuggestion = vi.fn()
    render({ onSelectSuggestion })

    const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.jx-chip'))
    expect(chips).toHaveLength(3)
    // Roving tabindex: one stop for the group, not one per chip.
    expect(chips.map((chip) => chip.tabIndex)).toEqual([0, -1, -1])

    act(() => {
      chips[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(chips[1]?.tabIndex).toBe(0)
    expect(document.activeElement).toBe(chips[1])

    act(() => {
      chips[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(chips[0]?.tabIndex).toBe(0)

    act(() => {
      chips[0]?.click()
    })
    expect(onSelectSuggestion).toHaveBeenCalledWith(t('build.suggestions.list'))
  })

  it('disappears once the conversation has started — a repeated suggestion is noise', () => {
    render({ conversation: [{ role: 'user', content: 'Collect the list', at: AT }] })
    expect(container.querySelector('.jx-chips')).toBeNull()
  })
})

describe('the proposal and escalation', () => {
  it('shows the fields, the hit count and a confirm path', () => {
    const onConfirm = vi.fn()
    const onPick = vi.fn()
    render({ proposal: proposal(), onConfirm, onPick })

    const fields = Array.from(container.querySelectorAll<HTMLButtonElement>('.jx-field'))
    expect(fields.map((field) => field.textContent)).toEqual(['title.title', 'price.price'])
    expect(container.textContent).toContain(`4 ${t('build.proposal.matches')}`)

    act(() => {
      fields[1]?.click()
    })
    expect(onPick).toHaveBeenCalledWith('price')

    act(() => {
      container.querySelector<HTMLButtonElement>('.jx-actions .jx-btn.is-primary')?.click()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows why a level was escalated, and offers the stronger-model retry', () => {
    const onRetryStronger = vi.fn()
    render({ escalation: 'retry' })
    expect(container.textContent).toContain(t('build.escalate.retry'))

    // A3 is told, never done silently (§9.1 level ②). UI_SPEC §7.3 pins the wording.
    rerender({ escalation: 'vision' })
    expect(container.textContent).toContain(t('build.vision_fallback'))

    rerender({
      phase: 'failed',
      escalation: 'stronger-model',
      advice: ['narrow-scope', 'rephrase'],
      suggestions: [],
      onRetryStronger,
    })

    expect(container.textContent).toContain(t('build.escalate.strongerModel'))
    expect(container.textContent).toContain(t('build.advice.narrow-scope'))

    act(() => {
      container.querySelector<HTMLButtonElement>('.jx-link')?.click()
    })
    expect(onRetryStronger).toHaveBeenCalledTimes(1)
  })
})
