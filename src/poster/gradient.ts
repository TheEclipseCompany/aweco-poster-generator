/**
 * Randomized gradient generator (PLAN.md §2, owner: "more variety, use all
 * palette colors"). Uses curated dark→light recipes built from the 7-color
 * master palette so every result is on-brand and legible (monotonic luminance
 * keeps light text readable on the dark end), then jitters offsets, direction,
 * and full-bleed vs contained mode.
 */
import type { Rng } from "@/lib/rng";

/** Relative luminance 0..1 of a #rrggbb hex (for legibility decisions). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Curated dark→light ramps from the master palette. First = the locked look. */
export const RECIPES: { name: string; colors: string[] }[] = [
  { name: "classic", colors: ["#0a0b13", "#2f1b24", "#fda689", "#efe9e4"] },
  { name: "dusk", colors: ["#213443", "#912a3f", "#fda689", "#f4ede6"] },
  { name: "solar", colors: ["#04070c", "#912a3f", "#df8b00", "#fda689"] },
  { name: "ember", colors: ["#2f1b24", "#ba543d", "#df8b00", "#efe9e4"] },
  { name: "night", colors: ["#0a0b13", "#213443", "#fda689", "#f4ede6"] },
  { name: "deep-ember", colors: ["#04070c", "#2f1b24", "#ba543d", "#fda689"] },
];

/** Direction vectors (dark end → light end), all reading dark-top → light. */
const DIRECTIONS: { dx: number; dy: number }[] = [
  { dx: 0, dy: 1 },
  { dx: 0.35, dy: 1 },
  { dx: -0.35, dy: 1 },
  { dx: 0.6, dy: 1 },
  { dx: 0.15, dy: 1 },
];

/** Flat frame colors used behind a contained gradient field. */
const FRAMES = ["#0e1216", "#0a0b13", "#1a1016"];

export interface GradientStop {
  offset: number;
  color: string;
}

export interface GradientSpec {
  stops: GradientStop[];
  /** objectBoundingBox coords for <linearGradient>. */
  coords: { x1: number; y1: number; x2: number; y2: number };
  mode: "full" | "contained";
  /** Flat frame color (only meaningful when mode === "contained"). */
  frame: string;
  /** Side of the contained field as a fraction of the poster's short edge
   *  (absent = 0.74, so older share links render unchanged). */
  containedScale?: number;
  /** Darkest and lightest stop colors, for downstream legibility logic. */
  darkColor: string;
  lightColor: string;
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (i: number) =>
    Math.round(ch(pa, i) + (ch(pb, i) - ch(pa, i)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(0)}${mix(2)}${mix(4)}`;
}

/** Interpolated color at fractional point (fx, fy) along the gradient axis. */
export function colorAt(spec: GradientSpec, fx: number, fy: number): string {
  const { x1, y1, x2, y2 } = spec.coords;
  const ax = x2 - x1;
  const ay = y2 - y1;
  const len2 = ax * ax + ay * ay || 1;
  let t = ((fx - x1) * ax + (fy - y1) * ay) / len2;
  t = Math.max(0, Math.min(1, t));
  const s = spec.stops;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].offset) {
      const span = s[i].offset - s[i - 1].offset || 1;
      return lerpHex(s[i - 1].color, s[i].color, (t - s[i - 1].offset) / span);
    }
  }
  return s[s.length - 1].color;
}

/**
 * White or ink for text at (fx, fy). In contained mode the frame is dark, so
 * text always reads white; in full-bleed mode we sample the gradient.
 */
export function textColorOn(
  spec: GradientSpec,
  fx: number,
  fy: number,
): "#ffffff" | "#0e1216" {
  if (spec.mode === "contained") return "#ffffff";
  return luminance(colorAt(spec, fx, fy)) > 0.5 ? "#0e1216" : "#ffffff";
}

export interface GradientConfig {
  /** Enabled recipes to pick from (defaults to all). */
  recipes?: { name: string; colors: string[] }[];
  /** Probability of contained-field mode (0..1). */
  containedProb?: number;
}

export function makeGradient(rng: Rng, cfg: GradientConfig = {}): GradientSpec {
  const pool = cfg.recipes && cfg.recipes.length ? cfg.recipes : RECIPES;
  const recipe = rng.pick(pool).colors;
  const n = recipe.length;
  const stops: GradientStop[] = recipe.map((color, i) => {
    let offset = i / (n - 1);
    if (i > 0 && i < n - 1) offset += rng.float(-0.06, 0.06);
    return { offset: Math.max(0, Math.min(1, offset)), color };
  });

  const d = rng.pick(DIRECTIONS);
  const coords = {
    x1: 0.5 - d.dx / 2,
    y1: 0.5 - d.dy / 2,
    x2: 0.5 + d.dx / 2,
    y2: 0.5 + d.dy / 2,
  };

  const containedProb = cfg.containedProb ?? 0.28;
  const mode = rng.weighted([
    { value: "full" as const, weight: 1 - containedProb },
    { value: "contained" as const, weight: containedProb },
  ]);

  return {
    stops,
    coords,
    mode,
    frame: rng.pick(FRAMES),
    darkColor: recipe[0],
    lightColor: recipe[n - 1],
  };
}
