import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for the stacking ladder inside Juxbly's shadow root.
 *
 * Every surface the content script mounts — the highlight layer, the ball, the panels —
 * lives in **one** shadow root, so the only thing deciding which is on top is a `z-index`
 * in one of three stylesheets. The prototype is the source of the ladder
 * (`docs/prototypes/juxbly-prototype-v1.html`: `.jx-hl-layer` 500, `.jx-ball` 600,
 * `.jx-panel` 700) and the order carries weight:
 *
 *   - The highlight boxes are `pointer-events: auto`, and a tool whose field selector
 *     matches a full-viewport container draws a box over the entire screen. If the panel
 *     sits *below* that box, the box takes the click and the confirm button is dead — the
 *     build flow's last step becomes unreachable while the UI looks correct.
 *   - The ball must stay above the layer for the same reason, one outcome milder: the
 *     layer is what `pointer-events: none` protects the page from, but a box is not.
 *
 * This test asserts the **order**, not the literals, so the ladder can be retuned as long
 * as the relationship survives. What it fails on is a missing declaration — and two
 * different kinds of missing both shipped:
 *
 *   - the panel declared no `z-index` at all, which parses as "auto" and loses to every
 *     sibling, and
 *   - the ball declared `z-index: 600` but no `position`, and `z-index` on a static
 *     element is a number with no effect. The ball was covered by the same box.
 *
 * So each rung must declare a `z-index` **and** a non-static `position`.
 *
 * Found on excalidraw.com during the stage 1-14 dogfood; fixed in the same stage.
 */

// tests/unit/ui/ → up three levels to the repository root
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

const CSS_DIR = 'packages/ui/src'

/** The ladder, bottom to top. Each entry names the file and the selector that declares it. */
const LADDER = [
  { name: 'highlight layer', file: `${CSS_DIR}/highlight/styles.css`, selector: '.jx-highlight-layer' },
  { name: 'floating ball', file: `${CSS_DIR}/floating-ball/styles.css`, selector: '.jx-ball' },
  { name: 'panel', file: `${CSS_DIR}/build/styles.css`, selector: '.jx-panel' },
] as const

/** One declaration out of one rule, or `null` when the rule omits it. */
function declarationOf(css: string, selector: string, property: string): string | null {
  // Anchor on the selector at the start of a line so `.jx-ball` cannot match inside
  // `.jx-ball-something`, and take the first declaration block that follows.
  const escaped = selector.replace(/\./g, '\\.')
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (block === null) return null
  const match = new RegExp(`${property}\\s*:\\s*([^;]+)`).exec(block[1] ?? '')
  return match === null ? null : (match[1] ?? '').trim()
}

describe('shadow-root stacking ladder', () => {
  const values = LADDER.map((rung) => {
    const css = readFileSync(join(REPO_ROOT, rung.file), 'utf8')
    const z = declarationOf(css, rung.selector, 'z-index')
    return { ...rung, zIndex: z === null ? null : Number(z), position: declarationOf(css, rung.selector, 'position') }
  })

  it.each(values)('$name declares a z-index ($selector)', ({ zIndex }) => {
    expect(zIndex).not.toBeNull()
    expect(Number.isNaN(zIndex)).toBe(false)
  })

  it.each(values)('$name is positioned, so its z-index applies ($selector)', ({ position }) => {
    expect(position).not.toBeNull()
    expect(position).not.toBe('static')
  })

  it('paints the panels above the highlight layer and the ball between them', () => {
    const z = values.map((rung) => rung.zIndex ?? Number.NaN)
    // Strictly increasing: layer < ball < panel.
    for (let i = 1; i < z.length; i += 1) {
      const below = values[i - 1]?.name
      const above = values[i]?.name
      expect(z[i], `${above} must paint above ${below}`).toBeGreaterThan(z[i - 1] ?? Number.NaN)
    }
  })
})
