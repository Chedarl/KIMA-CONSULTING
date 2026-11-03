// The KIMA theme object. Default = the owner-decided palette. A firm's
// branding overrides the accent (and, later, the logo and sender) by setting
// the same CSS variables the whole app already reads.

export const KIMA_ACCENT = { r: 69, g: 93, b: 168 }; // #455DA8 indigo

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Darken (amount < 0) or lighten (amount > 0) a hex colour by a percentage.
export function shade(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const f = (v: number) => Math.round((t - v) * p + v);
  const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return "#" + toHex(f(c.r)) + toHex(f(c.g)) + toHex(f(c.b));
}

// Relative luminance (WCAG), for contrast-aware hover choices.
export function luminance(hex: string): number {
  const c = hexToRgb(hex);
  if (!c) return 1;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

// A single accent colour produces the primary action, its text, its hover and
// the focus ring. Returns a ready-to-inject CSS string for :root variables.
export function themeCss(accentHex: string): string {
  const c = hexToRgb(accentHex) ?? KIMA_ACCENT;
  const base = "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const hover = luminance(base) > 0.35 ? shade(base, -0.12) : shade(base, 0.12);
  return [
    "--teal: " + c.r + " " + c.g + " " + c.b + ";",
    "--teal-text: " + c.r + " " + c.g + " " + c.b + ";",
    "--teal-hover: " + (hexToRgb(hover)?.r ?? c.r) + " " + (hexToRgb(hover)?.g ?? c.g) + " " + (hexToRgb(hover)?.b ?? c.b) + ";",
  ].join("");
}
