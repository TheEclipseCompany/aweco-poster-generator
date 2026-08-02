import { geoArea } from "d3-geo";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import path2024 from "./paths/eclipse-2024.json";
import path2026 from "./paths/eclipse-2026.json";

export type EclipseId = "2024-04-08" | "2026-08-12";

type LineFC = FeatureCollection<LineString>;

/**
 * Two path-file shapes exist: the hand-trimmed NASA extract whose single
 * feature is tagged `kind: "centerline"` (2024), and the full besselian
 * export whose features carry a `type` tag — centerlines, umbra outline,
 * obscuration contours, time lines (2026). Normalize either down to just
 * the lines the posters draw.
 */
function lineFeatures(
  raw: FeatureCollection,
  match: (props: Record<string, unknown>) => boolean,
): Feature<LineString>[] {
  return raw.features.filter(
    (f): f is Feature<LineString> =>
      f.geometry?.type === "LineString" &&
      match((f.properties ?? {}) as Record<string, unknown>),
  );
}

function centerlineOf(raw: FeatureCollection): LineFC {
  const matchers: Array<(p: Record<string, unknown>) => boolean> = [
    (p) => p.kind === "centerline",
    (p) => p.type === "umbra_centerline_duration",
    (p) => p.type === "umbra_centerline_magnitude",
  ];
  for (const match of matchers) {
    const features = lineFeatures(raw, match);
    if (features.length) return { type: "FeatureCollection", features };
  }
  throw new Error("eclipse path data: no centerline feature found");
}

/** Closed outline of the totality band, when the source provides one. */
function limitsOf(raw: FeatureCollection): LineFC | undefined {
  const features = lineFeatures(raw, (p) => p.type === "umbra");
  return features.length ? { type: "FeatureCollection", features } : undefined;
}

/**
 * The umbra ring as a fillable Polygon. The source winds the ring so d3's
 * spherical convention reads the interior as everything BUT the band —
 * rewind any ring enclosing more than a hemisphere.
 */
function bandOf(raw: FeatureCollection): FeatureCollection<Polygon> | undefined {
  const rings = lineFeatures(raw, (p) => p.type === "umbra");
  if (!rings.length) return undefined;
  const features = rings.map((f): Feature<Polygon> => {
    let ring = f.geometry.coordinates;
    const [first, last] = [ring[0], ring[ring.length - 1]];
    if (first[0] !== last[0] || first[1] !== last[1]) ring = [...ring, first];
    let geometry: Polygon = { type: "Polygon", coordinates: [ring] };
    if (geoArea(geometry) > 2 * Math.PI) {
      geometry = { type: "Polygon", coordinates: [[...ring].reverse()] };
    }
    return { type: "Feature", properties: f.properties, geometry };
  });
  return { type: "FeatureCollection", features };
}

const raw2024 = path2024 as unknown as FeatureCollection;
const raw2026 = path2026 as unknown as FeatureCollection;

export interface EclipseRecord {
  id: EclipseId;
  name: string;
  /** ISO date of greatest eclipse (UTC). */
  date: string;
  type: "total";
  region: string;
  /** Path-of-totality central line. */
  path: LineFC;
  /** Edge-of-totality outline (closed umbra band), when the source has it. */
  limits?: LineFC;
  /** The same band as a fillable polygon (rewound for d3). */
  band?: FeatureCollection<Polygon>;
  /** Latitude degrees spanned by the default crop — tuned per eclipse. */
  baseSpanDeg: number;
  /** A representative location to seed the projection/crop and default form. */
  defaultLocation: {
    name: string;
    admin?: string;
    lat: number;
    lon: number;
    tz: string;
  };
}

export const ECLIPSES: Record<EclipseId, EclipseRecord> = {
  "2024-04-08": {
    id: "2024-04-08",
    name: "Total Solar Eclipse — April 8, 2024",
    date: "2024-04-08",
    type: "total",
    region: "Mexico · United States (Texas to Maine) · Eastern Canada",
    path: centerlineOf(raw2024),
    limits: limitsOf(raw2024),
    band: bandOf(raw2024),
    baseSpanDeg: 26,
    defaultLocation: { name: "Mazatlán", admin: "Sinaloa, MX", lat: 23.2494, lon: -106.4111, tz: "America/Mazatlan" },
  },
  "2026-08-12": {
    id: "2026-08-12",
    name: "Total Solar Eclipse — August 12, 2026",
    date: "2026-08-12",
    type: "total",
    region: "Greenland · Iceland · Spain",
    path: centerlineOf(raw2026),
    limits: limitsOf(raw2026),
    band: bandOf(raw2026),
    baseSpanDeg: 15,
    defaultLocation: { name: "Reykjavík", admin: "IS", lat: 64.1466, lon: -21.9426, tz: "Atlantic/Reykjavik" },
  },
};

export const ECLIPSE_LIST: EclipseRecord[] = Object.values(ECLIPSES);

export function getEclipse(id: EclipseId): EclipseRecord {
  return ECLIPSES[id];
}
