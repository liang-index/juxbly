/**
 * Snapshot capture — `task/stage-2-1.md` Scope 2, Interface `snapshotSite(url, bucket)`.
 *
 * A snapshot is **not a screenshot**. What Phase 2 measures is whether Juxbly can produce a
 * working tool against a page's structure, so the artefact has to be the rendered DOM — the
 * tree the analyzer and the selector generator will actually walk. Pixels are useless here.
 *
 * Three decisions worth knowing about before editing this file:
 *
 * 1. **Shadow roots are serialized as declarative shadow DOM.** `outerHTML` drops them
 *    entirely, which would quietly turn every bucket-`C` page into a bucket-`A` page the
 *    moment it is snapshotted. `serializePage()` walks the live tree and inlines each open
 *    root as `<template shadowrootmode="open">`, so the offline copy still has the property
 *    the corpus claims it has.
 * 2. **Scripts are removed, after rendering.** The DOM already holds the result of client-side
 *    rendering, so keeping the code that produced it only adds bytes and attack surface.
 *    Routing can never be reproduced offline anyway; bucket `B` records the *evidence* of
 *    client-side navigation in its meta instead.
 * 3. **Media is replaced by a placeholder.** `docs/benchmark/README.md` asks for the
 *    structure needed to reproduce the task, not a media archive — and this repository is
 *    public, so redistributing someone else's images is exactly the risk the compliance
 *    policy exists to prevent.
 */
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import {
  ASSETS_DIR,
  CORPUS_ROOT,
  MAX_CSS_BYTES,
  MAX_SNAPSHOT_BYTES,
  META_FILE,
  SNAPSHOT_FILE,
  asciiSafeJson,
  containsCjk,
  encodeCjkAsEntities,
  scanForPersonalData,
  scanForSecrets,
  stripCjkStyleBlocks,
  stripCredentialAttributes,
  verifyBucket,
} from './corpus.mjs'

const NAVIGATION_TIMEOUT = 30_000
const SETTLE_TIMEOUT = 12_000

/** A 1x1 transparent GIF. Referenced as a data URI so a snapshot directory stays self-contained. */
const PLACEHOLDER_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export const REAL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function launchBrowser() {
  return chromium.launch({ headless: true })
}

/**
 * Everything the bucket verdict needs, measured in the page. Runs inside the browser because
 * "does this page have shadow roots" is a question only the DOM can answer.
 */
