/**
 * Geographic layer: faint coastline topoline + the path-of-totality center
 * line + the location marker, all on one fitted projection (PLAN.md §7).
 * Rendered as a fine, confident Swiss line — geometry only, no stylising.
 */
import { useMemo } from "react";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import { baseMapSlice, type BaseMap } from "@/lib/coastline";
import type { FittedProjection, LonLat } from "@/lib/projection";
import type { MarkerAnchor } from "@/poster/types";
import type { PathStyle, UmbraFill } from "@/poster/variant";

export interface GeoLayerStyle {
  /** Optional faint fill under the coastline so landmasses read clearly. */
  land?: string;
  coastline: string;
  coastlineWidth: number;
  centerline: string;
  centerlineWidth: number;
  /** Optional under-stroke so the line reads on both dark and light zones. */
  centerlineHalo?: string;
  centerlineHaloWidth?: number;
  /** Edge-of-totality limit lines (real umbra outline, or mirrored offsets). */
  edgeline?: string;
  edgelineWidth?: number;
  edgelineOpacity?: number;
  /**
   * Perpendicular offset (px) of each synthetic edge line from the centre
   * line — the fallback when the eclipse has no real `limits` geometry.
   */
  edgeOffset?: number;
  marker: string;
  markerLabel: string;
  labelFamily: string;
}

/** Round every decimal in an SVG path string to 2dp for stable SSR/client output. */
function roundCoords(d: string): string {
  return d.replace(/\d+\.\d+/g, (m) => Number(m).toFixed(2));
}

/**
 * Build an SVG path offset perpendicular to each LineString by `offset` px in
 * projected screen space — used to draw the totality-edge limit lines parallel
 * to the centre line (the source data is the centre line only).
 */
