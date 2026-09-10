/**
 * The hashed-class rule — the one place it lives.
 *
 * A build hash (CSS-in-JS output, e.g. `css-1x2y3z4`, `jss123`) changes on the site's
 * next deploy, so any selector anchored on one is guaranteed to break. Two packages
 * enforce that fact and must not drift apart: the analyzer refuses to *build* on a
 * hashed class (`structure.ts` selector policy), and the DSL validator refuses to
 * *accept* one (§5.4). Before this module existed the regex was duplicated with a
 * mirror-either-side obligation; now there is a single source of truth.
 *
 * Conservative on purpose: mistaking a stable class for a hash costs a slightly vaguer
 * selector or a rejected candidate the model can rebuild, while mistaking a hash for a
 * stable class costs a tool that breaks on the site's next deploy.
 */

/**
 * A build hash: a run of six or more alphanumerics containing a digit (`css-1x2y3z4`,
 * `jss123`).
 */
const HASHED_CLASS = /(?=[0-9a-z]*[0-9])[0-9a-z]{6,}/i

/** Class tokens as they appear in a selector: the run after a `.`. */
const CLASS_TOKEN = /\.([A-Za-z_][-\w]*)/g

/** True when a single class token is a build hash. */
export function isHashedClassToken(token: string): boolean {
  return HASHED_CLASS.test(token)
}

/**
 * True when a CSS selector anchors on a hashed class anywhere in it — the check behind
 * the `SELECTOR_FRAGILE` validation rule (§5.4).
 */
export function isFragileSelector(selector: string): boolean {
  for (const match of selector.matchAll(CLASS_TOKEN)) {
    const token = match[1]
    if (token !== undefined && isHashedClassToken(token)) return true
  }
  return false
}
