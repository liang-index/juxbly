/**
 * Dynamic custom-element scan.
 *
 * Mandatory, not optional: M0 hit **zero** results on YouTube and Reddit because the
 * analyzer only knew tag names from a hardcoded list, and both sites had moved on. There
 * is no list to maintain here — anything with a hyphen in its tag name is a custom
 * element (per the HTML standard), so new components are picked up the day a site ships
 * them.
 */
import { tagOf } from './dom'

export function collectCustomElements(elements: readonly Element[]): string[] {
  const tags = new Set<string>()

  for (const element of elements) {
    const tag = tagOf(element)
    if (tag.includes('-')) tags.add(tag)
  }

  // Sorted: the model sees the same order for the same page, which keeps a rebuilt
  // prompt comparable with an earlier one.
  return [...tags].sort()
}
