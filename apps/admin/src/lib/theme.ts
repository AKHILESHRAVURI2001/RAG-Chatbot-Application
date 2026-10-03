/**
 * The admin panel's own theme color lives in the database (WidgetSettings.
 * adminPrimaryColor), not a fixed CSS value — this is the one place that
 * turns a saved hex color into the actual `--primary`/`--primary-tint`/
 * `--primary-dark` CSS variables every button, active-nav-state, and badge
 * in styles.css already keys off. Called once on load (Layout.tsx) and
 * again right after a successful save (Settings.tsx), so a color change
 * takes effect immediately without a page reload.
 */
export function applyAdminTheme(hex: string): void {
  const root = document.documentElement.style;
  root.setProperty('--primary', hex);
  root.setProperty('--primary-tint', mix(hex, '#ffffff', 0.88));
  root.setProperty('--primary-dark', mix(hex, '#000000', 0.3));
}

/** Blends `hex` toward `toward` by `amount` (0 = no change, 1 = fully `toward`) — a plain linear RGB mix, good enough for a UI tint/shade, not meant to be perceptually precise. */
function mix(hex: string, toward: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(toward);
  if (!a || !b) return hex;
  const blend = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return toHex(blend(a.r, b.r), blend(a.g, b.g), blend(a.b, b.b));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}