function offsetLineD(
  features: FeatureCollection<LineString>["features"],
  project: (loc: LonLat) => [number, number] | null,
  offset: number,
): string {
  const parts: string[] = [];
  for (const f of features) {
    if (f.geometry?.type !== "LineString") continue;
    const pts = f.geometry.coordinates
      .map(([lon, lat]) => project({ lon, lat }))
      .filter((p): p is [number, number] => p != null);
    if (pts.length < 2) continue;
    const seg: string[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // Perpendicular normal (−dy, dx) scaled by the offset.
      const x = pts[i][0] - dy * offset;
      const y = pts[i][1] + dx * offset;
      seg.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    parts.push(seg.join(" "));
  }
  return parts.join(" ");
}

/** Label offsets per anchor — sized to clear the pin's outer ring (r 8). */
const LABEL_POS: Record<MarkerAnchor, { x: number; y: number; anchor: "start" | "middle" | "end" }> = {
  e: { x: 10, y: 3.5, anchor: "start" },
  w: { x: -10, y: 3.5, anchor: "end" },
  n: { x: 0, y: -13, anchor: "middle" },
  s: { x: 0, y: 20, anchor: "middle" },
  ne: { x: 8, y: -9, anchor: "start" },
  nw: { x: -8, y: -9, anchor: "end" },
  se: { x: 8, y: 15.5, anchor: "start" },
  sw: { x: -8, y: 15.5, anchor: "end" },
};

export const DEFAULT_GEO_STYLE: GeoLayerStyle = {
  coastline: "rgba(0,0,0,0.18)",
  coastlineWidth: 0.5,
  centerline: "#0e1216",
  centerlineWidth: 1.25,
  marker: "#ff5c02",
  markerLabel: "#0e1216",
  labelFamily: "var(--font-geist-mono), monospace",
};

interface GeoLayerProps {
  fit: FittedProjection;
  path: FeatureCollection<LineString>;
  /** Real edge-of-totality outline; preferred over synthetic offsets. */
  limits?: FeatureCollection<LineString>;
  /** The band as a fillable polygon, for the optional umbra wash. */
  band?: FeatureCollection<Polygon>;
  /** Which geometry the main line draws — falls back to the centre line
   *  when the eclipse has no umbra outline; "none" hides the path entirely. */
  mode?: PathStyle;
  /** Optional wash filling the band (umbra mode only). */
  bandFill?: UmbraFill;
  /** Stroke the umbra outline (umbra mode only; default true). */
  bandStroke?: boolean;
  /** Which Natural Earth geometry the land layer draws. */
  baseMap?: BaseMap;
  location: LonLat & { name?: string };
  /** Where the label sits around the dot (default "e", to the right). */
  labelAnchor?: MarkerAnchor;
  clipId: string;
  style?: Partial<GeoLayerStyle>;
}

export function GeoLayer({
  fit,
  path,
  limits,
  band,
  mode = "centerline",
  bandFill,
  bandStroke = true,
  baseMap,
  location,
  labelAnchor = "e",
  clipId,
  style,
}: GeoLayerProps) {
  const s = { ...DEFAULT_GEO_STYLE, ...style };
  const pathOn = mode !== "none";
  const umbraMode = mode === "umbra" && !!limits;
  const lineOn = pathOn && (!umbraMode || bandStroke);
  // geoPath emits full-precision floats whose last digit can differ between the
  // SSR (Node) and client renders — round them so the strings match and React
  // doesn't report a hydration mismatch. All geometry is memoized on the fit
  // (and windowed to the crop) so re-renders from unrelated controls don't
  // re-stream the world through the projection.
  const { landD, coastD } = useMemo(() => {
    const bm = baseMapSlice(baseMap, fit.window);
    return {
      landD: roundCoords(fit.pathGen(bm.fill) ?? ""),
      coastD: roundCoords(fit.pathGen(bm.stroke) ?? ""),
    };
  }, [fit, baseMap]);
  const lineD = useMemo(
    () => roundCoords(fit.pathGen(umbraMode ? limits! : path) ?? ""),
    [fit, umbraMode, limits, path],
  );
  const bandD = useMemo(
    () => (band ? roundCoords(fit.pathGen(band) ?? "") : ""),
    [fit, band],
  );
  const marker = fit.project(location);

  const blend = bandFill?.blend;
  return (
    <>
    {/* The wash sits OUTSIDE the clipped group, self-clipped: a clip-path on
        an ancestor group isolates blending, and mix-blend-mode must composite
        against the poster gradient behind this layer. */}
    {umbraMode && bandFill?.on && band && (
      <path
        clipPath={`url(#${clipId})`}
        d={bandD}
        fill={bandFill.color}
        fillOpacity={bandFill.opacity}
        stroke="none"
        style={blend && blend !== "normal" ? { mixBlendMode: blend } : undefined}
      />
    )}
    <g clipPath={`url(#${clipId})`}>
      {s.land && <path d={landD} fill={s.land} stroke="none" />}
      <path
        d={coastD}
        fill="none"
        stroke={s.coastline}
        strokeWidth={s.coastlineWidth}
        strokeLinejoin="round"
      />
      {pathOn && !umbraMode && s.edgeline && limits && (
        <path
          d={roundCoords(fit.pathGen(limits) ?? "")}
          fill="none"
          stroke={s.edgeline}
          strokeWidth={s.edgelineWidth ?? 0.8}
          opacity={s.edgelineOpacity ?? 0.45}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {pathOn && !umbraMode && s.edgeline && !limits && s.edgeOffset
        ? [s.edgeOffset, -s.edgeOffset].map((off, i) => (
            <path
              key={i}
              d={offsetLineD(path.features, fit.project, off)}
              fill="none"
              stroke={s.edgeline}
              strokeWidth={s.edgelineWidth ?? 0.8}
              opacity={s.edgelineOpacity ?? 0.45}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))
        : null}
      {lineOn && s.centerlineHalo && (
        <path
          d={lineD}
          fill="none"
          stroke={s.centerlineHalo}
          strokeWidth={s.centerlineHaloWidth ?? s.centerlineWidth + 2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {lineOn && (
        <path
          d={lineD}
          fill="none"
          stroke={s.centerline}
          strokeWidth={s.centerlineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {marker && (
        // Round to a stable precision so the SSR and client strings match
        // exactly (raw projection floats differ in their last digit between
        // Node and the browser → React hydration mismatch).
        <g transform={`translate(${marker[0].toFixed(2)} ${marker[1].toFixed(2)})`}>
          {/* Prominent "you are here" pin: soft halo → outer ring → dot with a
              crisp white outline so it reads on any background. */}
          <circle r={13} fill={s.marker} opacity={0.18} />
          <circle r={8} fill="none" stroke={s.marker} strokeWidth={1.25} opacity={0.9} />
          <circle r={4.5} fill={s.marker} />
          <circle r={4.5} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.9} />
          {location.name && (
            <text
              x={LABEL_POS[labelAnchor].x}
              y={LABEL_POS[labelAnchor].y}
              textAnchor={LABEL_POS[labelAnchor].anchor}
              fill={s.markerLabel}
              fontFamily={s.labelFamily}
              fontSize={9}
              letterSpacing={0.5}
            >
              {location.name.toUpperCase()}
            </text>
          )}
        </g>
      )}
    </g>
    </>
  );
}
