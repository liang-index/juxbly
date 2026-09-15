/**
 * Error categories for the connectivity probe — stage 1-13, `task/stage-1-13.md` AC 2b.
 *
 * Three classes, because "the test failed" is not a next step. The user has to be able to
 * tell *which of the three things they typed* is wrong: the key, the network, or the
 * endpoint. That is the whole value of the button, and collapsing the three into one line
 * would turn a diagnostic into a shrug (`UI_SPEC` §9 rule 2).
 *
 * The mapping is the only place the `LlmErrorCode` vocabulary becomes copy, so it sits
 * next to the form rather than inside it — the same split the run panel uses.
 */
import type { CopyKey } from '../copy'

export type ConnectivityClass = 'ok' | 'auth' | 'network' | 'endpoint' | 'unknown'

export const CONNECTIVITY_COPY: Readonly<Record<ConnectivityClass, CopyKey>> = {
  ok: 'options.connectivity.ok',
  auth: 'options.connectivity.auth',
  network: 'options.connectivity.network',
  endpoint: 'options.connectivity.endpoint',
  unknown: 'options.connectivity.unknown',
}

/**
 * `TIMEOUT` is filed under network rather than endpoint: from where the user is standing,
 * a deadline is indistinguishable from a connection that never opened, and "check your
 * connection" is the useful guess in both cases.
 *
 * `RATE_LIMIT` and `HTTP_ERROR` are endpoint problems — the endpoint answered, so the key
 * and the network both worked, and the remaining suspects are the base URL and the model.
 */
export function classifyConnectivity(code: string | null): ConnectivityClass {
  if (code === null) return 'ok'

  switch (code) {
    case 'AUTH':
      return 'auth'
    case 'NETWORK':
    case 'TIMEOUT':
    case 'ABORTED':
      return 'network'
    case 'RATE_LIMIT':
    case 'HTTP_ERROR':
    case 'INVALID_RESPONSE':
    case 'INVALID_REQUEST':
      return 'endpoint'
    default:
      return 'unknown'
  }
}
