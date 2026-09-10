/**
 * The Web Corpus — `task/stage-2-1.md` Scope 1/4/5, Files `apps/playground/snapshot.ts`.
 *
 * Stage 2-1 builds the thing Phase 2 measures. That makes two properties non-negotiable:
 *
 * 1. **A bucket is a fact, not a label.** A page is in bucket `C` because it has real
 *    `#shadow-root`s, not because someone filed it under "web components". `verifyBucket()`
 *    below is the single place that decides, and `SnapshotMeta.bucketEvidence` carries the
 *    measurement so a later reader can re-check the claim without re-running the browser.
 * 2. **The corpus is immutable once admitted.** `results/` and `reports/` only grow (see
 *    `docs/benchmark/README.md`); `corpus/` entries may only be replaced with a stated
 *    reason. Deleting a hard case because it drags a number down is the one failure mode
 *    this file is written to make awkward.
 *
 * Everything here is Node-only and pure-ish (disk reads aside) so the health check can run
 * in CI without a browser: the browser half lives in `lib/snapshot.mjs`.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** `apps/playground/lib/` → up three levels. */
export const REPO_ROOT = resolve(HERE, '../../..')
export const BENCHMARK_ROOT = join(REPO_ROOT, 'tests/benchmark')
export const CORPUS_ROOT = join(BENCHMARK_ROOT, 'corpus')

/** The snapshot entry point the playground serves and the runner loads. */
export const SNAPSHOT_FILE = 'index.html'
export const META_FILE = 'meta.json'
export const ASSETS_DIR = 'assets'

/**
 * Volume governance (`task/stage-2-1.md` Scope 5). The corpus is committed to the
 * repository, so "just keep everything" silently taxes every clone forever. The caps are
 * per-snapshot and total; the policy for what happens when one is exceeded is written in
 * `docs/benchmark/README.md` and enforced here so the two cannot drift.
 */
export const MAX_SNAPSHOT_BYTES = 1024 * 1024
export const MAX_CSS_BYTES = 300 * 1024
export const MAX_CORPUS_BYTES = 48 * 1024 * 1024

/** `task/stage-2-1.md` Scope 3 — the distribution the corpus has to hold. */
export const BUCKETS = ['A', 'B', 'C', 'D', 'E']

export const BUCKET_RANGE = {
  A: [10, 12],
  B: [8, 10],
  C: [8, 10],
  D: [6, 8],
  E: [8, 10],
}

export const MIN_SNAPSHOTS = 45

export const BUCKET_MEANING = {
  A: 'regular structure — tables, lists, semantic HTML',
  B: 'SPA routing — client-side navigation, late-rendered DOM',
  C: 'shadow DOM / custom elements — open shadow roots, custom tag names',
  D: 'infinite scroll / lazy loading — content that only exists after interaction',
  E: 'hashed / CSS-in-JS classes — selectors with no semantic anchor',
}

/** `SnapshotMeta` — `task/stage-2-1.md` Interfaces, plus the evidence and rights fields AC 2/3 need. */
export const META_FIELDS = [
  'id',
  'url',
  'bucket',
  'capturedAt',
  'sizeBytes',
  'verifiedOn',
]

const OPTIONAL_META_FIELDS = [
  'title',
  'bucketEvidence',
  'rights',
  'robots',
  'interaction',
  'assetDegraded',
  'metrics',
  'notes',
  /**
   * AC 3 evidence: the personal-data scan ran and what it found (`[]` on every admitted
   * snapshot). Reported rather than fatal — an OSS docs page legitimately carries a
   * maintainer's email — but it has to be there, because "we checked" and "we forgot to
   * check" must not look identical in the artefact.
   */
  'personalDataHits',
]

export function snapshotDir(id) {
  return join(CORPUS_ROOT, id)
}

export function snapshotPath(id) {
  return join(snapshotDir(id), SNAPSHOT_FILE)
}

export function metaPath(id) {
  return join(snapshotDir(id), META_FILE)
}

/** `<bucket>-<NN>` — `BENCHMARK_GUIDE.md` "id is `<bucket>-<NN>`, stable forever". */
export const ID_PATTERN = /^([A-E])-(\d{2})$/

export function parseId(id) {
  const match = ID_PATTERN.exec(id ?? '')
  if (!match) return null
  return { bucket: match[1], index: Number(match[2]) }
}

