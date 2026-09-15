import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for `docs/contributing/DOC_VISIBILITY.md`.
 *
 * The rule is: **rule documents are public, methodology documents are not.** A prose rule
 * alone drifts, so the boundary is enforced against what git actually tracks:
 *
 *   1. No tracked file contains CJK text. Public documents are English; a Chinese file in
 *      the tree is a methodology document that escaped. Exempt: the approved localized
 *      READMEs (`README.zh-CN.md`, `README.ja.md`) wholesale, and the shared
 *      language-switcher line inside every README — see the "Localized READMEs" rule in
 *      `DOC_VISIBILITY.md`.
 *   2. No tracked path contains non-ASCII characters. A Chinese filename cannot be typed
 *      or linked reliably across platforms.
 *   3. No path on the internal inventory is tracked at all.
 *
 * Assertion 1 is deliberately broad — it scans every tracked text file, not only `docs/`.
 * A Chinese file anywhere in a public repository is the same problem.
 *
 * The inventory below mirrors the table in `DOC_VISIBILITY.md`. Change that file first,
 * then this test.
 */

// tests/unit/architecture/ → up three levels to the repository root
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

/** Directories whose whole subtree is internal. */
const INTERNAL_PREFIXES = ['task/']

/** Individual files that are internal. */
const INTERNAL_FILES = [
  '.internal-repo',
  'AGENTS.md',
  'docs/DELTA.md',
  'docs/MAINTAINER_RUNBOOK.md',
  'docs/PRODUCT.md',
  'docs/testing/MANUAL_ACCEPTANCE.md',
  'docs/testing/PHASE1_CLOSURE_REPORT.md',
  'scripts/sync-public.mjs',
  'standard-dev-workflow-prompt-v2-open-source.md',
  'tsconfig.typecheck-tmp.json',
]

/**
 * Internal files matched by shape rather than name, so a new dated spike report or a new
 * root-level audit lands on the internal side without anyone having to extend this list.
 */
const INTERNAL_PATTERNS = [
  /^docs\/benchmark\/.*-spike-.*\.md$/,
  /^docs\/prototypes\//,
  /^Juxbly_.*\.md$/,
]

/**
 * CJK ideographs, CJK punctuation and fullwidth forms.
 *
 * Built from a string on purpose: this source file has to stay ASCII, otherwise it trips
 * its own assertion. The backslash is doubled so `RegExp` — not the JS lexer — reads the
 * escape.
 */
const CJK = new RegExp(
  '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3000-\\u303F\\uFF01-\\uFF60]',
)

/**
 * The approved localized READMEs — the only files allowed to contain CJK. The set is closed
 * by `DOC_VISIBILITY.md` ("Localized READMEs"); adding a language is a governance change
 * that starts in that file, not here.
 */
const CJK_ALLOWED = new Set(['README.zh-CN.md', 'README.ja.md'])

/**
 * Every README variant: `README.md` itself and each localized `README.<lang>.md`. Rule 4 of
 * "Localized READMEs" puts one shared language-switcher line in all of them.
 */
const README_FILE = /^README(?:\.[\w-]+)?\.md$/

/**
 * The language switcher — the first line of every README (rule 4 of "Localized READMEs"),
 * naming all five languages in canonical order, the reader's own in bold and unlinked.
 * It is part of the sanctioned design, so the CJK test runs on every README with each
 * such line removed. A line naming all five languages in order is the switcher and
 * nothing else; everything else in a non-CJK README stays CJK-free.
 *
 * The two CJK labels are assembled from code points because this file is itself scanned by
 * the assertion below and must stay CJK-free.
 */
const SIMPLIFIED_CHINESE = String.fromCodePoint(0x7b80, 0x4f53, 0x4e2d, 0x6587)
const JAPANESE = String.fromCodePoint(0x65e5, 0x672c, 0x8a9e)
const LANGUAGE_SWITCHER = new RegExp(
  `English.*${SIMPLIFIED_CHINESE}.*${JAPANESE}.*Português \\(Brasil\\).*Español`,
)

/** Git treats these as binary; reading them as UTF-8 proves nothing. */
const BINARY_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.pdf',
]

/** `-z` also disables path quoting, so non-ASCII paths come back verbatim. */
function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

function isInternal(path: string): boolean {
  if (INTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix))) return true
  if (INTERNAL_FILES.includes(path)) return true
  return INTERNAL_PATTERNS.some((pattern) => pattern.test(path))
}

/**
 * The internal working repository tracks the methodology documents on purpose, so the
 * guard would fail there forever for doing its job correctly. It carries a `.internal-repo`
 * marker, and the guard stands down when it sees one: the rule constrains the public tree,
 * and the internal repository is where the excluded documents are supposed to live.
 */
const isInternalRepo = existsSync(join(REPO_ROOT, '.internal-repo'))

describe.skipIf(isInternalRepo)('document visibility: public tree stays clean', () => {
  it('the scan is not vacuous', () => {
    // Guards against `git ls-files` returning nothing (no repo, wrong cwd) and every
    // assertion below passing on an empty list.
    expect(trackedFiles().length).toBeGreaterThan(20)
  })

  it('no tracked path is non-ASCII', () => {
    const offenders = trackedFiles().filter((path) =>
      [...path].some((character) => character.codePointAt(0)! > 0x7f),
    )

    expect(offenders).toEqual([])
  })

  it('no methodology document is tracked', () => {
    const offenders = trackedFiles().filter(isInternal)

    expect(offenders).toEqual([])
  })

  it('no tracked text file contains CJK outside the approved localized READMEs', () => {
    const offenders: string[] = []

    for (const file of trackedFiles()) {
      if (BINARY_EXTENSIONS.some((extension) => file.endsWith(extension))) continue
      if (CJK_ALLOWED.has(file)) continue

      let content = readFileSync(join(REPO_ROOT, file), 'utf8')
      if (README_FILE.test(file)) {
        content = content
          .split('\n')
          .filter((line) => !LANGUAGE_SWITCHER.test(line))
          .join('\n')
      }

      if (CJK.test(content)) {
        offenders.push(file)
      }
    }

    expect(offenders).toEqual([])
  })
})
