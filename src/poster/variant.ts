/**
 * The locked-vs-variable split (PLAN.md §2), resolved deterministically from a
 * seed. makeVariant() picks every *variable* choice — grid arrangement,
 * gradient, crop, motif, type scale, grain — while the poster renderer holds
 * everything *locked* (fonts, hierarchy, logos, path treatment, data, the grain
 * recipe). Same seed → same poster.
 */
import { BASE_MAPS, type BaseMap } from "@/lib/coastline";
import type { Rng } from "@/lib/rng";
import { makeRng } from "@/lib/rng";
import { makeGradient, RECIPES, type GradientSpec } from "@/poster/gradient";

export type Corner = "tl" | "tr" | "bl" | "br";
export type HAlign = "left" | "center" | "right";
export type VPos = "high" | "low";
export type MotifKind = "none" | "disc" | "ring" | "phases";
/** Which path-of-totality geometry the map draws. */
export type PathStyle = "centerline" | "umbra";

/** How the umbra wash composites against the poster beneath it. */
export const BLEND_MODES = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** Optional wash filling the totality band (umbra mode only). */
export interface UmbraFill {
  on: boolean;
  color: string;
  /** 0..1 fill opacity. */
  opacity: number;
  /** mix-blend-mode of the wash (absent = normal). */
  blend?: BlendMode;
}

export const DEFAULT_UMBRA_FILL: UmbraFill = { on: false, color: "#ffffff", opacity: 0.12, blend: "normal" };

/**
 * Composable layout — each element is placed/styled independently (no curated
 * templates). Dialed directly in the tuning studio.
 */
export interface LayoutConfig {
  headline: {
    /** Vertical band. */
    vpos: VPos;
    /** Horizontal position of the text block. */
    hpos: HAlign;
    /** Reading axis. */
    axis: "horizontal" | "vertical";
    /** Text justification. */
    align: HAlign;
    /** Use PP Editorial Old Ultralight Italic instead of Neue York Narrow. */
    editorial: boolean;
  };
  meta: {
    corner: Corner;
    /** stack = corner block; spine = vertical data strip down the edge. */
    style: "stack" | "spine";
  };
  eclipseLogo: {
    on: boolean;
    /** Also show the Awe Co emblem badge right next to the eclipse badge. */
    aweBadge: boolean;
    corner: Corner;
  };
  awe: {
    /** The "A DIVISION OF…" brand tag — text only, placeable in any corner. */
    on: boolean;
    corner: Corner;
  };
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  headline: { vpos: "low", hpos: "left", axis: "horizontal", align: "left", editorial: false },
  meta: { corner: "tr", style: "stack" },
  eclipseLogo: { on: true, aweBadge: true, corner: "tl" },
  awe: { on: true, corner: "bl" },
};

export interface MotifSpec {
  kind: MotifKind;
  /** Center as fractions of W/H. */
  cxFrac: number;
  cyFrac: number;
  /** Radius / size as a fraction of the short edge U. */
  scale: number;
  /** −1..1: directional bright limb, horizontal (ring only). */
  shadowX?: number;
  /** −1..1: directional bright limb, vertical (ring only). */
  shadowY?: number;
  /** Bright-limb size as a multiple of the ring radius. */
  limbSize?: number;
  /** Glow spread of the bright limb, 0..1. */
  glowArea?: number;
}

export interface CropSpec {
  spanDeg: number;
  offsetLat: number;
  offsetLon: number;
}

/** Edge the gradient emanates from (ticket layout only). */
export type GradientDir = "top" | "bottom" | "left" | "right";

export interface PosterVariant {
  seed: string;
  layout: LayoutConfig;
  gradient: GradientSpec;
  motif: MotifSpec;
  crop: CropSpec;
  /** Multiplier on the base headline size, within the fixed hierarchy. */
  headlineScale: number;
  /** Overlay-pass opacity for grain (tasteful band, never below tactile). */
  grainIntensity: number;
  /** feTurbulence seed so the grain field itself varies per poster. */
  grainSeed: number;
  /** Ticket-only: which edge the partial gradient comes in from. */
  gradientDir?: GradientDir;
  /** Draw the centre line or the full umbra outline (absent = centerline,
   *  so older share links keep decoding). */
  pathStyle?: PathStyle;
  /** Optional band wash under the umbra outline (absent = no fill). */
  umbraFill?: UmbraFill;
  /** Stroke the umbra outline (absent = true, so older links keep the line). */
  umbraStroke?: boolean;
  /** Base-map geometry behind the path (absent = land-110m). */
  baseMap?: BaseMap;
}

