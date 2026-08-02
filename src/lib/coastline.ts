/**
 * Natural Earth base maps → the faint land fill + coast/border strokes drawn
 * behind the path on the same projection (PLAN.md §4c, §7). Three sources,
 * selectable per poster: the light 1:110m land outline, the detailed 1:10m
 * land outline, and 1:10m countries (adds internal borders).
 *
 * Fill and stroke use different geometry on purpose. Fills are the polygon
 * features (rewound below); strokes are the topology MESH — each edge drawn
 * once, and, unlike polygon rings, a line clipped at the frame edge doesn't
 * close along it, so no hairlines appear at the crop border.
 */
import { geoArea } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon } from "geojson";
import land110m from "@/data/coastline/land-110m.json";
import land10m from "@/data/coastline/land-10m.json";
import countries10m from "@/data/coastline/countries-10m.json";

export const BASE_MAPS = ["land-110m", "land-10m", "countries-10m"] as const;
export type BaseMap = (typeof BASE_MAPS)[number];

type FillGeo = Feature<MultiPolygon | Polygon> | FeatureCollection<MultiPolygon | Polygon>;

export interface BaseMapGeo {
  fill: FillGeo;
  stroke: MultiLineString;
}

/**
 * d3 winds spherical polygons opposite to RFC 7946 — a GeoJSON-standard ring
 * reads as "everything but the land" and fills the ocean instead. (The 1:10m
 * exports are standard-wound; the 1:110m file was already d3-wound.) Rewind
 * exterior rings to enclose less than a hemisphere, holes the opposite way.
 */
function rewindPolygon(rings: number[][][]) {
  rings.forEach((ring, i) => {
    const enclosed = geoArea({ type: "Polygon", coordinates: [ring] });
    if (i === 0 ? enclosed > 2 * Math.PI : enclosed < 2 * Math.PI) ring.reverse();
  });
}

function rewind(geo: FillGeo): FillGeo {
  const features = "features" in geo ? geo.features : [geo];
  for (const f of features) {
    if (f.geometry.type === "Polygon") rewindPolygon(f.geometry.coordinates);
    else if (f.geometry.type === "MultiPolygon") f.geometry.coordinates.forEach(rewindPolygon);
  }
  return geo;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function build(topo: any, fillObj: string, strokeObj: string): BaseMapGeo {
  return {
    fill: rewind(feature(topo, topo.objects[fillObj]) as unknown as FillGeo),
    stroke: mesh(topo, topo.objects[strokeObj]) as MultiLineString,
  };
}

const SOURCES: Record<BaseMap, () => BaseMapGeo> = {
  "land-110m": () => build(land110m, "land", "land"),
  "land-10m": () => build(land10m, "land", "land"),
  // Fill from the merged land object (per-country fills leave antialiasing
  // seams); stroke the country mesh so internal borders draw, each once.
  "countries-10m": () => build(countries10m, "land", "countries"),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Topo→GeoJSON conversion of the 1:10m maps is heavy — do it lazily, once. */
const cache = new Map<BaseMap, BaseMapGeo>();

export function baseMapGeo(map: BaseMap = "land-110m"): BaseMapGeo {
  let g = cache.get(map);
  if (!g) {
    g = SOURCES[map]();
    cache.set(map, g);
  }
  return g;
}

// ── Windowed slices ─────────────────────────────────────────────────────────
// The 1:10m maps carry ~900k points; streaming them all through the projection
// on every render is what makes the studio drag. Each polygon/line gets a
// lon/lat bbox (computed once, cached), and baseMapSlice() returns only the
// parts that can touch the crop window — the projected output is identical
// because everything skipped would have been clipped away anyway.

/** [w, s, e, n] in degrees. */
type BBox = [number, number, number, number];

interface SpatialIndex {
  fillParts: { coords: Polygon["coordinates"]; bbox: BBox }[];
  strokeParts: { coords: MultiLineString["coordinates"][number]; bbox: BBox }[];
}

function bboxOf(points: number[][]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

const indexCache = new Map<BaseMap, SpatialIndex>();

/**
 * Stroke lines split into short runs that share endpoints — with round caps
 * the joined render is identical to the unsplit line, and small chunks cull
 * far more precisely than whole coastlines (a continent's outline has a
 * bbox that overlaps almost any window).
 */
const STROKE_CHUNK = 64;

function indexOf(map: BaseMap): SpatialIndex {
  let idx = indexCache.get(map);
  if (idx) return idx;
  const geo = baseMapGeo(map);
  const features = "features" in geo.fill ? geo.fill.features : [geo.fill];
  const fillParts: SpatialIndex["fillParts"] = [];
  for (const f of features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    // The exterior ring bounds the holes too, so its bbox covers the polygon.
    for (const p of polys) fillParts.push({ coords: p, bbox: bboxOf(p[0]) });
  }
  const strokeParts: SpatialIndex["strokeParts"] = [];
  for (const line of geo.stroke.coordinates) {
    for (let i = 0; i < line.length - 1; i += STROKE_CHUNK - 1) {
      const chunk = line.slice(i, i + STROKE_CHUNK);
      strokeParts.push({ coords: chunk, bbox: bboxOf(chunk) });
    }
  }
  idx = { fillParts, strokeParts };
  indexCache.set(map, idx);
  return idx;
}

export interface GeoWindow {
  w: number;
  s: number;
  e: number;
  n: number;
}

/** High-latitude windows can extend past ±180° — test lon with ±360 shifts. */
function hits(b: BBox, win: GeoWindow): boolean {
  if (b[1] > win.n || b[3] < win.s) return false;
  return [-360, 0, 360].some((dx) => b[0] + dx <= win.e && b[2] + dx >= win.w);
}

/** The base map cut down to what can touch `win` (identical projected output). */
export function baseMapSlice(map: BaseMap = "land-110m", win?: GeoWindow): BaseMapGeo {
  if (!win) return baseMapGeo(map);
  const idx = indexOf(map);
  return {
    fill: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: idx.fillParts.filter((p) => hits(p.bbox, win)).map((p) => p.coords),
      },
    },
    stroke: {
      type: "MultiLineString",
      coordinates: idx.strokeParts.filter((l) => hits(l.bbox, win)).map((l) => l.coords),
    },
  };
}
