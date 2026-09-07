/**
 * The `render` capability — `docs/ARCHITECTURE.md` §5.2 / §6.1.
 *
 * Local, deterministic, and the only capability that touches the DOM — and even then only
 * its own Shadow DOM mount point. It never reads the page: extraction is `extract` (1-5),
 * and a capability that both grabs and draws would be impossible to permission honestly.
 *
 * `itemCount === 0` is a successful render. "Nothing matched" is an answer a tool is
 * allowed to give, and the view says so in guidance copy rather than an error (UI_SPEC §7).
 */
import type { CapabilityDefinition, CapabilityInput, RenderResult } from '@juxbly/core'
import type { RenderStep } from '@juxbly/dsl'
import { MAX_ROWS } from '@juxbly/ui'
import { CapabilityError } from '../errors'
import { mountRenderedView } from './mount'

export { mountRenderedView } from './mount'

export function runRender(input: CapabilityInput<RenderStep>, container: HTMLElement): RenderResult {
  const { step, items } = input

  if (!Array.isArray(items)) {
    throw new CapabilityError(
      'INPUT_NOT_ARRAY',
      `render expected an array of records, got ${typeof items}`,
    )
  }

  // Empty is this capability's own normal result, so it is the render capability that
  // selects the empty state — an error can only come from a failed step upstream, which
  // 1-7 supplies when it calls.
  const status = items.length === 0 ? 'empty' : 'ready'
  mountRenderedView(step.view, { items, status }, container)

  return {
    view: step.view,
    itemCount: items.length,
    truncated: items.length > MAX_ROWS,
  }
}

export const renderCapability: CapabilityDefinition<
  CapabilityInput<RenderStep>,
  RenderResult
> = {
  type: 'render',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['step', 'items'],
    properties: {
      step: { type: 'object', required: ['type', 'view', 'input_from'] },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['view', 'itemCount', 'truncated'],
    properties: {
      view: { enum: ['table', 'card', 'text'] },
      itemCount: { type: 'integer', minimum: 0 },
      truncated: { type: 'boolean' },
    },
  },
  // Rendering writes only its own Shadow DOM: no page reads, no network, no storage.
  permissions: ['none'],
  securityNotes:
    'Writes exclusively into Juxbly\'s own Shadow DOM mount point (ARCHITECTURE §6.1) and never touches the host page, the network or storage. Values are rendered as text through React: no innerHTML, and only http(s) URLs become links.',

  async execute(input, ctx): Promise<RenderResult> {
    // Same fence as transform: a malformed input is a rejection, not a TypeError.
    if (!Array.isArray(input.items)) {
      throw new CapabilityError(
        'INPUT_NOT_ARRAY',
        `render expected an array of records, got ${typeof input.items}`,
      )
    }

    // Shape and count only — the records are page content and must never be logged.
    ctx.ports.log({
      tag: 'CAPABILITY',
      message: 'render',
      details: [input.step.view, input.items.length],
    })

    return runRender(input, ctx.ports.dom.mountPoint())
  },
}
