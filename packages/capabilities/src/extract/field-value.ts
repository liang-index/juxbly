/**
 * Reading one value out of one element — `docs/ARCHITECTURE.md` §5.2 `FieldType`.
 *
 * All three types read **attributes or text**, never `innerHTML` and never a parsed
 * structure: the value is page content, and page content stays an opaque string until
 * something has to display it (1-5 Security).
 *
 * `image` and `link` must read attributes rather than text. That is an M0 conclusion
 * (`docs/PRODUCT.md` §4.3): the useful part of a thumbnail is its `src`, not the empty
 * text node inside the `<img>`.
 */
import type { FieldType } from '@juxbly/dsl'

/** `image` is the one field type that is not a string: an image without its `alt` is not the same image. */
export interface ExtractedImage {
  src: string
  alt: string
}

export type FieldValue = string | ExtractedImage

/**
 * `readFieldValue` can now reach **any** attribute, so it is also the first thing in the
 * product that can bulk-copy a page's hidden values into a table a user then exports as
 * CSV or JSON. That makes an attribute name a security boundary, not just a lookup key.
 *
 * This is the same rule the corpus health check already enforces on snapshots
 * (`apps/playground/lib/corpus.mjs`, `CREDENTIAL_ATTRIBUTE`), narrowed the same way:
 * `data-css-hash` is bookkeeping nobody objects to, `data-algolia-key` is a published
 * credential every scanner objects to. Refusing the read is better than redacting later,
 * because a redaction layer would have to guess which column was sensitive after the fact.
 */
const CREDENTIAL_ATTRIBUTE = /(?:^|[-_:])(?:key|keys|token|secret)(?:$|[-_:])/i

/**
 * True when an attribute name marks a credential slot.
 *
 * Exported so a build flow can refuse to *propose* such a field rather than letting the
 * user discover it as an empty column after the run.
 */
export function isCredentialAttribute(name: string): boolean {
  return CREDENTIAL_ATTRIBUTE.test(name)
}

/**
 * Reads one named attribute, or refuses.
 *
 * Returns `''` rather than throwing on a credential-shaped name: this runs per row, inside
 * a loop over up to 1000 containers, and one unusual attribute must not fail a whole run.
 * Empty is also honest — nothing was read, and `fieldPresence` will report the field as
 * missing, which is the signal health needs.
 */
function readAttribute(element: Element, name: string): string {
  if (isCredentialAttribute(name)) return ''
  return element.getAttribute(name) ?? ''
}

/**
 * @param attribute the attribute name for `attr`; ignored by every other type. `attr`
 *   without one reads `''` by design — see `FIELD_ATTR_REQUIRED`, which stops that shape
 *   at validation rather than letting it reach here.
 */
export function readFieldValue(element: Element, type: FieldType, attribute?: string): FieldValue {
  switch (type) {
    case 'image': {
      return { src: absolute(readSource(element), element), alt: element.getAttribute('alt') ?? '' }
    }
    case 'link': {
      return absolute(element.getAttribute('href') ?? '', element)
    }
    case 'attr': {
      return attribute === undefined ? '' : readAttribute(element, attribute)
    }
    case 'text': {
      return collapse(element.textContent ?? '')
    }
  }
}

/**
 * The value of a field that hit nothing. Never `undefined`: a record with an empty field
 * and a record without the key would otherwise look identical to every consumer, and
 * `fieldPresence` could not tell "missing here" from "missing everywhere".
 */
export function emptyFieldValue(type: FieldType): FieldValue {
  return type === 'image' ? { src: '', alt: '' } : ''
}

export function hasValue(value: FieldValue): boolean {
  return typeof value === 'string' ? value !== '' : value.src !== ''
}

/** `textContent` with whitespace collapsed — a value a human would recognise as the text. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** `src`, falling back to the first `srcset` candidate — the only fallback V1 promises. */
function readSource(element: Element): string {
  const src = element.getAttribute('src')
  if (src !== null && src !== '') return src

  const srcset = element.getAttribute('srcset')
  if (srcset === null || srcset.trim() === '') return ''

  const [first] = srcset.split(',')
  if (first === undefined) return ''
  const [url] = first.trim().split(/\s+/)
  return url ?? ''
}

/**
 * Resolves against the document base so that downstream rendering and export do not have
 * to know which page the value came from.
 *
 * Unresolvable values (`javascript:`, `mailto:`, a garbage attribute) are returned as
 * they are: inventing a URL would be worse than passing the original through, and the
 * render layer already refuses to turn an unsafe protocol into a link (§5.2 Edge Cases).
 */
function absolute(value: string, element: Element): string {
  if (value === '') return ''
  try {
    return new URL(value, element.ownerDocument?.baseURI).href
  } catch {
    return value
  }
}
