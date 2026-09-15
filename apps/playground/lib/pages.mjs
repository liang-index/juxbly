/**
 * The lifecycle page — one URL, two shapes.
 *
 * Why a served page and not a mutation through the developer tools: breakage has to come
 * from somewhere the *product* would see. Deleting a node from the live DOM is what a real
 * redesign does to a saved tool, and it is also the only failure the health layers were
 * built to notice.
 *
 * The two variants are the same four products with different markup. Every row keeps its
 * data so the second set of selectors has something true to read — a page that simply
 * deleted everything would be a different (and less interesting) failure: nothing to
 * repair towards.
 *
 * The HTML is kept plain on purpose. This fixture exercises the product, not the parser:
 * no `<table>`, no shadow DOM, no lazy loading — those have their own fixtures under
 * `tests/fixtures/pages/`, and the Phase 2 corpus starts there.
 */
export const LIFECYCLE_PATH = '/lifecycle.html'

export const PAGE_VARIANTS = ['shop', 'changed']

const ROWS = [
  ['Wireless keyboard', '$49.00'],
  ['Wireless mouse', '$29.00'],
  ['USB-C hub', '$39.00'],
  ['Laptop stand', '$59.00'],
]

export function lifecyclePage(variant) {
  const rows = ROWS.map(([name, price]) => row(variant, name, price)).join('\n        ')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title(variant)}</title>
  </head>
  <body>
    <h1>${title(variant)}</h1>
    <ul class="results">
        ${rows}
    </ul>
  </body>
</html>
`
}

function title(variant) {
  return variant === 'changed' ? 'Shop results (redesigned)' : 'Shop results'
}

function row(variant, name, price) {
  return variant === 'changed'
    ? `<li class="item"><span class="name">${name}</span><span class="cost">${price}</span></li>`
    : `<li class="product"><h2 class="title">${name}</h2><span class="price">${price}</span></li>`
}
