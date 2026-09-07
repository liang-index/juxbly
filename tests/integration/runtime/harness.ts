import { CapabilityRegistry, ToolRuntime, createRuntimePorts } from '@juxbly/runtime'
import type { RunOutcome, RunState } from '@juxbly/core'
import {
  extractCapability,
  llmCapability,
  renderCapability,
  transformCapability,
} from '@juxbly/capabilities'
import { createMockLlmPort, type MockLlmPort, type MockLlmPortOptions } from '@juxbly/llm'
import type { ToolDefinition, ToolStep } from '@juxbly/dsl'
import type { RuntimePorts } from '@juxbly/core'
import { createFixtureHost, type FixtureHost } from '../../fixtures/page-host'

/**
 * What a real run is made of, assembled the way the content script will assemble it
 * (1-10): fixture-hosted `DomPort`, mock `LlmPort`, real capabilities, real registry.
 *
 * Nothing here stubs the engine itself — the point of these tests is that the engine, the
 * capabilities and the ports work when wired together, which is exactly what a unit test
 * with a fake capability could not show.
 */
export interface Harness {
  registry: CapabilityRegistry
  ports: RuntimePorts
  runtime: ToolRuntime
  llm: MockLlmPort
  host: FixtureHost
  /** Where the render step mounts — Juxbly's own container, not the host page. */
  container: HTMLElement
  signal: AbortSignal
  controller: AbortController
}

export interface HarnessOptions extends MockLlmPortOptions {
  fixture?: string
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const host = createFixtureHost(options.fixture ?? 'list-page.html')
  const container = document.createElement('div')
  container.id = 'juxbly-mount'
  document.body.append(container)

  const llm = createMockLlmPort(options)
  const controller = new AbortController()

  const ports = createRuntimePorts({
    // Same port shape the content script supplies; only the mount point differs, because
    // a fixture has no Shadow DOM of its own yet (UI_SPEC §11).
    dom: { ...host.dom, mountPoint: () => container },
    llm,
    clipboard: { writeText: async () => {} },
    downloads: { download: async () => {} },
  })

  const registry = createRegistry()

  return {
    registry,
    ports,
    runtime: new ToolRuntime(registry, ports),
    llm,
    host,
    container,
    controller,
    signal: controller.signal,
  }
}

/**
 * The four capabilities 1-7 ships with. `export` is deliberately absent: it is 1-15's,
 * and the registry must stay able to take it (asserted in the unit tests).
 */
export function createRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry()
  registry.register(extractCapability)
  registry.register(transformCapability)
  registry.register(llmCapability)
  registry.register(renderCapability)
  return registry
}

export function makeTool(steps: readonly ToolStep[]): ToolDefinition {
  return {
    tool_id: 'tool_runtime_test',
    name: 'Fixture tool',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    steps: [...steps],
    created_at: '2026-09-06T00:00:00.000Z',
    updated_at: '2026-09-06T00:00:00.000Z',
  }
}

/** The §5.2 step the fixture corpus is annotated for (`.results li.product`). */
export function productExtractStep(): ToolStep {
  return {
    type: 'extract',
    mode: 'list',
    selector: '.results li.product',
    fields: { title: '.title', price: '.price', rating: '.rating' },
    output_to: 'products',
  }
}

export function summarizeStep(inputFrom = 'products'): ToolStep {
  return { type: 'llm', task: 'summarize', input_from: inputFrom, output_to: 'summary' }
}

export interface RunOnce {
  tool: ToolDefinition
  /** `undefined` — not `null` — is what a rejected run hands back, so both are accepted. */
  runState?: RunState | null | undefined
  force?: boolean | undefined
  signal?: AbortSignal
}

export function runOnce(harness: Harness, options: RunOnce): Promise<RunOutcome> {
  return harness.runtime.run(options.tool, {
    tabId: 1,
    signal: options.signal ?? harness.signal,
    ...(options.runState === undefined ? {} : { runState: options.runState }),
    ...(options.force === undefined ? {} : { force: options.force }),
  })
}

function span(document: Document, className: string, text: string): HTMLElement {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
}

/** Appends one more product to the fixture list — the cheapest way to change the data. */
export function addProduct(host: FixtureHost, title: string): void {
  const list = host.document.querySelector('.results')
  if (list === null) throw new Error('fixture: .results is missing')

  const item = host.document.createElement('li')
  item.className = 'product'
  item.append(span(host.document, 'title', title), span(host.document, 'price', '$19.00'), span(host.document, 'rating', '4.0'))

  list.append(item)
}
