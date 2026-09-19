#!/usr/bin/env node
/**
 * The Web Corpus source list — `task/stage-2-1.md` Scope 3/4.
 *
 * This is the corpus as code: one entry per snapshot, with the two things a snapshot cannot
 * be judged without — **why the page is in this bucket** (proved by measurement at capture
 * time, recorded in `meta.json`) and **why we may keep a copy of it** (`rights`).
 *
 * Selection rules, in the order they were applied:
 *
 * 1. **No login, paywall, or private content.** Nothing here needs an account.
 * 2. **Licence before reachability.** Purpose-built scraping sandboxes
 *    (`basis: 'scraping-sandbox'`), open-source project documentation (`'oss-docs'`) and
 *    public-domain material (`'public-domain'`) come first. News, social and e-commerce
 *    pages are excluded — they are the most ToS-fragile and the least defensible to
 *    redistribute, and this repository is public. The three `'reviewed-tos'` entries are
 *    public, login-free community feeds whose robots.txt permits the path; the check is
 *    mechanical and re-run at capture time (`lib/snapshot.mjs`, `checkRobots`).
 * 3. **Difficulty before count.** A page is admitted for the property it stresses. An easy
 *    page that pads the count makes every future number look better than it is.
 *
 * Rejected on review or by the capture pre-flight, kept here so the decision is not silently
 * revisited:
 *
 * - `https://lobste.rs/` — measured as a textbook bucket-`A` page, then dropped: its
 *   robots.txt carries `User-agent: *` / `Disallow: /`. Easy to miss, which is exactly why
 *   the capture path refuses instead of trusting that someone read it.
 * - `https://www.smashingmagazine.com/` — grows on scroll and would be a good bucket `D`,
 *   but the article corpus is CC BY-NC-SA and the page is ToS-sensitive. Left as a reserve
 *   for a maintainer ruling rather than admitted unilaterally.
 * - `https://docs.gitlab.com/` — the snapshot contained an `AIza…`-shaped string. A docs page
 *   using a placeholder that looks like a live Google API key is not worth the argument.
 * - `https://storybook.js.org/` — a JWT-shaped string in a demo payload. Same reasoning.
 * - `https://vaadin.com/components/vaadin-grid` (1.5 MB) and
 *   `https://vaadin.com/docs/latest/components/button` (1.1 MB) — over the per-snapshot cap;
 *   the cap is the policy, so the pages lose, not the cap.
 * - `https://www.tiktok.com/explore`, `https://www.goodreads.com/list`,
 *   `https://www.discogs.com/search/`, `https://dribbble.com/shots`,
 *   `https://www.last.fm/music` — all measured cleanly into some bucket, all commercial
 *   consumer sites with redistribution terms this corpus has no business testing.
 *
 * Pages containing CJK are **not** rejected: capture normalizes CJK to numeric character
 * references, which the HTML parser decodes back to the identical DOM. Public timelines in
 * particular are multilingual, and a rule that excluded them would bias bucket `D` away from
 * the one shape it is supposed to contain.
 *
 * `interaction` is replayed by the runner later: pages in bucket `D` do not have all their
 * content until someone scrolls, so the corpus has to be able to say so.
 *
 * Ids are `<bucket>-<NN>` and never reused (`BENCHMARK_GUIDE.md`).
 */

/**
 * @typedef {Object} Rights
 * @property {'scraping-sandbox'|'oss-docs'|'public-domain'|'reviewed-tos'} basis
 * @property {string} license
 * @property {string} reviewedOn
 * @property {string} [reviewNote]
 */

