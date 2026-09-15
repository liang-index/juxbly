/**
 * Minimal `jsdom` types.
 *
 * The package ships none, and the benchmark needs exactly one thing from it: a document
 * with a **URL**. `DOMParser` would parse the same HTML but every document would report
 * `about:blank`, and the analyser puts that URL in front of the model — a page with no
 * address is not the page the corpus captured. Declaring the two members we use is
 * cheaper than adding a dependency, and it cannot drift: anything else we reach for
 * fails the type check instead of silently becoming `any`.
 */
declare module 'jsdom' {
  export interface JSDOMOptions {
    url?: string
    contentType?: string
  }

  export class JSDOM {
    constructor(html: string, options?: JSDOMOptions)
    readonly window: Window & typeof globalThis
  }
}
