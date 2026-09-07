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

export function readFieldValue(element: Element, type: FieldType): FieldValue {
  switch (type) {
    case 'image': {
      return { src: absolute(readSource(element), element), alt: element.getAttribute('alt') ?? '' }
    }
    case 'link': {
      return absolute(element.getAttribute('href') ?? '', element)
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
