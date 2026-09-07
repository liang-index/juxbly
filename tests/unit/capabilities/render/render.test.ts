// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CapabilityError, renderCapability, runRender } from '@juxbly/capabilities'
import type { RenderStep } from '@juxbly/dsl'
import { ctxStub } from '../ctx'

/**
 * `render` — the only capability that writes to the DOM, and the write goes to exactly one
 * place: Juxbly's own Shadow DOM mount point. Everything else about it is local and
 * deterministic.
 */
function step(view: RenderStep['view']): RenderStep {
  return { type: 'render', view, input_from: 'rows' }
}

function container(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

const ITEMS = [
  { title: 'Wireless keyboard', price: 49 },
  { title: 'Wireless mouse', price: 29 },
]

describe('runRender', () => {
  it('mounts the table view into the given container', () => {
    const target = container()

    const result = runRender({ step: step('table'), items: ITEMS }, target)

    expect(result).toEqual({ view: 'table', itemCount: 2, truncated: false })
    expect(target.textContent).toContain('Wireless keyboard')
    expect(target.querySelector('table')).not.toBeNull()
  })

  it('renders zero items as an empty state, not an error', () => {
    const target = container()

    runRender({ step: step('table'), items: [] }, target)

    // 0 is an answer (UI_SPEC §7): guidance copy, no error styling.
    expect(target.textContent).toContain('No rows yet')
    expect(target.querySelector('.jx-view-note--error')).toBeNull()
  })

  it('reports truncation once the row cap is passed', () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ title: `row ${String(index)}` }))
    const target = container()

    const result = runRender({ step: step('table'), items: many }, target)

    expect(result.truncated).toBe(true)
    expect(target.textContent).toContain('Some rows are hidden')
  })

  it('rejects an input that is not an array', () => {
    expect(() =>
      runRender(
        { step: step('table'), items: undefined as unknown as Record<string, unknown>[] },
        container(),
      ),
    ).toThrow(/array of records/)
  })
})

describe('renderCapability: declaration', () => {
  it('needs no permission and states exactly what it writes to', async () => {
    expect(renderCapability.permissions).toEqual(['none'])
    expect(renderCapability.securityNotes).toMatch(/Shadow DOM/)
    expect(renderCapability.securityNotes).toMatch(/innerHTML/)
  })

  it('renders through the mount point and nothing else', async () => {
    let asked = 0
    const ctx = ctxStub()
    const target = container()
    ctx.ports.dom.mountPoint = () => {
      asked += 1
      return target
    }

    const result = await renderCapability.execute({ step: step('card'), items: ITEMS }, ctx)

    expect(asked).toBe(1)
    expect(result).toEqual({ view: 'card', itemCount: 2, truncated: false })
    expect(target.querySelector('.jx-card')).not.toBeNull()
  })

  it('never puts page content into a log line', async () => {
    const ctx = ctxStub()
    ctx.ports.dom.mountPoint = () => container()
    const lines: string[] = []
    ctx.ports.log = (event) => {
      lines.push(`${event.tag} ${event.message} ${JSON.stringify(event.details ?? [])}`)
    }

    await renderCapability.execute({ step: step('text'), items: ITEMS }, ctx)

    expect(lines.join(' ')).not.toContain('Wireless')
  })

  it('rejects an input that is not an array with a stable code', async () => {
    try {
      await renderCapability.execute(
        { step: step('text'), items: null as unknown as Record<string, unknown>[] },
        ctxStub(),
      )
      expect.unreachable('expected a rejection')
    } catch (error) {
      expect((error as CapabilityError).code).toBe('INPUT_NOT_ARRAY')
    }
  })
})