// ---------------------------------------------------------------------------
// Secret scanning — `task/stage-2-1.md` Security / AC 5
// ---------------------------------------------------------------------------

/**
 * Credentials that must never reach the repository. The corpus is third-party HTML, so the
 * risk is not "we wrote a key" but "the page embedded one" — signed URLs, build-time
 * config blobs, and `NEXT_PUBLIC_*` style payloads all show up in the wild.
 *
 * Deliberately narrow. A scanner that fires on every long base64 string is a scanner the
 * next person disables, and `MAX_CORPUS_BYTES` worth of false positives is worse than a
 * slightly smaller net.
 */
const SECRET_PATTERNS = [
  { name: 'aws-access-key-id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { name: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  /**
   * `sk-` with a left boundary that excludes identifier characters. Without the lookbehind
   * this matches CSS custom properties: SvelteKit ships `--sk-font-family-ui`, `--sk-page-
   * padding-top` and friends, which produced 13 false positives in one archived stylesheet.
   * A scanner that cries wolf on a framework's CSS is a scanner the next person disables.
   */
  { name: 'openai-key', pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'stripe-key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g },
  { name: 'private-key-block', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/g },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: 'basic-auth-url', pattern: /\bhttps?:\/\/[^/\s:@]+:[^/\s@]{4,}@/g },
  { name: 'connection-string', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^/\s:@]+:[^/\s@]+@/gi },
  { name: 'hardcoded-secret-assignment', pattern: /\b(?:api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\b\s*[:=]\s*['"][A-Za-z0-9._~+/=-]{16,}['"]/gi },
]

/**
 * Personal data (`task/stage-2-1.md` Security: "no personal data"). Reported, not fatal:
 * an open-source docs page legitimately contains a maintainer's email address, and refusing
 * those pages would gut the corpus. A hit here is a review item, not an automatic reject.
 */
const PII_PATTERNS = [
  { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: 'cookie-write', pattern: /\bdocument\.cookie\s*=/g },
]

/**
 * Attribute names that mark a credential slot.
 *
 * Captured pages carry these constantly and mostly innocently: `data-token-hash` is
 * ant.design's CSS-in-JS bookkeeping, `data-algolia-search-key` is Algolia's client-side
 * search key, `data-honeybadger-key` is Honeybadger's browser-side error-reporting key. None
 * is a server credential — but the scanner CI runs cannot know that, and a captured page is
 * not something anyone can author away. Measured: the first capture of this corpus produced
 * **9 findings** (`generic-api-key`, `algolia-api-key`) in two snapshots, `D-02` and `D-07`,
 * which is enough to turn the public repository's CI red.
 *
 * So the attribute goes and the element stays. None of them is structure the benchmark
 * measures, and `docs/benchmark/README.md` already asks for the minimum that reproduces the
 * task. `lib/snapshot.mjs` drops them at capture, `scripts/check-corpus.mjs` re-checks — the
 * same two layers already used for secrets and CJK.
 *
 * Deliberately narrower than "key|token|secret|hash": `data-css-hash` and
 * `data-feedback-hash` are `hash`-suffixed bookkeeping that no scanner objects to, so
 * dropping them would mutate snapshots for nothing. Measured: the narrowed pattern matches
 * five attribute names in two snapshots; with `hash` included it matches eight in five.
 */
export const CREDENTIAL_ATTRIBUTE = /(?:^|[-_:])(?:key|keys|token|secret)(?:$|[-_:])/i

/**
 * Credential-shaped attribute names in a serialized snapshot. Scans tags rather than the raw
 * text, so a stylesheet's `[data-x="y"]` selector is not mistaken for markup.
 */
export function credentialAttributesIn(html) {
  const names = new Set()
  for (const tag of (html ?? '').matchAll(/<[a-zA-Z][^>]*>/g)) {
    for (const attribute of tag[0].matchAll(/\s([A-Za-z][\w:.-]*)\s*=/g)) {
      const name = attribute[1]
      if (name && CREDENTIAL_ATTRIBUTE.test(name)) names.add(name)
    }
  }
  return [...names]
}

/**
 * Remove those attributes from a serialized snapshot — the element stays, the credential slot
 * does not.
 *
 * Done here rather than inside the page's serializer because `page.evaluate` ships the
 * function's *source* into the browser: a closure variable does not exist over there
 * (measured — referencing the shared pattern from the in-page code raises `ReferenceError`,
 * which is why `MEASURE` duplicates its class-name patterns). Stripping the string Node-side
 * keeps one definition for both capture and the health check, and it guarantees the property
 * CI actually checks: the bytes written to disk contain no credential-shaped attribute.
 *
 * It can also rewrite a `<style>` block's raw text that happens to contain markup-looking
 * text. Stylesheets are not what the benchmark reads, so the trade is deliberate.
 */
export function stripCredentialAttributes(html) {
  return (html ?? '').replace(/<[a-zA-Z][^>]*>/g, (tag) =>
    tag.replace(/\s([A-Za-z][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, (whole, name) =>
      CREDENTIAL_ATTRIBUTE.test(name) ? '' : whole,
    ),
  )
}

function scanText(text, patterns) {
  const hits = []
  for (const { name, pattern } of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    let match
    while ((match = regex.exec(text)) !== null) {
      hits.push({ rule: name, at: match.index })
      if (hits.length > 25) return hits
    }
  }
  return hits
}

/** Never log the matched text — only the rule and its offset. */
export function scanForSecrets(text) {
  return scanText(text, SECRET_PATTERNS)
}

export function scanForPersonalData(text) {
  return scanText(text, PII_PATTERNS)
}

/**
 * CJK ideographs, CJK punctuation and fullwidth forms — the exact range
 * `tests/unit/architecture/doc-visibility.test.ts` scans tracked files for.
 *
 * A snapshot is a captured artefact rather than something we author, but it is still a
 * tracked text file in the public tree, so "no CJK in the public tree" applies to it exactly
 * as it does to a document (`docs/contributing/DOC_VISIBILITY.md`). Rather than exempt the
 * corpus — which would weaken the rule to suit the data — captured CJK is **normalized**:
 * see `encodeCjkAsEntities` below. The public tree keeps its guarantee, the rule keeps its
 * meaning, and the corpus keeps its content.
 *
 * Built from code points so this file stays ASCII and does not trip its own rule.
 */
const CJK_SOURCE = '[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u3000-\\u303F\\uFF01-\\uFF60]'

export const CJK_PATTERN = new RegExp(CJK_SOURCE)

export function containsCjk(text) {
  return CJK_PATTERN.test(text)
}

/**
 * Rewrite CJK as numeric character references: `&#x4E2D;` rather than the raw character.
 *
 * This is lossless where it matters. HTML entities are decoded by the parser in text and in
 * attribute values, so the DOM a snapshot produces offline is character-for-character the one
 * the live page produced — only `outerHTML` differs, and nothing in the benchmark reads raw
 * markup. The alternative, refusing every page that contains a language switcher or a
 * multilingual feed, would quietly bias the corpus away from exactly the pages that are hard.
 */
export function encodeCjkAsEntities(html) {
  return html.replace(new RegExp(CJK_SOURCE, 'g'), (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return `&#x${codePoint.toString(16).toUpperCase()};`
  })
}

/**
 * Raw-text elements (`<style>`, `<script>`) do not decode entities, so encoding inside them
 * would change the rendering instead of preserving it. Scripts are stripped before this runs;
 * a stylesheet containing CJK is dropped and the snapshot is marked degraded.
 */
export function stripCjkStyleBlocks(html) {
  let stripped = 0
  const out = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (block) => {
    if (!containsCjk(block)) return block
    stripped += 1
    return ''
  })
  return { html: out, stripped }
}

/**
 * Serialize to JSON whose bytes are pure ASCII. `\uXXXX` escapes are part of the JSON spec,
 * so `JSON.parse` returns the identical string; the file just stops being a CJK carrier.
 */
export function asciiSafeJson(value) {
  return `${JSON.stringify(value, null, 2).replace(
    /[\u007F-\uFFFF]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )}\n`
}

// ---------------------------------------------------------------------------
// Bucket verification — "a bucket is a fact to be measured, not a label to be chosen"
// (`task/stage-2-1.md` Implementation Notes).
// ---------------------------------------------------------------------------

/**
 * Class-name shapes that carry no semantic anchor (`BENCHMARK_GUIDE.md` bucket `E`).
 * Each entry is a generator's fingerprint: `sc-` / `css-` prefixes, CSS-module `_hash`
 * prefixes, and BEM-plus-hash suffixes from styled-components.
 */
const HASHED_CLASS_PATTERNS = [
  /^(?:sc|css|jss|mui|Mui|emotion|makeStyles|styled)-[A-Za-z0-9_-]{5,}$/,
  /^_[A-Za-z0-9_-]{6,}$/,
  /^[A-Za-z][A-Za-z0-9]*__[A-Za-z0-9]{5,}_[a-f0-9]{5,}$/,
  /^[A-Za-z][A-Za-z0-9]*__[A-Za-z0-9]{6,}_\d+$/,
  /^[A-Za-z0-9]{2,20}-[a-f0-9]{6,}(?:-\d+)?$/,
  /^[A-Za-z0-9_-]{2,24}__[a-zA-Z0-9]{5,}$/,
  /^[a-f0-9]{8,}$/i,
]

export function isHashedClassToken(token) {
  if (token.length < 6) return false
  return HASHED_CLASS_PATTERNS.some((pattern) => pattern.test(token))
}

/**
 * Thresholds for bucket admission. They are deliberately stated as constants with the
 * reasoning attached: a reviewer who disagrees with "D grew by 20 nodes" should be able to
 * find the number and the argument in one place.
 */
export const BUCKET_THRESHOLDS = {
  /** A: a repeated container of >= 5 siblings, and nothing exotic going on. */
  aMinRepeating: 5,
  aMaxHashedRatio: 0.2,
  /**
   * C: at least one open shadow root that *carries content* (>= 5 elements inside). A root
   * wrapping a single icon is a widget; counting it would let any page with a date-picker
   * into the bucket and make the bucket meaningless.
   */
  cMinShadowRootsWithContent: 1,
  /**
   * D: a repeated structure has to actually grow — >= 3 more instances of the same shape.
   * Node count alone is not evidence: a re-rendering navbar moves it too.
   */
  dMinGroupGrowth: 1,
  dMinSiblingGrowth: 3,
  /** E: enough hashed tokens that a selector cannot lean on class names at all. */
  eMinHashedTokens: 20,
  eMinHashedRatio: 0.2,
}

/**
 * Decide a bucket from measurements. Returns `{ ok, reason, evidence }`; `ok: false` with a
 * reason is the normal, healthy outcome for a candidate site that turned out not to have
 * the property — it is how the corpus avoids lying to itself.
 */
export function verifyBucket(bucket, features) {
  const f = features ?? {}
  const evidence = pickEvidence(bucket, f)

  if (bucket === 'B') {
    const ok = f.spaNavigation === true
    return {
      ok,
      reason: ok ? 'client-side navigation kept the page alive' : 'navigation reloaded the document',
      evidence,
    }
  }

  if (bucket === 'C') {
    const withContent = f.shadowRootWithContentCount ?? 0
    const ok = withContent >= BUCKET_THRESHOLDS.cMinShadowRootsWithContent
    return {
      ok,
      reason: ok
        ? `${withContent} of ${f.shadowRootCount ?? 0} shadow roots carry content`
        : `no shadow root carrying content (${f.shadowRootCount ?? 0} empty or widget roots)`,
      evidence,
    }
  }

  if (bucket === 'D') {
    const grown = f.grownGroups ?? 0
    const ok = grown >= BUCKET_THRESHOLDS.dMinGroupGrowth
    return {
      ok,
      reason: ok
        ? `scrolling grew ${grown} repeated structure(s): ${(f.grownSample ?? []).join('; ')}`
        : `scrolling grew no repeated structure (nodes ${f.nodesBeforeScroll}->${f.nodesAfterScroll})`,
      evidence,
    }
  }

  if (bucket === 'E') {
    const hashed = f.hashedClassTokens ?? 0
    const ratio = f.hashedClassRatio ?? 0
    const ok = hashed >= BUCKET_THRESHOLDS.eMinHashedTokens && ratio >= BUCKET_THRESHOLDS.eMinHashedRatio
    return {
      ok,
      reason: ok
        ? `class names are generated: ratio ${ratio.toFixed(2)}`
        : `class names are readable: ratio ${ratio.toFixed(2)}`,
      evidence,
    }
  }

  // Bucket A is the residual: regular, and nothing that belongs to another bucket.
  const repeating = f.maxRepeatingCount ?? 0
  const hashedRatio = f.hashedClassRatio ?? 0
  const problems = []
  if (repeating < BUCKET_THRESHOLDS.aMinRepeating) {
    problems.push(`largest repeated container is ${repeating} siblings`)
  }
  if ((f.shadowRootCount ?? 0) > 0) problems.push('has shadow roots')
  if (hashedRatio > BUCKET_THRESHOLDS.aMaxHashedRatio) {
    problems.push(`hashed class ratio ${hashedRatio.toFixed(2)}`)
  }
  if (f.spaNavigation) problems.push('navigates client-side')
  if ((f.grownGroups ?? 0) > 0) problems.push('grows on scroll')
  if ((f.shadowRootWithContentCount ?? 0) > 0) problems.push('has content-bearing shadow roots')
  return {
    ok: problems.length === 0,
    reason: problems.length === 0 ? 'regular repeated structure' : problems.join('; '),
    evidence,
  }
}

/** The measurements that justify a bucket, and no more — meta files are read by humans. */
function pickEvidence(bucket, f) {
  switch (bucket) {
    case 'A':
      return { maxRepeatingCount: f.maxRepeatingCount ?? 0, repeatingSelector: f.maxRepeatingSelector ?? null }
    case 'B':
      return { spaNavigation: f.spaNavigation === true, navigatedTo: f.spaNavigatedTo ?? null }
    case 'C':
      return {
        shadowRootCount: f.shadowRootCount ?? 0,
        shadowRootWithContentCount: f.shadowRootWithContentCount ?? 0,
        customElementCount: f.customElementCount ?? 0,
        shadowHostSample: f.shadowHostSample ?? [],
      }
    case 'D':
      return {
        grownGroups: f.grownGroups ?? 0,
        grownSample: f.grownSample ?? [],
        nodesBeforeScroll: f.nodesBeforeScroll ?? 0,
        nodesAfterScroll: f.nodesAfterScroll ?? 0,
        scrollSteps: f.scrollSteps ?? 0,
      }
    default:
      return {
        hashedClassTokens: f.hashedClassTokens ?? 0,
        hashedClassRatio: Number((f.hashedClassRatio ?? 0).toFixed(3)),
        classTokenCount: f.classTokenCount ?? 0,
        hashedSample: f.hashedSample ?? [],
      }
  }
}

// ---------------------------------------------------------------------------
// Bucket evidence still present in the artefact
// ---------------------------------------------------------------------------

const SHADOW_TEMPLATE_PATTERN = /<template\s+shadowrootmode="open"\s*>([\s\S]*?)<\/template>/gi

/**
 * Count declarative shadow DOM templates in a serialized snapshot, and how many of them
 * actually carry content.
 *
 * This exists because of a specific failure the corpus already had: the serializer wrote
 * shadow children onto the `<template>` element instead of into its `content`, so every
 * bucket-`C` snapshot shipped an empty `<template>` — the pages had been quietly converted
 * into the easiest possible pages, and the only signal was that two of them happened to be
 * small enough to trip the DOM-size gate. Counting non-empty templates turns "the bucket
 * property is still in the file" into something the health check can assert for all ten.
 */
export function countShadowTemplates(html) {
  let total = 0
  let nonEmpty = 0
  const regex = new RegExp(SHADOW_TEMPLATE_PATTERN.source, 'gi')
  let match
  while ((match = regex.exec(html ?? '')) !== null) {
    total += 1
    if ((match[1] ?? '').trim().length > 0) nonEmpty += 1
  }
  return { total, nonEmpty }
}

// ---------------------------------------------------------------------------
// Health check — `task/stage-2-1.md` Tests 2, AC 4
// ---------------------------------------------------------------------------

export async function readMeta(id) {
  return JSON.parse(await readFile(metaPath(id), 'utf8'))
}

/**
 * The corpus health check. Pure over disk: no network, no browser, so it can run on every
 * commit. `http` results are supplied by the caller (`probeCorpusHttp`) because starting a
 * server is not this function's business.
 */
export async function checkCorpus(options = {}) {
  const root = options.corpusRoot ?? CORPUS_ROOT
  const ids = await readdir(root, { withFileTypes: true })
    .then((entries) =>
      entries
        .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort(),
    )
    .catch(() => [])

  const problems = []
  const metas = []
  const seenUrls = new Map()
  let totalBytes = 0

  for (const id of ids) {
    const parsed = parseId(id)
    const dir = join(root, id)

    let htmlBytes = 0
    try {
      const { size } = await statOf(join(dir, SNAPSHOT_FILE))
      htmlBytes = size
    } catch {
      problems.push({ id, code: 'MISSING_SNAPSHOT', detail: `${id}/${SNAPSHOT_FILE} not found` })
    }

    let meta
    try {
      meta = JSON.parse(await readFile(join(dir, META_FILE), 'utf8'))
    } catch {
      problems.push({ id, code: 'MISSING_META', detail: `${id}/${META_FILE} not found` })
      continue
    }

    for (const field of META_FIELDS) {
      if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
        problems.push({ id, code: 'INCOMPLETE_META', detail: `missing ${field}` })
      }
    }
    const known = new Set([...META_FIELDS, ...OPTIONAL_META_FIELDS])
    for (const field of Object.keys(meta)) {
      // An unknown key means the schema moved without the reader: better to fail here than to
      // have a consumer silently ignore a field it was supposed to understand.
      if (!known.has(field)) problems.push({ id, code: 'UNKNOWN_META_FIELD', detail: field })
    }
    if (meta.id !== id) {
      problems.push({ id, code: 'ID_MISMATCH', detail: `meta says ${meta.id}` })
    }
    if (meta.bucket !== parsed.bucket) {
      problems.push({ id, code: 'ID_MISMATCH', detail: `id bucket ${parsed.bucket} vs meta ${meta.bucket}` })
    }
    if (!BUCKETS.includes(meta.bucket)) {
      problems.push({ id, code: 'UNKNOWN_BUCKET', detail: String(meta.bucket) })
    }
    if (typeof meta.sizeBytes !== 'number' || meta.sizeBytes <= 0) {
      problems.push({ id, code: 'BAD_SIZE', detail: String(meta.sizeBytes) })
    } else if (meta.sizeBytes > MAX_SNAPSHOT_BYTES) {
      problems.push({ id, code: 'OVER_SIZE', detail: `${meta.sizeBytes} bytes` })
    }

    const url = meta.url ? String(meta.url) : ''
    if (seenUrls.has(url)) {
      problems.push({ id, code: 'DUPLICATE_URL', detail: `same as ${seenUrls.get(url)}` })
    } else {
      seenUrls.set(url, id)
    }

    // Admission checks that need the file contents or a running server are supplied by the
    // caller (`scripts/check-corpus.mjs`); this function stays pure over the meta files.
    for (const problem of (options.extraProblems ?? []).filter((item) => item.id === id)) {
      problems.push(problem)
    }

    totalBytes += Number(meta.sizeBytes ?? 0) || htmlBytes
    metas.push(meta)
  }

  if (ids.length < MIN_SNAPSHOTS) {
    problems.push({ id: null, code: 'BELOW_MIN', detail: `${ids.length} snapshots, need ${MIN_SNAPSHOTS}` })
  }

  const distribution = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0]))
  for (const meta of metas) distribution[meta.bucket] = (distribution[meta.bucket] ?? 0) + 1

  for (const bucket of BUCKETS) {
    const [min, max] = BUCKET_RANGE[bucket]
    const count = distribution[bucket]
    if (count < min || count > max) {
      problems.push({
        id: null,
        code: 'DISTRIBUTION',
        detail: `bucket ${bucket} has ${count}, allowed ${min}-${max}`,
      })
    }
  }

  if (totalBytes > MAX_CORPUS_BYTES) {
    problems.push({ id: null, code: 'CORPUS_OVER_SIZE', detail: `${totalBytes} bytes` })
  }

  const http = options.http ?? null
  if (http) {
    for (const failure of http.failures ?? []) {
      problems.push({ id: failure.id, code: 'NOT_LOADABLE', detail: failure.detail })
    }
  }

  return {
    ok: problems.length === 0,
    count: ids.length,
    distribution,
    totalBytes,
    ids,
    metas,
    problems,
    http,
  }
}

async function statOf(path) {
  const { stat } = await import('node:fs/promises')
  return stat(path)
}

export async function writeCorpusIndex(metas) {
  const index = {
    generatedAt: new Date().toISOString(),
    count: metas.length,
    buckets: Object.fromEntries(
      BUCKETS.map((bucket) => [bucket, metas.filter((meta) => meta.bucket === bucket).length]),
    ),
    snapshots: metas.map((meta) => ({
      id: meta.id,
      bucket: meta.bucket,
      url: meta.url,
      verifiedOn: meta.verifiedOn,
      sizeBytes: meta.sizeBytes,
    })),
  }
  await writeFile(join(CORPUS_ROOT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  return index
}
