/**
 * The one field selector that is not CSS — `docs/ARCHITECTURE.md` §5.2.
 *
 * `extract` reads a field by querying **inside** the container, and `queryAll` is
 * `root.querySelectorAll(...)`, so a container is never among its own matches. There was
 * no way to say "the value is the container itself" — the repeating unit whose only text
 * is its own, a card that *is* the title. The benchmark found what happens next: the model
 * wrote `""` or `:self` anyway, and both died at run time (`""` is not a selector, `:self`
 * is not a pseudo-class), so a tool that had already found its rows scored zero.
 *
 * Two properties decided the spelling:
 *
 * - **It fails loudly when unsupported.** `querySelectorAll(':self')` throws a
 *   `SyntaxError`, so a host that has not been updated reports a broken selector instead of
 *   quietly returning nothing. `self` would have been worse: it is a valid type selector,
 *   matching a `<self>` element that does not exist, so forgetting to handle it would have
 *   produced empty fields that look like a page with no data.
 * - **It is not CSS, and does not pretend to be.** `:scope` is real CSS and would have been
 *   the tempting choice, but `querySelectorAll(':scope')` legitimately returns nothing —
 *   the scope element is not its own descendant. Borrowing the name to mean the opposite
 *   would make the DSL lie about the platform.
 *
 * This is an addition to the DSL's vocabulary, not a control-flow construct: EC §6.1
 * forbids conditionals and loops, not naming a thing that already existed.
 */
export const SELF_SELECTOR = ':self'

export function isSelfSelector(value: string): boolean {
  return value.trim() === SELF_SELECTOR
}
