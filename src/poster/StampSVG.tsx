/**
 * The "eclipse stamp" — a small commemorative badge, passport-stamp sized.
 * Carries only the essentials (location, totality duration) over the poster
 * atmosphere + geography, ringed with stamp-style line detail (concentric rings
 * and radial ticks). Same {model, variant} signature as PosterSVG/TicketSVG.
 */
import { useMemo } from "react";
import { fitProjection } from "@/lib/projection";
import { formatDuration, formatObscuration } from "@/lib/astronomy";
import { GeoLayer } from "@/poster/layers/GeoLayer";
import { FRAME, type PosterModel } from "@/poster/types";
import type { PosterVariant } from "@/poster/variant";

const SANS = "var(--font-geist-sans), system-ui, -apple-system, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";

export function StampSVG({
  model,
  variant,
}: {
  model: PosterModel;
  variant: PosterVariant;
}) {
  const { w: W, h: H } = FRAME.stamp;
  const cx = W / 2;
  const cy = H / 2;
  const uid = variant.seed.replace(/[^A-Za-z0-9]/g, "");
  const clipId = `stamp-clip-${uid}`;
  const gradId = `stamp-atmo-${uid}`;
  const grainId = `stamp-grain-${uid}`;
  const vignId = `stamp-vign-${uid}`;
  const arcId = `stamp-arc-${uid}`;
  const { circumstances: c, location: loc, eclipse } = model;
  const g = variant.gradient;

  // Ring geometry — a layered rim: double outer ring, radial ticks, inner ring.
  const rClip = 248;
  const rRing1 = 248;
  const rRing2 = 240;
  const rTickIn = 228;
  const rTickOut = 238;
  const rInner = 214;
  const rArc = 186; // radius the curved location text follows (gap kept to the rim)

  // Radial tick marks around the rim.
  const N = 72;
  let ticksD = "";
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ticksD +=
      `M${(cx + cos * rTickIn).toFixed(2)} ${(cy + sin * rTickIn).toFixed(2)}` +
      `L${(cx + cos * rTickOut).toFixed(2)} ${(cy + sin * rTickOut).toFixed(2)}`;
  }

  // Top arc for the curved location text (left→right over the top).
  const arcD = `M ${cx - rArc} ${cy} A ${rArc} ${rArc} 0 0 0 ${cx + rArc} ${cy}`;

  // Geography — same projection style the poster uses, clipped to the disc.
  // Memoized: refit only when the crop actually moves.
  const { path: eclipsePath } = eclipse;
  const { lat, lon } = loc;
  const { spanDeg, offsetLat, offsetLon } = variant.crop;
  const fit = useMemo(
    () =>
      fitProjection(eclipsePath, { lat, lon }, W, H, {
        spanDeg,
        center: { lat: lat + offsetLat, lon: lon + offsetLon },
      }),
    [eclipsePath, lat, lon, W, H, spanDeg, offsetLat, offsetLon],
  );

  const placeName = (loc.admin ? `${loc.name}, ${loc.admin}` : loc.name).toUpperCase();
  const inTot = c.inTotality;
  const big = inTot ? formatDuration(c.totalityDurationSec) : formatObscuration(c.obscuration);
  const bigLabel = inTot ? "OF TOTALITY" : "COVERAGE";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={rClip} />
        </clipPath>
        <linearGradient id={gradId} x1={g.coords.x1} y1={g.coords.y1} x2={g.coords.x2} y2={g.coords.y2}>
          {g.stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <radialGradient id={vignId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#090b0f" stopOpacity={0.32} />
          <stop offset="62%" stopColor="#090b0f" stopOpacity={0.42} />
          <stop offset="100%" stopColor="#090b0f" stopOpacity={0.82} />
        </radialGradient>
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves={3} seed={variant.grainSeed} stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="gray" />
          <feComponentTransfer in="gray">
            <feFuncR type="linear" slope="1.8" intercept="-0.4" />
            <feFuncG type="linear" slope="1.8" intercept="-0.4" />
            <feFuncB type="linear" slope="1.8" intercept="-0.4" />
          </feComponentTransfer>
        </filter>
        <path id={arcId} d={arcD} fill="none" />
      </defs>

      {/* Atmosphere + geography, clipped to the disc */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={W} height={H} fill="#0c0e12" />
        <rect x={0} y={0} width={W} height={H} fill={`url(#${gradId})`} opacity={0.62} />
        <GeoLayer
          fit={fit}
          path={eclipse.path}
          limits={eclipse.limits}
          band={eclipse.band}
          mode={variant.pathStyle}
          bandFill={variant.umbraFill}
          bandStroke={variant.umbraStroke}
          baseMap={variant.baseMap}
          location={{ lat: loc.lat, lon: loc.lon }}
          clipId={clipId}
          style={{
            land: "rgba(255,255,255,0.07)",
            coastline: "rgba(255,255,255,0.32)",
            coastlineWidth: 0.7,
            centerline: "#ffffff",
            centerlineWidth: 1.4,
            marker: "#ff5c02",
            markerLabel: "rgba(255,255,255,0.9)",
            labelFamily: MONO,
          }}
        />
        <rect x={0} y={0} width={W} height={H} filter={`url(#${grainId})`} opacity={variant.grainIntensity * 0.55} style={{ mixBlendMode: "overlay" }} />
        <rect x={0} y={0} width={W} height={H} fill={`url(#${vignId})`} />
      </g>

      {/* Stamp line detail: double outer ring, radial ticks, inner ring. */}
      <circle cx={cx} cy={cy} r={rRing1} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={rRing2} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
      <path d={ticksD} stroke="rgba(255,255,255,0.42)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth={1} />

      {/* Curved location along the top */}
      <text fontFamily={MONO} fontSize={16} letterSpacing={3} fill="rgba(255,255,255,0.92)">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          {placeName}
        </textPath>
      </text>

      {/* Center: totality duration */}
      <text x={cx} y={cy + 16} textAnchor="middle" fontFamily={SANS} fontSize={66} fontWeight={700} fill="#ffffff" letterSpacing={-2}>
        {big}
      </text>
      <text x={cx} y={cy + 50} textAnchor="middle" fontFamily={MONO} fontSize={12} letterSpacing={4} fill="rgba(255,255,255,0.62)">
        {bigLabel}
      </text>
    </svg>
  );
}
