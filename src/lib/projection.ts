/**
 * d3-geo projection fitted to a crop framing the marked location and the
 * stretch of the path-of-totality that threads past it (PLAN.md §7).
 *
 * The crop is a window CENTERED ON THE LOCATION with a configurable degree
 * span — not the whole central line. The full line spans thousands of km
 * (the 2024 path covers ~130° of longitude); framing all of it shows half the
 * globe and reduces the path to a hairline. Centring on the location keeps the
 * geography legible and the path reading as the subject. Pan/zoom of this
 * window is what the generator randomizes later (§2: path crop/scale/position).
 *
 * v1 uses geoMercator — conformal, and with a location-centered window it never
 * approaches the pole, so Mercator's polar blow-up is a non-issue.
 */
import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, LineString, MultiPoint } from "geojson";

export interface LonLat {
  lat: number;
  lon: number;
}

const DEG = Math.PI / 180;

/**
 * The crop corners as a MultiPoint — NOT a Polygon. d3 treats a spherical
 * Polygon's interior by winding order; a wrongly-wound ring is read as the
 * whole-sphere complement and fitExtent then collapses the real crop to a few
 * pixels. Points have no interior, so this is unambiguous.
 */
function cropCorners(
  w: number,
  s: number,
  e: number,
  n: number,
): Feature<MultiPoint> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiPoint",
      coordinates: [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
      ],
    },
  };
}

/** A lon/lat window (degrees), west/south/east/north. */
export interface GeoWindow {
  w: number;
  s: number;
  e: number;
  n: number;
}

export interface FittedProjection {
  projection: GeoProjection;
  pathGen: ReturnType<typeof geoPath>;
  project: (loc: LonLat) => [number, number] | null;
  /** The crop bounds (plus margin) — lets layers pre-filter geometry.
   *  Absent when the crop crosses the antimeridian (fitExtent degrades to a
   *  near-global view there, so no window describes what's visible). */
  window?: GeoWindow;
}

export interface FitOptions {
  /** Latitude degrees spanned by the frame height — the zoom level. */
  spanDeg?: number;
  /** Crop center; defaults to the location. Pan the composition via this. */
  center?: LonLat;
  /** Inner inset in px so geometry doesn't touch the frame edge. */
  padding?: number;
}

/**
 * Fit a projection so a `spanDeg`-tall window around `center` fills the
 * `width`×`height` frame (aspect-corrected for the center latitude).
 */
export function fitProjection(
  _path: FeatureCollection<LineString>,
  location: LonLat,
  width: number,
  height: number,
  opts: FitOptions = {},
): FittedProjection {
  const { spanDeg = 28, padding = 0 } = opts;
  const center = opts.center ?? location;

  const halfLat = spanDeg / 2;
  const aspect = width / height;
  // Longitude degrees per latitude degree shrink with cos(lat); widen the lon
  // span so the window fills the frame width without distortion.
  const halfLon = (halfLat * aspect) / Math.max(0.15, Math.cos(center.lat * DEG));

  const w = center.lon - halfLon;
  const e = center.lon + halfLon;
  const s = center.lat - halfLat;
  const n = center.lat + halfLat;

  const projection = geoMercator();
  projection.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    cropCorners(w, s, e, n),
  );
  // Cull geometry outside the frame at generation time — the SVG clip-path
  // would hide it anyway, but without this every poster carries path data for
  // the whole projected world (megabytes with the 1:10m base maps).
  projection.clipExtent([
    [0, 0],
    [width, height],
  ]);
  const pathGen = geoPath(projection);
  const project = (loc: LonLat): [number, number] | null =>
    projection([loc.lon, loc.lat]) ?? null;
  // 25% margin so pre-filtering by this window can never cull geometry that
  // still touches the frame (padding, stroke widths).
  const win = {
    w: w - halfLon * 0.5,
    s: s - halfLat * 0.5,
    e: e + halfLon * 0.5,
    n: n + halfLat * 0.5,
  };
  const window = win.w >= -180 && win.e <= 180 ? win : undefined;
  return { projection, pathGen, project, window };
}