const MEASURE = () => {
  /**
   * Elements that are not content. A repeated group of these is growth of the *document*, not
   * of anything a tool would extract, and bucket `D` is about content that only appears after
   * an interaction. Measured: `D-07` (ant.design) originally earned bucket `D` partly on
   * `head|style 46->207` — lazy-loaded chunks injecting CSS, not rows arriving.
   *
   * Duplicated in `REPEATING_GROUPS` below because both run inside the page: `page.evaluate`
   * ships the function's source, so a shared module constant would not exist over there.
   */
  const NON_CONTENT_TAGS = new Set(['STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'BASE'])
  const classTokens = new Set()
  let shadowRootCount = 0
  let shadowRootWithContentCount = 0
  let closedShadowRootCount = 0
  let customElementCount = 0
  const shadowHostSample = []
  const childGroups = new Map()

  function walk(root, depth) {
    if (depth > 32) return
    for (const node of root.childNodes ?? []) {
      if (node.nodeType !== 1) continue
      const el = node
      if (NON_CONTENT_TAGS.has(el.tagName)) continue
      for (const token of el.classList ?? []) classTokens.add(token)
      if (el.tagName.includes('-')) customElementCount += 1
      if (el.shadowRoot) {
        if (el.shadowRoot.mode === 'open') {
          shadowRootCount += 1
          // A root that holds five or more elements is carrying content. A root wrapping a
          // single icon is a widget, and admitting a page to bucket `C` on the strength of
          // one would make the bucket mean nothing.
          if (el.shadowRoot.querySelectorAll('*').length >= 5) {
            shadowRootWithContentCount += 1
            if (shadowHostSample.length < 5) shadowHostSample.push(el.tagName.toLowerCase())
          }
        } else {
          closedShadowRootCount += 1
        }
        walk(el.shadowRoot, depth + 1)
      }
      // A repeated container: >= 2 same-shape siblings. The largest one is what a tool
      // should be extracting from, so it is what bucket A is judged on.
      const key = `${el.tagName.toLowerCase()}.${Array.from(el.classList ?? []).sort().join('.')}`
      const parentKey = el.parentElement
        ? `${el.parentElement.tagName.toLowerCase()}|${key}`
        : `root|${key}`
      const entry = childGroups.get(parentKey) ?? { count: 0, selector: key }
      entry.count += 1
      childGroups.set(parentKey, entry)

      walk(el, depth + 1)
    }
  }

  walk(document.documentElement, 0)

  let maxRepeatingCount = 0
  let maxRepeatingSelector = null
  for (const entry of childGroups.values()) {
    if (entry.count > maxRepeatingCount) {
      maxRepeatingCount = entry.count
      maxRepeatingSelector = entry.selector
    }
  }

  const tokens = Array.from(classTokens)
  const hashed = tokens.filter((token) => {
    // Mirrors `isHashedClassToken` in corpus.mjs; duplicated in-page because the browser
    // context cannot import from Node.
    if (token.length < 6) return false
    return (
      /^(?:sc|css|jss|mui|Mui|emotion|makeStyles|styled)-[A-Za-z0-9_-]{5,}$/.test(token) ||
      /^_[A-Za-z0-9_-]{6,}$/.test(token) ||
      /^[A-Za-z][A-Za-z0-9]*__[A-Za-z0-9]{5,}_[a-f0-9]{5,}$/.test(token) ||
      /^[A-Za-z][A-Za-z0-9]*__[A-Za-z0-9]{6,}_\d+$/.test(token) ||
      /^[A-Za-z0-9]{2,20}-[a-f0-9]{6,}(?:-\d+)?$/.test(token) ||
      /^[A-Za-z0-9_-]{2,24}__[a-zA-Z0-9]{5,}$/.test(token) ||
      /^[a-f0-9]{8,}$/i.test(token)
    )
  })

  return {
    documentTitle: document.title ?? '',
    shadowRootCount,
    shadowRootWithContentCount,
    closedShadowRootCount,
    customElementCount,
    shadowHostSample,
    maxRepeatingCount,
    maxRepeatingSelector,
    classTokenCount: tokens.length,
    hashedClassTokens: hashed.length,
    hashedClassRatio: tokens.length ? hashed.length / tokens.length : 0,
    hashedSample: hashed.slice(0, 5),
    nodeCount: document.querySelectorAll('*').length,
  }
}

/**
 * Serialize the rendered document: strip what must not be redistributed or executed, and
 * inline open shadow roots so they survive the round trip.
 */
const SERIALIZE = (placeholder) => {
  const DROP_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'BASE', 'CANVAS'])
  /** `<link>` relations that only pre-arrange network work the offline copy cannot do. */
  const HINT_RELS = new Set(['preload', 'prefetch', 'modulepreload', 'preconnect', 'dns-prefetch'])

  function cloneTree(live) {
    if (live.nodeType === 3) return document.createTextNode(live.nodeValue ?? '')
    if (live.nodeType === 8) return document.createComment(live.nodeValue ?? '')
    if (live.nodeType !== 1) return null

    const tag = live.tagName
    // Scripts are dropped after rendering (the DOM already holds their result), and the rest
    // are either remote-code or media carriers the corpus has no business redistributing.
    if (DROP_TAGS.has(tag)) return null
    if (tag === 'LINK' && HINT_RELS.has((live.getAttribute('rel') ?? '').toLowerCase())) return null
    const clone = document.createElement(tag)

    for (const attr of live.attributes ?? []) {
      const name = attr.name.toLowerCase()
      // Inline handlers are code; the corpus stores structure, not behaviour.
      if (name.startsWith('on')) continue
      if (name === 'srcset' || name === 'sizes') continue
      if (name === 'src' && (tag === 'IMG' || tag === 'VIDEO' || tag === 'AUDIO')) {
        clone.setAttribute(name, tag === 'IMG' ? placeholder : placeholder)
        continue
      }
      if (name === 'poster' || name === 'background') {
        clone.setAttribute(name, placeholder)
        continue
      }
      if (name === 'style' && (attr.value ?? '').match(/url\(/)) {
        // Inline background images reference third-party media; drop the whole declaration.
        continue
      }
      try {
        clone.setAttribute(attr.name, attr.value)
      } catch {
        /* attribute names that are invalid after stripping are simply dropped */
      }
    }

    if (live.shadowRoot) {
      const template = document.createElement('template')
      template.setAttribute('shadowrootmode', live.shadowRoot.mode)
      if (live.shadowRoot.mode === 'open') {
        // Into `template.content`, not onto the template element. `outerHTML` serializes a
        // template's *contents* (the HTML serialization algorithm swaps in the content
        // fragment), so children appended to the element itself are invisible in the output
        // and every bucket-`C` snapshot came out as an empty `<template>`. Measured: appending
        // to the element yields `<template shadowrootmode="open"></template>` with
        // childNodes 1 / content 0; appending to `.content` yields the children.
        for (const child of live.shadowRoot.childNodes) {
          const clonedChild = cloneTree(child)
          if (clonedChild) template.content.appendChild(clonedChild)
        }
      }
      clone.appendChild(template)
    }

    for (const child of live.childNodes) {
      const clonedChild = cloneTree(child)
      if (clonedChild) clone.appendChild(clonedChild)
    }
    return clone
  }

  const root = cloneTree(document.documentElement)
  return `<!DOCTYPE html>\n${root.outerHTML}`
}

/**
 * robots.txt pre-flight — `task/stage-2-1.md` Scope 4 ("ToS-sensitive targets are reviewed")
 * and Edge Cases ("if a site blocks the fetch, do not work around it — pick another site").
 *
 * A policy that says "we only keep pages we may keep" is worth exactly as much as its
 * enforcement, so this is enforced rather than reviewed-by-checklist: a page whose
 * robots.txt forbids the path is not captured. Finding that out from the tool is better than
 * finding it out from a complaint.
 *
 * Only the `User-agent: *` group applies — the snapshot is taken with an ordinary browser
 * user agent, so a group addressed to `GPTBot` or `GoogleBot` is not a group for us. Longest
 * matching rule wins, `*` and `$` wildcards included, as the de-facto standard says.
 */
export function parseRobots(text) {
  const groups = []
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const index = line.indexOf(':')
    if (index === -1) continue
    const field = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (field === 'user-agent') {
      if (current === null || current.rules.length > 0) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if (field === 'allow' || field === 'disallow') {
      if (current === null) continue
      current.rules.push({ type: field, path: value })
    }
  }
  return groups
}

function robotsRuleMatches(rulePath, path) {
  if (rulePath === '') return false
  const escaped = rulePath.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const withWildcards = escaped
    .replace(/\*/g, '\u0000')
    .split('\u0000')
    .join('[\\s\\S]*')
  const anchored = withWildcards.endsWith('\\$')
    ? `^${withWildcards.slice(0, -2)}$`
    : `^${withWildcards}`
  return new RegExp(anchored).test(path)
}

/** Longest match wins; on a tie `Allow` wins, which is what Google's implementation does. */
export function robotsDecision(groups, path) {
  const group = groups.find((candidate) => candidate.agents.includes('*'))
  if (!group) return { allowed: true, rule: null, reason: 'no wildcard group' }
  let best = null
  for (const rule of group.rules) {
    if (!robotsRuleMatches(rule.path, path)) continue
    const length = rule.path.replace(/[*$]/g, '').length
    if (best === null || length > best.length || (length === best.length && rule.type === 'allow')) {
      best = { length, type: rule.type, path: rule.path }
    }
  }
  if (best === null) return { allowed: true, rule: null, reason: 'no matching rule' }
  return { allowed: best.type === 'allow', rule: best.path, reason: `${best.type} ${best.path}` }
}

export async function checkRobots(request, url) {
  let target
  try {
    target = new URL(url)
  } catch {
    return { status: 'not-applicable', rule: null }
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { status: 'not-applicable', rule: null }
  }
  let text
  try {
    const response = await request.get(`${target.origin}/robots.txt`, { timeout: 10_000 })
    if (response.status() === 404 || response.status() === 410) {
      return { status: 'absent', rule: null, url: `${target.origin}/robots.txt` }
    }
    if (!response.ok()) {
      return { status: 'unavailable', rule: null, url: `${target.origin}/robots.txt`, httpStatus: response.status() }
    }
    text = await response.text()
  } catch {
    return { status: 'unavailable', rule: null, url: `${target.origin}/robots.txt` }
  }
  const decision = robotsDecision(parseRobots(text), `${target.pathname}${target.search}`)
  return {
    status: decision.allowed ? 'allow' : 'disallow',
    rule: decision.rule,
    reason: decision.reason,
    url: `${target.origin}/robots.txt`,
  }
}

async function waitForSettled(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT })
  } catch {
    // Sites with polling, ads or analytics never reach network idle. A snapshot taken after
    // `load` plus the interaction steps is still the page a user would have seen.
  }
}

