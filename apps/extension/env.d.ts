/**
 * Vite asset imports used by the extension entrypoints. The content script inlines the
 * UI stylesheets (`?inline` returns the CSS text) so they can be appended **inside** the
 * Shadow DOM root — an external stylesheet would leak into the host page (UI_SPEC §11).
 */
declare module '*.css?inline' {
  const css: string
  export default css
}
