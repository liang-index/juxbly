import { en } from './en'

/**
 * The copy bundle UI code consumes. V1 ships `en` only; adding a locale means adding
 * it here and in stage 4-5's switcher, never in a component.
 */
export type Copy = typeof en

export const copy: Copy = en

export { en }

/**
 * Dot-path union of every key in the bundle, derived from the `as const` object — a
 * misspelled key is a compile error, not a silent empty string at runtime.
 */
export type CopyKey = DotPath<typeof en>

type DotPath<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPath<T[K]>}`
    }[keyof T & string]

/**
 * Look up a copy key at runtime. Interpolation does not exist yet — the first real
 * need arrives with a later stage's copy, and adding `vars` then is additive.
 *
 * A missing key can never throw: UI text failing must not break the UI. It degrades to
 * the key itself plus a console warning (visible in dev, harmless in prod).
 */
export function t(key: CopyKey): string {
  let cursor: unknown = en
  for (const part of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return warnMissing(key)
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return typeof cursor === 'string' ? cursor : warnMissing(key)
}

function warnMissing(key: string): string {
  // Intentionally `console`: the logger lives in @juxbly/core and the ui package
  // depends on nothing but React — a missing copy key must not pull in a dependency.
  console.warn('[JUXBLY][UI] missing copy key:', key)
  return key
}
