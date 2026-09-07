/**
 * The background side of `run:llm` — `docs/ARCHITECTURE.md` §7.2.
 *
 * Why this lives in a package and not in the entrypoint: the assembly layer is allowed
 * to *register* listeners and nothing else (§6.4.1). Everything between "a message
 * arrived" and "a reply is returned" — reading the key, building the prompt, calling the
 * endpoint, classifying the failure — is business logic and belongs here.
 *
 * The `requestId` is echoed back verbatim: several runs can be in flight at once and a
 * reply that arrives on the wrong one would show one tool's answer under another's panel.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import type { Logger, RunLlmMessage, RunLlmResultMessage } from '@juxbly/core'
import { loadSettings } from '@juxbly/storage'
import { buildStepMessages } from './build-prompt'
import { callLlm, DEFAULT_API_BASE_URL } from './client'
import type { LlmFetch } from './client'
import { isLlmError } from './errors'

const log: Logger = createLogger('CAPABILITY')

export interface RunLlmDeps {
  fetchImpl?: LlmFetch
  logger?: Logger
  timeoutMs?: number
}

/**
 * Never rejects: every failure becomes `ok: false` plus a category, because this is the
 * reply a panel is waiting for. A thrown error here would leave the panel hanging and
 * surface as "nothing happened".
 */
export async function handleRunLlm(
  message: RunLlmMessage,
  adapter: BrowserAdapter,
  deps: RunLlmDeps = {},
): Promise<RunLlmResultMessage> {
  const logger = deps.logger ?? log
  const { requestId, step, input } = message

  const fail = (code: string): RunLlmResultMessage => ({
    kind: 'run:llm_result',
    requestId,
    ok: false,
    error: code,
  })

  try {
    const settings = await loadSettings(adapter)
    const apiKey = settings?.api_key ?? ''
    const model = settings?.model ?? ''

    if (apiKey.trim() === '' || model.trim() === '') {
      // Not an error to warn about: 1-13's onboarding step picks the user up from here.
      return fail('NOT_CONFIGURED')
    }

    const response = await callLlm(
      {
        endpoint: {
          baseUrl: settings?.api_base_url ?? DEFAULT_API_BASE_URL,
          apiKey,
          model,
        },
        messages: buildStepMessages(step, input),
        ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
      },
      { ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }), logger },
    )

    return {
      kind: 'run:llm_result',
      requestId,
      ok: true,
      output: response.output,
      usage: response.usage,
    }
  } catch (error) {
    const code = isLlmError(error) ? error.code : 'INVALID_RESPONSE'
    return fail(code)
  }
}
