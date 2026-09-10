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
 * Look up a copy key at runtime.
 *
 * `{name}` placeholders are filled from `vars` when a key carries one — the first need
 * arrived with stage 1-13's cost estimate, where the number is produced at run time and
 * splitting the sentence in two to avoid interpolation would put English word order in
 * a component. A placeholder with no matching var is left alone rather than blanked: a
 * sentence with a hole in it is easier to notice than one that silently reads wrong.
 *
 * A missing key can never throw: UI text failing must not break the UI. It degrades to
 * the key itself plus a console warning (visible in dev, harmless in prod).
 */
export type CopyVars = Readonly<Record<string, string | number>>

export function t(key: CopyKey, vars?: CopyVars): string {
  let cursor: unknown = en
  for (const part of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return warnMissing(key)
    cursor = (cursor as Record<string, unknown>)[part]
  }

  const value = typeof cursor === 'string' ? cursor : warnMissing(key)
  if (vars === undefined) return value

  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const replacement = vars[name]
    return replacement === undefined ? match : String(replacement)
  })
}

function warnMissing(key: string): string {
  // Intentionally `console`: the logger lives in @juxbly/core and the ui package
  // depends on nothing but React — a missing copy key must not pull in a dependency.
  console.warn('[JUXBLY][UI] missing copy key:', key)
  return key
}