/** @type {Array<{id:string,bucket:string,url:string,rights:Rights,interaction?:Array<{type:string,times?:number,ms?:number,selector?:string}>,notes?:string}>} */
export const CORPUS_SOURCES = [
  // ---------------------------------------------------------------- bucket A
  {
    id: 'A-01',
    bucket: 'A',
    url: 'https://books.toscrape.com/',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    notes: 'Product grid: title, price, rating, availability. 100 repeated units — the baseline shape.',
  },
  {
    id: 'A-02',
    bucket: 'A',
    url: 'https://quotes.toscrape.com/',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    notes: 'Quote / author / tag list. Semantic markup, no framework.',
  },
  {
    id: 'A-03',
    bucket: 'A',
    url: 'https://webscraper.io/test-sites/tables',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    notes: 'Real HTML tables, one of them with no header row — the trap that makes column naming hard.',
  },
  {
    id: 'A-04',
    bucket: 'A',
    url: 'https://scrapeme.live/shop/',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    notes: 'WooCommerce product grid: a realistic storefront shape without a real storefront licence.',
  },
  {
    id: 'A-05',
    bucket: 'A',
    url: 'https://docs.python.org/3/library/functions.html',
    rights: { basis: 'oss-docs', license: 'PSF-2.0 (documentation)', reviewedOn: '2026-09-10' },
    notes: 'Definition-list reference. The fields are not in a table, so column inference has nothing to lean on.',
  },
  {
    id: 'A-06',
    bucket: 'A',
    url: 'https://www.crummy.com/software/BeautifulSoup/bs4/doc/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '1459 repeated nodes: deep prose with code blocks, i.e. plenty of containers that are not records.',
  },
  {
    id: 'A-07',
    bucket: 'A',
    url: 'https://www.postgresql.org/docs/current/functions-math.html',
    rights: { basis: 'oss-docs', license: 'PostgreSQL licence', reviewedOn: '2026-09-10' },
    notes: 'Dense multi-column table with inline markup inside cells.',
  },
  {
    id: 'A-08',
    bucket: 'A',
    url: 'https://www.sqlite.org/lang.html',
    rights: { basis: 'public-domain', license: 'public domain', reviewedOn: '2026-09-10' },
    notes: 'A long index of statement names: a list that looks like a table and is not one.',
  },
  {
    id: 'A-09',
    bucket: 'A',
    url: 'https://nginx.org/en/docs/',
    rights: { basis: 'oss-docs', license: 'BSD-2-Clause', reviewedOn: '2026-09-10' },
    notes: 'Documentation hub: nested link groups, very few class names to anchor on.',
  },
  {
    id: 'A-10',
    bucket: 'A',
    url: 'https://www.kernel.org/',
    rights: { basis: 'oss-docs', license: 'GPL-2.0 (project site)', reviewedOn: '2026-09-10' },
    notes: 'Release table plus news list on one page: two candidate containers, only one of them the answer.',
  },
  {
    id: 'A-11',
    bucket: 'A',
    url: 'https://go.dev/doc/',
    rights: { basis: 'oss-docs', license: 'BSD-3-Clause', reviewedOn: '2026-09-10' },
    notes: 'Documentation hub: many small link groups, so the "largest container" heuristic has real competition.',
  },
  {
    id: 'A-12',
    bucket: 'A',
    url: 'https://www.gnu.org/software/emacs/manual/',
    rights: { basis: 'oss-docs', license: 'GFDL-1.3', reviewedOn: '2026-09-10' },
    notes: 'Hand-written 1990s HTML: table-based layout with no semantic container at all.',
  },

  // ---------------------------------------------------------------- bucket B
  {
    id: 'B-01',
    bucket: 'B',
    url: 'https://svelte.dev/docs/kit/routing',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'SvelteKit docs: client-side routing, and the page DOM is built after load.',
  },
  {
    id: 'B-02',
    bucket: 'B',
    url: 'https://vuejs.org/guide/essentials/template-syntax.html',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'VitePress: a static shell that is hydrated into a client-routed app.',
  },
  {
    id: 'B-03',
    bucket: 'B',
    url: 'https://nuxt.com/docs/guide/directory-structure/app',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Nuxt docs. 637 distinct class tokens and almost no repetition — hard for the wrong reason.',
  },
  {
    id: 'B-04',
    bucket: 'B',
    url: 'https://webpack.js.org/concepts/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Docusaurus: client-side navigation over a docs tree.',
  },
  {
    id: 'B-05',
    bucket: 'B',
    url: 'https://styled-components.com/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'A CSS-in-JS library homepage that (measured) uses readable class names — kept for its routing, not its styling.',
  },
  {
    id: 'B-06',
    bucket: 'B',
    url: 'https://crates.io/',
    rights: { basis: 'oss-docs', license: 'MIT / Apache-2.0 (Rust project)', reviewedOn: '2026-09-10' },
    notes: 'Ember app: nothing in the initial HTML survives to the rendered page.',
  },
  {
    id: 'B-07',
    bucket: 'B',
    url: 'https://yarnpkg.com/',
    rights: { basis: 'oss-docs', license: 'BSD-2-Clause', reviewedOn: '2026-09-10' },
    notes: 'Gatsby-built docs: hydration plus client-side route transitions.',
  },
  {
    id: 'B-08',
    bucket: 'B',
    url: 'https://bun.sh/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '3200 nodes rendered entirely client-side; a large DOM with no server-rendered equivalent.',
  },
  {
    id: 'B-09',
    bucket: 'B',
    url: 'https://docs.github.com/en',
    rights: { basis: 'oss-docs', license: 'CC-BY-4.0', reviewedOn: '2026-09-10' },
    notes: 'Docs hub with client-side navigation and 143 class tokens.',
  },
  {
    id: 'B-10',
    bucket: 'B',
    url: 'https://prettier.io/docs/en/index.html',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Docusaurus: client-side navigation over a docs tree, with a second lazy-growth trap.',
  },

  // ---------------------------------------------------------------- bucket C
  {
    id: 'C-01',
    bucket: 'C',
    url: 'https://chromestatus.com/features',
    rights: { basis: 'oss-docs', license: 'CC-BY-2.5 (Chromium project)', reviewedOn: '2026-09-10' },
    notes: 'Nested open shadow roots three levels deep — already the hardest known C case (stage 1-9).',
  },
  {
    id: 'C-02',
    bucket: 'C',
    url: 'https://chromestatus.com/roadmap',
    rights: { basis: 'oss-docs', license: 'CC-BY-2.5 (Chromium project)', reviewedOn: '2026-09-10' },
    notes: 'Same component tree, different route: rows again live inside shadow roots.',
  },
  {
    id: 'C-03',
    bucket: 'C',
    url: 'https://shoelace.style/components/button',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '344 custom elements, 116 shadow roots carrying content: the densest C page in the corpus.',
  },
  {
    id: 'C-04',
    bucket: 'C',
    url: 'https://shoelace.style/components/input',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Component reference where the fields sit one root deeper than the container.',
  },
  {
    id: 'C-05',
    bucket: 'C',
    url: 'https://material-web.dev/',
    rights: { basis: 'oss-docs', license: 'Apache-2.0', reviewedOn: '2026-09-10' },
    notes: 'Material web components — the page the stage 1-14 dogfood run used.',
  },
  {
    id: 'C-06',
    bucket: 'C',
    url: 'https://material-web.dev/components/button/',
    rights: { basis: 'oss-docs', license: 'Apache-2.0', reviewedOn: '2026-09-10' },
    notes: '126 content-bearing root(s) and a demo panel whose markup exists only inside them.',
  },
  {
    id: 'C-07',
    bucket: 'C',
    url: 'https://lit.dev/docs/',
    rights: { basis: 'oss-docs', license: 'BSD-3-Clause', reviewedOn: '2026-09-10' },
    notes: 'The site is built with Lit, so both the nav and the content are custom elements.',
  },
  {
    id: 'C-08',
    bucket: 'C',
    url: 'https://lit.dev/docs/components/events/',
    rights: { basis: 'oss-docs', license: 'BSD-3-Clause', reviewedOn: '2026-09-10' },
    notes: 'Prose inside shadow roots: the analyzer sees an almost empty light DOM.',
  },
  {
    id: 'C-09',
    bucket: 'C',
    url: 'https://redux-toolkit.js.org/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'A thinner C page than the component libraries: 12 roots, 4 carrying content — the bucket floor.',
  },
  {
    id: 'C-10',
    bucket: 'C',
    url: 'https://open-wc.org/guides/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'A thin C page: only two content-bearing roots, which is a useful floor for the bucket.',
  },

  // ---------------------------------------------------------------- bucket D
  {
    id: 'D-01',
    bucket: 'D',
    url: 'https://quotes.toscrape.com/scroll',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Infinite scroll by design: starts with ten quotes and appends on scroll. The canonical D case.',
  },
  {
    id: 'D-02',
    bucket: 'D',
    url: 'https://dev.to/',
    rights: {
      basis: 'reviewed-tos',
      license: 'AGPL-3.0 (platform); posts are public and CC BY-SA 4.0',
      reviewedOn: '2026-09-10',
      reviewNote: 'robots.txt allows / (only /search, /admin, /mod and auth paths are disallowed); no login; feed is public.',
    },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Home feed appends article cards. 1790 nodes initial, ~3800 after three scrolls.',
  },
  {
    id: 'D-03',
    bucket: 'D',
    url: 'https://mastodon.social/explore',
    rights: {
      basis: 'reviewed-tos',
      license: 'AGPL-3.0 (Mastodon); public timeline',
      reviewedOn: '2026-09-10',
      reviewNote: 'Public explore timeline, no login. robots.txt could not be retrieved from this network; capture re-checks.',
    },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Status cards append as the timeline is scrolled; also the widest-gap page in the corpus.',
  },
  {
    id: 'D-04',
    bucket: 'D',
    url: 'https://mastodon.online/explore',
    rights: {
      basis: 'reviewed-tos',
      license: 'AGPL-3.0 (Mastodon); public timeline',
      reviewedOn: '2026-09-10',
      reviewNote: 'Second instance, different rendering: keeps the bucket from being one server-bug.',
    },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Same software as D-03, different content and a smaller growth delta.',
  },
  {
    id: 'D-05',
    bucket: 'D',
    url: 'https://hachyderm.io/explore',
    rights: {
      basis: 'reviewed-tos',
      license: 'AGPL-3.0 (Mastodon); public timeline',
      reviewedOn: '2026-09-10',
      reviewNote: 'robots.txt read: only /media_proxy/, /interact/ and one API path disallowed; /explore is allowed.',
    },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Growth is small (four new groups) — a useful negative-ish case for a threshold that is set too high.',
  },
  {
    id: 'D-06',
    bucket: 'D',
    url: 'https://react.dev/learn',
    rights: { basis: 'oss-docs', license: 'CC-BY-4.0', reviewedOn: '2026-09-10' },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'Grows by lazily mounting page sections, not by appending a feed. Honest D, weaker shape.',
  },
  {
    id: 'D-07',
    bucket: 'D',
    url: 'https://ant.design/docs/react/introduce',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    interaction: [{ type: 'scroll', times: 3 }],
    notes: 'The sidebar and the article body both lazy-mount, so two containers move at once and the growth is +5 groups.',
  },
  {
    id: 'D-08',
    bucket: 'D',
    url: 'https://www.scrapethissite.com/pages/ajax-javascript/',
    rights: { basis: 'scraping-sandbox', license: 'purpose-built for scraping practice', reviewedOn: '2026-09-10' },
    interaction: [
      // Ids that start with a digit are not valid CSS id selectors (`#2015` does not parse),
      // hence the attribute form.
      { type: 'click', selector: 'a.year-link[id="2015"]' },
      { type: 'click', selector: 'a.year-link[id="2014"]' },
      { type: 'scroll', times: 2 },
    ],
    notes: 'Lazy loading without a scrollbar: the table only exists after the year control is clicked. The corpus records the steps so the runner can reproduce them.',
  },

  // ---------------------------------------------------------------- bucket E
  {
    id: 'E-01',
    bucket: 'E',
    url: 'https://emotion.sh/docs/introduction',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Emotion emits `css-*` names: 32 of 68 tokens are generated, so class names are unusable as anchors.',
  },
  {
    id: 'E-02',
    bucket: 'E',
    url: 'https://infinite-scroll.com/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Hashed classes on a small page: the E property without the size of a component library.',
  },
  {
    id: 'E-03',
    bucket: 'E',
    url: 'https://mui.com/material-ui/getting-started/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'MUI emits emotion classes (`MuiButton-root`, `css-1a2b3c`) over a deep DOM — 113 of 207 tokens.',
  },
  {
    id: 'E-04',
    bucket: 'E',
    url: 'https://mui.com/material-ui/react-button/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'A component page with live demos: 209 generated tokens and no two components sharing a prefix.',
  },
  {
    id: 'E-05',
    bucket: 'E',
    url: 'https://chakra-ui.com/docs/components/button',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '213 of 245 tokens are generated — the highest ratio in the corpus. No semantic anchor survives.',
  },
  {
    id: 'E-06',
    bucket: 'E',
    url: 'https://emotion.sh/docs/styled',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Same generator as E-01 on the API page: 42 of 89 tokens, so the ratio is a property of the site.',
  },
  {
    id: 'E-07',
    bucket: 'E',
    url: 'https://www.gatsbyjs.com/docs/quick-start/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'Build-time generated utility names: 126 of 155 tokens.',
  },
  {
    id: 'E-08',
    bucket: 'E',
    url: 'https://www.gatsbyjs.com/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: 'A marketing shell on the same generator as E-07 — 125 of 136 tokens generated.',
  },
  {
    id: 'E-09',
    bucket: 'E',
    url: 'https://react-hook-form.com/get-started',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '35 of 124 tokens generated: a lower ratio, kept to stop the bucket collapsing into "ratio > 0.8".',
  },
  {
    id: 'E-10',
    bucket: 'E',
    url: 'https://mui.com/material-ui/customization/theming/',
    rights: { basis: 'oss-docs', license: 'MIT', reviewedOn: '2026-09-10' },
    notes: '138 of 286 tokens generated, over the theme object rather than a component — E is not a component-page artefact.',
  },
]

export function findSource(id) {
  return CORPUS_SOURCES.find((source) => source.id === id) ?? null
}

export function sourcesFor(bucket) {
  return CORPUS_SOURCES.filter((source) => source.bucket === bucket)
}
