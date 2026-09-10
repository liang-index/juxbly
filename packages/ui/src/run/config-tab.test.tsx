// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { createRunCommands } from '../commands/slash-commands'
import { ConfigTab } from './config-tab'
import { stringifyDefinition } from './config-draft'

/**
 * The config tab's behaviour — `task/stage-1-16.md` Scope 2 / Tests.
 *
 * The assertions are the three things the surface actually claims:
 *
 * - **a save is a new version** — the port is called, and the caller is told which
 *   version is live so it can adopt it (PRODUCT §12);
 * - **an invalid draft is refused with field-level reasons, and the draft survives** —
 *   losing an edit to a typo is the one failure this surface must not add;
 * - **the commands are chips** — each rendered, each driving the same registry a typed
 *   input would (no command-only behaviour).
 */
const AT = '2026-09-09T00:00:00.000Z'

function definition(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals under $50',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.deal',
        fields: { title: '.title' },
        output_to: 'raw_items',
      },
    ],
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

async function type(editor: HTMLTextAreaElement, text: string): Promise<void> {
  // React tracks the value through the prototype setter; setting the property directly
  // updates the tracker and React then sees no change. Go through the native setter —
  // the same route the testing library takes.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(editor, text)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element: Element): Promise<void> {
  // `act` async form: the save path resolves through a promise, and the assertions
  // below read the state that resolution renders.
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

interface Harness {
  saveEdit?: ReturnType<typeof vi.fn>
  onSaved?: () => void
}

function mounted({ saveEdit, onSaved }: Harness = {}): HTMLElement {
  return render(
    <ConfigTab
      tool={definition()}
      ports={{
        saveEdit: saveEdit ?? vi.fn().mockResolvedValue({ ok: true, version: 2 }),
        loadVersions: vi.fn().mockResolvedValue({ version: 1, versions: [] }),
        rollback: vi.fn().mockResolvedValue({ ok: false }),
      }}
      commands={createRunCommands({
        openConfig: () => {},
        openInspect: () => {},
        showVersions: () => {},
      })}
      versionsOpen={false}
      onToggleVersions={() => {}}
      onSaved={onSaved ?? (() => {})}
      onRolledBack={() => {}}
    />,
  )
}

describe('config tab', () => {
  it('opens with the saved definition, the three commands, and the version rule', () => {
    const node = mounted()

    expect((node.querySelector('.jx-editor') as HTMLTextAreaElement).value).toBe(
      stringifyDefinition(definition()),
    )
    expect([...node.querySelectorAll('.jx-cmd')].map((chip) => chip.textContent)).toEqual([
      '/edit',
      '/inspect',
      '/versions',
    ])
    expect(node.textContent).toContain(t('run.config.note'))
  })

  it('refuses invalid JSON with the parser’s reason and keeps the draft', async () => {
    const saveEdit = vi.fn().mockResolvedValue({ ok: false })
    const node = mounted({ saveEdit })
    const editor = node.querySelector('.jx-editor') as HTMLTextAreaElement

    await type(editor, '{ "tool_id": ')
    await click(node.querySelector('.jx-chip') as Element)

    expect(node.querySelector('[data-testid="config-error"]')).not.toBeNull()
    expect((node.querySelector('.jx-editor') as HTMLTextAreaElement).value).toBe('{ "tool_id": ')
    expect(saveEdit).not.toHaveBeenCalled()
  })

  it('refuses an unknown field with field-level reasons — and keeps the draft', async () => {
    const node = mounted()
    const editor = node.querySelector('.jx-editor') as HTMLTextAreaElement
    const broken = JSON.stringify({
      ...definition(),
      steps: [{ ...definition().steps[0], secret_mode: 'deep' }],
    })

    await type(editor, broken)
    await click(node.querySelector('.jx-chip') as Element)

    const reasons = [...node.querySelectorAll('.jx-config-reasons code')].map(
      (code) => code.textContent,
    )
    expect(reasons.some((path) => path?.startsWith('steps[0].'))).toBe(true)
    expect((node.querySelector('.jx-editor') as HTMLTextAreaElement).value).toBe(broken)
  })

  it('saves a valid edit as a new version and hands it to the caller', async () => {
    const saveEdit = vi.fn().mockResolvedValue({ ok: true, version: 2 })
    const onSaved = vi.fn()
    const node = mounted({ saveEdit, onSaved })
    const editor = node.querySelector('.jx-editor') as HTMLTextAreaElement
    const edited = { ...definition(), name: 'Deals under $40' }

    await type(editor, JSON.stringify(edited))
    await click(node.querySelector('.jx-chip') as Element)

    expect(saveEdit).toHaveBeenCalledWith({ toolId: 'tool_a', tool: edited })
    expect(node.textContent).toContain(t('run.config.saved', { version: 2 }))
    expect(onSaved).toHaveBeenCalledWith(2, edited)
  })

  it('reports a refused save without clearing the draft', async () => {
    const saveEdit = vi.fn().mockResolvedValue({ ok: false, error: 'SAVE_FAILED' })
    const node = mounted({ saveEdit })
    const editor = node.querySelector('.jx-editor') as HTMLTextAreaElement

    await type(editor, JSON.stringify(definition()))
    await click(node.querySelector('.jx-chip') as Element)

    expect(node.textContent).toContain(t('run.config.failed'))
    expect((node.querySelector('.jx-editor') as HTMLTextAreaElement).value).toBe(
      JSON.stringify(definition()),
    )
  })

  it('revert restores the saved definition, not an empty editor', async () => {
    const node = mounted()
    const editor = node.querySelector('.jx-editor') as HTMLTextAreaElement

    await type(editor, '{ "tool_id": ')
    const revert = [...node.querySelectorAll('.jx-config-buttons .jx-link')][0]
    await click(revert as Element)

    expect((node.querySelector('.jx-editor') as HTMLTextAreaElement).value).toBe(
      stringifyDefinition(definition()),
    )
  })
})