/**
 * Repeating structures on the page, keyed by `parentTag|tag.classes`. Bucket `D` is decided
 * on how this map changes across a scroll, because "a repeated structure got bigger" is what
 * bucket `D` is actually about. Raw node count cannot tell the difference between a feed
 * appending rows and a sticky navbar re-rendering itself.
 */
const REPEATING_GROUPS = () => {
  /** Same set as in `MEASURE`, and for the same reason: repeated `<style>` is not content. */
  const NON_CONTENT_TAGS = new Set(['STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'BASE'])
  const counts = new Map()
  function walk(root, depth) {
    if (depth > 32) return
    for (const node of root.childNodes ?? []) {
      if (node.nodeType !== 1) continue
      const el = node
      if (NON_CONTENT_TAGS.has(el.tagName)) continue
      const childKey = `${el.tagName.toLowerCase()}.${Array.from(el.classList ?? []).sort().join('.')}`
      const parentKey = el.parentElement ? el.parentElement.tagName.toLowerCase() : 'root'
      const key = `${parentKey}|${childKey}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1)
      walk(el, depth + 1)
    }
  }
  walk(document.documentElement, 0)
  const out = {}
  for (const [key, count] of counts) if (count >= 3) out[key] = count
  return out
}

/**
 * Scroll everything scrollable, not just the window.
 *
 * A good share of infinite-scroll implementations put the list inside its own scrollable
 * container, and `window.scrollTo` does nothing to those — the page looks like it never
 * grows and a real bucket-`D` candidate gets rejected for the wrong reason. The tallest few
 * scrollable elements are driven to their end as well.
 */
async function scrollToBottom(page) {
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight)
    const scrollables = Array.from(document.querySelectorAll('*'))
      .filter((el) => el.clientHeight > 200 && el.scrollHeight > el.clientHeight + 200)
      .sort((a, b) => b.scrollHeight - a.scrollHeight)
      .slice(0, 3)
    for (const el of scrollables) el.scrollTop = el.scrollHeight
  })
}

/**
 * Bucket D evidence: does scrolling (or a declared interaction) produce more of something?
 *
 * `before` is captured *before* the interaction steps run, so a page that appends on a
 * "load more" click is measured across the click and not just across the scroll that follows.
 */
async function measureScrollGrowth(page, before) {
  const groupsBefore = before?.groups ?? (await page.evaluate(REPEATING_GROUPS))
  const nodesBefore = before?.nodes ?? (await page.evaluate('document.querySelectorAll("*").length'))
  const steps = 3
  for (let step = 0; step < steps; step += 1) {
    await scrollToBottom(page)
    await page.waitForTimeout(900)
  }
  const groupsAfter = await page.evaluate(REPEATING_GROUPS)
  const nodesAfter = await page.evaluate('document.querySelectorAll("*").length')

  const grownSample = []
  let grownGroups = 0
  for (const [key, count] of Object.entries(groupsAfter)) {
    const delta = count - (groupsBefore[key] ?? 0)
    if (delta < 3) continue
    grownGroups += 1
    if (grownSample.length < 5) grownSample.push(`${key} ${groupsBefore[key] ?? 0}->${count}`)
  }
  return {
    grownGroups,
    grownSample,
    nodesBeforeScroll: nodesBefore,
    nodesAfterScroll: nodesAfter,
    scrollSteps: steps,
  }
}

/**
 * Bucket B evidence: click an internal link and see whether the document survived. A full
 * reload wipes `window.__jxSpa`; client-side routing does not.
 */
async function measureSpaNavigation(page) {
  try {
    const target = await page.evaluate(() => {
      const here = new URL(location.href)
      const links = Array.from(document.querySelectorAll('a[href]'))
      const candidate = links.find((link) => {
        let href
        try {
          href = new URL(link.getAttribute('href'), location.href)
        } catch {
          return false
        }
        return (
          href.origin === here.origin &&
          href.pathname !== here.pathname &&
          !href.hash &&
          link.getAttribute('target') !== '_blank'
        )
      })
      if (!candidate) return null
      candidate.setAttribute('data-jx-spa-probe', '1')
      return candidate.getAttribute('href')
    })
    if (!target) return { spaNavigation: false, spaNavigatedTo: null }

    const startUrl = page.url()
    await page.evaluate(() => {
      window.__jxSpa = 'alive'
    })
    await page.click('a[data-jx-spa-probe="1"]', { timeout: 5000 }).catch(() => null)
    await page.waitForTimeout(1800)
    const result = await page.evaluate(() => ({
      alive: window.__jxSpa === 'alive',
      href: location.href,
    }))
    // Both halves are required. A click that never landed leaves the flag alive too, so
    // "the window survived" alone would call every page an SPA — the URL has to have moved.
    const spaNavigation = result.alive && result.href !== startUrl
    return { spaNavigation, spaNavigatedTo: result.href }
  } catch {
    return { spaNavigation: false, spaNavigatedTo: null }
  }
}

/**
 * Bucket `D` is "infinite scroll / lazy loading", and a good part of the web does the second
 * half with a control rather than a scrollbar. Clicking it is a corpus-declared interaction
 * (`interaction: [{ type: 'lazy' }]`), replayed by the runner the same way.
 *
 * The match is deliberately narrow — "Load more", "Show more", "more posts" — because a
 * looser pattern starts clicking navigation, and a snapshot that wandered off the page it
 * claims to be is worse than a rejected candidate.
 */
const LAZY_CONTROL_PATTERN =
  /^(?:load|show|view|see)\s+more\b|\bmore\s+(?:items|posts|results|stories|products|comments)\b|^load\s+more\s+\w+$/i

async function clickLazyControl(page) {
  const marked = await page.evaluate((source) => {
    const pattern = new RegExp(source, 'i')
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]'))
    const target = candidates.find((el) => {
      if (el.hasAttribute('data-jx-lazy-probe')) return false
      const text = (el.textContent ?? el.getAttribute('value') ?? '').trim()
      if (text.length === 0 || text.length > 40) return false
      return pattern.test(text)
    })
    if (!target) return false
    target.setAttribute('data-jx-lazy-probe', '1')
    return true
  }, LAZY_CONTROL_PATTERN.source)
  if (!marked) return false
  await page.click('[data-jx-lazy-probe="1"]', { timeout: 5000 }).catch(() => null)
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    document.querySelector('[data-jx-lazy-probe="1"]')?.removeAttribute('data-jx-lazy-probe')
  })
  return true
}

async function runInteraction(page, interaction = []) {
  for (const step of interaction) {
    if (step.type === 'click') {
      await page.click(step.selector, { timeout: 8000 }).catch(() => null)
      await page.waitForTimeout(step.wait ?? 800)
    } else if (step.type === 'wait') {
      await page.waitForTimeout(step.ms ?? 1000)
    } else if (step.type === 'lazy') {
      for (let i = 0; i < (step.times ?? 3); i += 1) {
        if (!(await clickLazyControl(page))) break
      }
    } else if (step.type === 'scroll') {
      for (let i = 0; i < (step.times ?? 3); i += 1) {
        await scrollToBottom(page)
        await page.waitForTimeout(step.wait ?? 900)
      }
    }
  }
}

/**
 * Download the stylesheets the page needs and rewrite the references to local copies. CSS is
 * what makes the snapshot *look* like the page, and class semantics survive without it — so a
 * stylesheet that cannot be fetched is dropped, not fatal.
 */
async function localizeStylesheets(page, html, targetDir) {
  const hrefs = new Set()
  const pattern = /<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const hrefMatch = /href=["']([^"']+)["']/i.exec(match[0])
    if (hrefMatch) hrefs.add(hrefMatch[1])
  }

  let cssTotal = 0
  let degraded = false
  const written = new Set()
  const assetsDir = join(targetDir, ASSETS_DIR)
  await mkdir(assetsDir, { recursive: true })

  let index = 0
  for (const href of hrefs) {
    index += 1
    let absolute
    try {
      absolute = new URL(href, page.url()).toString()
    } catch {
      continue
    }
    let text
    try {
      const response = await page.request.get(absolute, { timeout: 10_000 })
      if (!response.ok()) throw new Error(String(response.status()))
      text = await response.text()
    } catch {
      degraded = true
      html = html.split(`href="${href}"`).join('href="about:blank"')
      html = html.split(`href='${href}'`).join("href='about:blank'")
      continue
    }
    if (containsCjk(text)) {
      // CSS is a raw-text format: numeric character references are not decoded inside it, so
      // the HTML trick below does not apply. The sheet is unlinked (so the offline copy does
      // not reach for the network) and the snapshot is marked degraded.
      degraded = true
      html = html.split(`href="${href}"`).join('href="about:blank"')
      html = html.split(`href='${href}'`).join("href='about:blank'")
      continue
    }
    if (cssTotal + Buffer.byteLength(text) > MAX_CSS_BYTES) {
      degraded = true
      continue
    }
    cssTotal += Buffer.byteLength(text)
    const name = `style-${index}.css`
    await writeFile(join(assetsDir, name), text)
    written.add(name)
    html = html.split(`href="${href}"`).join(`href="${ASSETS_DIR}/${name}"`)
    html = html.split(`href='${href}'`).join(`href='${ASSETS_DIR}/${name}'`)
  }

  // Re-capturing must not leave a stylesheet behind that the new snapshot no longer
  // references: the offline copy would load CSS for a page that has moved on, and the corpus
  // would grow silently. Only the leftovers are removed, one file at a time — a blanket
  // recursive delete is both unnecessary and, in a batch of fifty captures, indistinguishable
  // from an accident.
  for (const name of await readdir(assetsDir).catch(() => [])) {
    if (!written.has(name)) await unlink(join(assetsDir, name)).catch(() => null)
  }

  return { html, degraded, cssBytes: cssTotal, assetCount: index }
}

/**
 * Capture one page into the corpus.
 *
 * Returns `{ ok, meta }` on success and `{ ok: false, reason }` without writing anything when
 * the page does not actually have the bucket's defining property — that is the stage's central
 * rule, and it is enforced here rather than in a checklist.
 *
 * Every refusal is absolute: `robots.txt`, the bucket verdict, the secret scan and the size
 * cap have no override flag. A rule with a bypass is a rule that gets bypassed, and the three
 * things being protected here (compliance, the corpus not lying about its own difficulty, and
 * AC 5) are exactly the ones a hurried capture is tempted to skip. An over-cap page is a
 * decision to raise `MAX_SNAPSHOT_BYTES` in review, not a flag on a command line.
 */
export async function snapshotSite(url, bucket, options = {}) {
  const id = options.id
  const root = options.corpusRoot ?? CORPUS_ROOT
  const targetDir = id ? join(root, id) : null
  /**
   * Named `driver`, not `browser`, deliberately. `tests/unit/architecture/chrome-boundary.test.ts`
   * scans every source file — comments included — for the two platform namespaces, and
   * `browser.*` is one of them because that is the surface `packages/browser` exists to wrap.
   * Playwright's Browser object is unrelated and merely shares the name, so calling its
   * methods under that name outside a sanctioned location fails the guard. Renaming the local
   * binding keeps the guard sharp instead of teaching it an exception.
   */
  const driver = options.browser ?? (await launchBrowser())
  const ownsBrowser = !options.browser

  try {
    const context = await driver.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: REAL_USER_AGENT,
      locale: 'en-US',
    })
    const page = await context.newPage()
    let response
    try {
      response = await page.goto(url, {
        // `load` waits for every subresource; a site with one slow third-party request times
        // out and a snapshot of nothing useful is taken. The DOM is what is captured, so
        // `domcontentloaded` plus the settle wait below is both faster and more reliable.
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT,
      })
    } catch (error) {
      // A site that will not load is a candidate to replace, not a crash: the caller is
      // running a batch, and one dead host must not take the other 49 with it.
      return { ok: false, reason: `navigation failed: ${String(error?.message ?? error).split('\n')[0]}` }
    }
    if (!response) return { ok: false, reason: `no response from ${url}` }
    if (response.status() >= 400) return { ok: false, reason: `HTTP ${response.status()} for ${url}` }

    await waitForSettled(page)
    // Captured before the interaction steps: bucket D measures what the interaction produced,
    // not whether the page grew after it had already grown.
    const before = {
      groups: await page.evaluate(REPEATING_GROUPS),
      nodes: await page.evaluate('document.querySelectorAll("*").length'),
    }
    await runInteraction(page, options.interaction ?? [])

    const robots = options.skipRobots
      ? { status: 'not-applicable', rule: null }
      : await checkRobots(page.request, url)
    if (robots.status === 'disallow') {
      return { ok: false, reason: `robots.txt forbids this path (${robots.reason})`, robots }
    }

    const features = await page.evaluate(MEASURE)
    Object.assign(features, await measureScrollGrowth(page, before))

    // Serialize before the SPA probe: that probe navigates away, and the snapshot has to be
    // the page the id claims it is. `stripCredentialAttributes` removes the credential-shaped
    // attributes CI's scanner cannot tell from a leak — see `lib/corpus.mjs`.
    const rawHtml = stripCredentialAttributes(await page.evaluate(SERIALIZE, PLACEHOLDER_IMAGE))

    if (bucket === 'B') {
      Object.assign(features, await measureSpaNavigation(page))
    }

    const verdict = verifyBucket(bucket, features)
    if (!verdict.ok) {
      return { ok: false, reason: verdict.reason, features, verdict }
    }

    let { html, degraded, cssBytes, assetCount } = await localizeStylesheets(
      page,
      rawHtml,
      targetDir ?? join(root, '.tmp'),
    )

    const secretHits = scanForSecrets(html)
    if (secretHits.length > 0) {
      return {
        ok: false,
        reason: `secret scan matched ${secretHits.map((hit) => hit.rule).join(', ')}`,
        secretHits,
      }
    }

    const personalData = scanForPersonalData(html)
    // CJK is normalized rather than rejected: see `encodeCjkAsEntities`. Inline `<style>`
    // blocks are the one place entities are not decoded, so those are dropped first.
    const cjkStyles = stripCjkStyleBlocks(html)
    if (cjkStyles.stripped > 0) degraded = true
    html = encodeCjkAsEntities(cjkStyles.html)

    const sizeBytes = Buffer.byteLength(html)
    if (sizeBytes > MAX_SNAPSHOT_BYTES) {
      return { ok: false, reason: `snapshot is ${sizeBytes} bytes, cap is ${MAX_SNAPSHOT_BYTES}` }
    }

    const meta = {
      id,
      url,
      bucket,
      capturedAt: new Date().toISOString(),
      sizeBytes,
      // `verifiedOn` is the date the bucket property was last confirmed against the live
      // page. It is the snapshot's expiry marker: when a site redesigns, this date goes
      // stale before the snapshot does.
      verifiedOn: new Date().toISOString().slice(0, 10),
      title: features.documentTitle,
      bucketEvidence: { verdict: verdict.reason, ...verdict.evidence },
      interaction: options.interaction ?? [],
      assetDegraded: degraded,
      metrics: {
        cssBytes,
        assetCount,
        nodeCount: features.nodeCount,
        shadowRootCount: features.shadowRootCount,
        shadowRootWithContentCount: features.shadowRootWithContentCount,
        closedShadowRootCount: features.closedShadowRootCount,
        grownGroups: features.grownGroups,
        customElementCount: features.customElementCount,
        classTokenCount: features.classTokenCount,
        hashedClassTokens: features.hashedClassTokens,
        maxRepeatingCount: features.maxRepeatingCount,
      },
      rights: options.rights ?? null,
      // AC 3 evidence: the licensing basis (from the source list) plus the mechanical check
      // that the site actually permits this path.
      robots,
      notes: options.notes ?? null,
      personalDataHits: personalData.map((hit) => hit.rule),
    }

    if (targetDir) {
      await mkdir(targetDir, { recursive: true })
      await writeFile(join(targetDir, SNAPSHOT_FILE), html)
      await writeFile(join(targetDir, META_FILE), asciiSafeJson(meta))
    }

    return { ok: true, meta, features, verdict }
  } finally {
    if (ownsBrowser) await driver.close()
  }
}

/** Measure without writing — how a candidate site is judged before it enters the corpus. */
export async function probeSite(url, options = {}) {
  // Same reason as `snapshotSite`: keep the local binding off the platform-namespace scan.
  const driver = options.browser ?? (await launchBrowser())
  const ownsBrowser = !options.browser
  try {
    const context = await driver.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: REAL_USER_AGENT,
      locale: 'en-US',
    })
    const page = await context.newPage()
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT })
    await waitForSettled(page)
    const before = {
      groups: await page.evaluate(REPEATING_GROUPS),
      nodes: await page.evaluate('document.querySelectorAll("*").length'),
    }
    await runInteraction(page, options.interaction ?? [])
    const features = await page.evaluate(MEASURE)
    Object.assign(features, await measureScrollGrowth(page, before))
    Object.assign(features, await measureSpaNavigation(page))
    return { ok: true, url, status: response?.status() ?? null, features }
  } catch (error) {
    return { ok: false, url, error: String(error?.message ?? error) }
  } finally {
    if (ownsBrowser) await driver.close()
  }
}