/** Tunable ranges/weights for the generator (dialed in the tuning studio). */
export interface TuneConfig {
  /** The eclipse ring motif: on/off, a variable scale + position range (drawn
   *  per-seed so a re-rolled batch varies), and fixed "sun settings" — the
   *  bright limb's direction (shadowX, −1..1), size, and glow spread. */
  ring: {
    on: boolean;
    /** Ring radius range as a fraction of the short edge U: [min, max]. */
    scale: [number, number];
    /** Center-x range as a fraction of width: [min, max]. */
    x: [number, number];
    /** Center-y range as a fraction of height: [min, max]. */
    y: [number, number];
    shadowX: number;
    shadowY: number;
    limbSize: number;
    glowArea: number;
  };
  containedProb: number;
  /** Per-recipe enable flags, aligned to RECIPES order. */
  recipes: boolean[];
  /** Composed layout (directly authored, not randomized). */
  layout: LayoutConfig;
  /** Chance a design draws the full umbra band instead of the centre line. */
  umbraProb: number;
  /** Wash styling applied when a design rolls umbra (authored, not random). */
  umbraFill: UmbraFill;
  umbraStroke: boolean;
  /** Base maps the generator may pick from, aligned to BASE_MAPS order. */
  baseMaps: boolean[];
  /** Crop zoom: span multiplier [min, max]. */
  spanMul: [number, number];
  /** Max pan as a fraction of span. */
  panFrac: number;
  /** Grain overlay opacity [min, max]. */
  grain: [number, number];
  /** Headline size multiplier [min, max]. */
  headlineScale: [number, number];
}

export const DEFAULT_TUNE: TuneConfig = {
  ring: { on: true, scale: [0.24, 0.58], x: [0.35, 0.65], y: [0.30, 0.52], shadowX: 0, shadowY: 0, limbSize: 1.6, glowArea: 0.6 },
  containedProb: 0.28,
  recipes: RECIPES.map(() => true),
  layout: DEFAULT_LAYOUT,
  umbraProb: 0.5,
  umbraFill: DEFAULT_UMBRA_FILL,
  umbraStroke: true,
  baseMaps: BASE_MAPS.map(() => true),
  spanMul: [0.82, 1.35],
  panFrac: 0.18,
  grain: [0.46, 0.64],
  headlineScale: [0.86, 1.18],
};

export function makeVariant(
  seed: string,
  baseSpanDeg: number,
  cfg: TuneConfig = DEFAULT_TUNE,
): PosterVariant {
  const rng: Rng = makeRng(seed);

  const recipePool = RECIPES.filter((_, i) => cfg.recipes[i]);
  const gradient = makeGradient(rng, {
    recipes: recipePool.length ? recipePool : RECIPES,
    containedProb: cfg.containedProb,
  });

  // Ring is the only motif: an on/off element whose scale + position are drawn
  // from their tunable ranges so a re-rolled batch shows variety.
  const motif: MotifSpec = cfg.ring.on
    ? {
        kind: "ring",
        cxFrac: rng.float(cfg.ring.x[0], cfg.ring.x[1]),
        cyFrac: rng.float(cfg.ring.y[0], cfg.ring.y[1]),
        scale: rng.float(cfg.ring.scale[0], cfg.ring.scale[1]),
        shadowX: cfg.ring.shadowX,
        shadowY: cfg.ring.shadowY,
        limbSize: cfg.ring.limbSize,
        glowArea: cfg.ring.glowArea,
      }
    : { kind: "none", cxFrac: 0.5, cyFrac: 0.5, scale: 0 };

  const spanDeg = baseSpanDeg * rng.float(cfg.spanMul[0], cfg.spanMul[1]);
  const crop: CropSpec = {
    spanDeg,
    offsetLat: rng.float(-cfg.panFrac, cfg.panFrac) * spanDeg,
    offsetLon: rng.float(-cfg.panFrac * 1.2, cfg.panFrac * 1.2) * spanDeg,
  };

  const headlineScale = rng.float(cfg.headlineScale[0], cfg.headlineScale[1]);
  const grainIntensity = rng.float(cfg.grain[0], cfg.grain[1]);
  const grainSeed = rng.int(1, 97);

  // Path treatment + base map are part of the roll. Drawn LAST so adding
  // them didn't reshuffle what earlier seeds resolve to for the older fields.
  const pathStyle: PathStyle = rng.bool(cfg.umbraProb) ? "umbra" : "centerline";
  const mapPool = BASE_MAPS.filter((_, i) => cfg.baseMaps[i]);
  const baseMap: BaseMap = mapPool.length ? rng.pick(mapPool) : "land-110m";

  return {
    seed,
    layout: cfg.layout,
    pathStyle,
    umbraFill: cfg.umbraFill,
    umbraStroke: cfg.umbraStroke,
    baseMap,
    gradient,
    motif,
    crop,
    headlineScale,
    grainIntensity,
    grainSeed,
    gradientDir: "bottom",
  };
}
