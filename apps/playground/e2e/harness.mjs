/**
 * The harness client: how the script changes what the *world* looks like.
 *
 * Everything here is outside the extension, and that separation is the point. The page is
 * redesigned by serving different HTML at the same URL; the model's answer is chosen by
 * telling the recorder which scenario to replay. Neither touches the extension's state.
 *
 * The call counts come from the recorder too, not from the panel: counting "did the model
 * get asked again" from the UI's own token line would be asking the surface under test to
 * grade itself.
 */
export function createHarness(origin) {
  const post = async (path, body) => {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`harness ${path} answered ${String(response.status)}`)
    return response.json()
  }

  const get = async (path) => {
    const response = await fetch(`${origin}${path}`)
    if (!response.ok) throw new Error(`harness ${path} answered ${String(response.status)}`)
    return response.json()
  }

  const state = () => get('/__harness/state')

  return {
    state,
    calls: async () => (await state()).calls,
    reset: () => post('/__harness/reset', {}),
    serveVariant: (variant) => post('/__harness/page', { variant }),
    scenario: (patch) => post('/__harness/scenario', patch),
  }
}
