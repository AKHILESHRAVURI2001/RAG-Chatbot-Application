// Captured synchronously at module load — document.currentScript is only reliable during the
// initial, synchronous execution of a classic <script> tag, not after any async work (a
// microtask, an event handler, etc.), so this must run at the top level, not inside a function.
const SCRIPT_URL = typeof document !== 'undefined' ? document.currentScript?.getAttribute('src') ?? '' : '';

/**
 * Resolves a path relative to wherever this widget's own <script> tag was actually loaded from —
 * e.g. embedded as `<script src="https://cdn.example.com/widget/dist/widget.js">`,
 * `getStaticAssetUrl('icons/foo.png')` returns `https://cdn.example.com/widget/dist/icons/foo.png`.
 *
 * Use this for files placed in `public/` (see vite.config.ts) — Vite copies that folder's contents
 * verbatim into `dist/` alongside `widget.js` rather than inlining them as base64 into the bundle,
 * so this is the right choice for anything too large to want base64-embedded (small files like the
 * notification sounds use `?inline` imports instead — see widgetAudio.ts).
 *
 * Dev-only caveat: in `npm run dev`'s preview page, the script is served as an ES module from
 * `/src/...`, not the built `dist/widget.js`, so this resolves against the dev server root instead
 * of a `dist/`-sibling path — fine for local testing, but public/ assets should be referenced by
 * their root path (e.g. `/icons/foo.png`) if you need to preview them before building.
 */
export function getStaticAssetUrl(relativePath: string): string {
  if (!SCRIPT_URL) return relativePath;
  try {
    return new URL(relativePath, SCRIPT_URL).href;
  } catch {
    return relativePath;
  }
}
