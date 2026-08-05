/**
 * The poster — one self-contained SVG tree (gradient + grain + geography +
 * type), rendered from a seeded PosterVariant. The atmosphere (gradient, crop,
 * grain) is randomized; the layout is composed directly (PLAN.md §2). PNG
 * export stays crisp because it's all SVG.
 */
import { useMemo } from "react";
import { fitProjection } from "@/lib/projection";
import {
  formatDuration,
  formatLocalTime,
  formatObscuration,
} from "@/lib/astronomy";
import { GeoLayer } from "@/poster/layers/GeoLayer";
import { CircleMotif } from "@/poster/layers/CircleMotif";
import { AudioCorona } from "@/poster/layers/AudioCorona";
import { EclipseBadge, AweCoBadge } from "@/poster/marks";
import { textColorOn } from "@/poster/gradient";
import { FRAME, type PosterModel } from "@/poster/types";
import type { Corner, PosterVariant } from "@/poster/variant";
import type { AudioSignature } from "@/lib/audioSignature";

/** Optional audio-signature sunburst around the eclipse ring (studio-only). */
export interface AudioCoronaOpts {
  signature: AudioSignature;
  /** Rays around the circle. */
  rayCount: number;
  /** Max ray length as a fraction of the ring radius. */
  rayLen: number;
  /** Soft round-capped rays instead of sharp tapered spikes. */
  roundTips: boolean;
  /** Use a high-contrast (white) corona instead of the warm gradient tone. */
  highContrast: boolean;
}

const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const DISPLAY = "var(--font-neue-york-narrow), var(--font-neue-york), Georgia, serif";
const TAGLINE = "A DIVISION OF THE AWE COMPANY OF EARTH";

const fmtDate = (iso: string) => iso.replaceAll("-", ".");
const isLeft = (c: Corner) => c === "tl" || c === "bl";
const isTop = (c: Corner) => c === "tl" || c === "tr";

function metaRows(model: PosterModel) {
  const { circumstances: c, location: loc, eclipse } = model;
  const place = loc.admin ? `${loc.name}, ${loc.admin}` : loc.name;
  return [
    { label: "DATE", value: fmtDate(eclipse.date) },
    { label: "LOCATION", value: place.toUpperCase() },
    {
      label: c.inTotality ? "TOTALITY BEGINS" : "MAXIMUM",
      value: formatLocalTime(c.inTotality ? c.totalBegin : c.peak, loc.tz),
    },
    { label: "DURATION", value: formatDuration(c.totalityDurationSec) },
    { label: "OBSCURATION", value: formatObscuration(c.obscuration) },
  ];
}

export function PosterSVG({
  model,
  variant,
  audio,
}: {
  model: PosterModel;
  variant: PosterVariant;
  audio?: AudioCoronaOpts | null;
}) {
  const { w: W, h: H } = FRAME[model.ratio];
  const U = Math.min(W, H);
  const M = Math.round(U * 0.072);
  const g = variant.gradient;
  const uid = variant.seed.replace(/[^A-Za-z0-9]/g, "");
  const L = variant.layout;

  // Memoized so the fit (and the geometry GeoLayer derives from it) only
  // recomputes when the crop actually moves — not on every type/color tweak.
  const { path: eclipsePath } = model.eclipse;
  const { lat, lon } = model.location;
  const { spanDeg, offsetLat, offsetLon } = variant.crop;
  const fit = useMemo(
    () =>
      fitProjection(eclipsePath, { lat, lon }, W, H, {
        spanDeg,
        center: { lat: lat + offsetLat, lon: lon + offsetLon },
      }),
    [eclipsePath, lat, lon, W, H, spanDeg, offsetLat, offsetLon],
  );

  const gradId = `atmo-${uid}`;
  const grainId = `grain-${uid}`;
  const clipId = `frame-${uid}`;
  const rows = metaRows(model);
  const motif = variant.motif;
  const mCx = motif.cxFrac * W;
  const mCy = motif.cyFrac * H;
  const mR = motif.scale * U;
  const coronaWarm = g.stops[g.stops.length - 2]?.color ?? "#fda689";

  // Corner colour helper (legibility-aware).
  const cornerColor = (c: Corner) =>
    textColorOn(g, isLeft(c) ? 0.2 : 0.8, isTop(c) ? 0.06 : 0.94);

  // ── Headline geometry ──────────────────────────────────────
  const hl = L.headline;
  // Face: Neue York Narrow Extrabold by default, or PP Editorial Old Ultralight
  // Italic when the editorial toggle is on (lighter/wider → looser fit factor).
  const aspFamily = hl.editorial ? "var(--font-editorial), Georgia, serif" : DISPLAY;
  const aspWeight = hl.editorial ? 200 : 800;
  const aspStyle = hl.editorial ? "italic" : "normal";
  const aspLS = hl.editorial ? 0 : -1;
  const aspFit = hl.editorial ? 0.5 : 0.46;
  const aspBaseline = H * (hl.vpos === "high" ? 0.3 : 0.88);
  const hFx = hl.hpos === "left" ? 0.2 : hl.hpos === "center" ? 0.5 : 0.8;
  const headlineColor = textColorOn(g, hFx, hl.vpos === "high" ? 0.3 : 0.88);
  const aspX = hl.hpos === "left" ? M : hl.hpos === "center" ? W / 2 : W - M;
  const aspAnchor: "start" | "middle" | "end" =
    hl.align === "left" ? "start" : hl.align === "center" ? "middle" : "end";
  const aspMax = Math.round(U * 0.15 * variant.headlineScale);
  const aspAvail = W - 2 * M;
  const aspLines = model.aspiration.split("\n");
  const aspMaxLen = Math.max(1, ...aspLines.map((l) => l.length));
  const aspHeightAvail = Math.max(80, aspBaseline - M);
  const aspSize = Math.min(
    aspMax,
    Math.round(aspAvail / (aspFit * aspMaxLen)),
    Math.round(aspHeightAvail / (aspLines.length * 0.98)),
  );
  const aspLineH = aspSize * 0.98;
  const aspTop = aspBaseline - (aspLines.length - 1) * aspLineH;
  // Vertical spine variant
  const vText = aspLines.join(" ");
  const vLeftEdge = hl.hpos !== "right";
  const aspSizeV = Math.min(
    aspMax,
    Math.round((H - M * 3.4) / (aspFit * Math.max(1, vText.length))),
  );
  const vColor = textColorOn(g, vLeftEdge ? 0.12 : 0.88, 0.5);
  const vTransform = vLeftEdge
    ? `translate(${M + Math.round(aspSizeV * 0.78)}, ${H - Math.round(M * 1.7)}) rotate(-90)`
    : `translate(${W - M - Math.round(aspSizeV * 0.22)}, ${Math.round(M * 1.7)}) rotate(90)`;

  // ── Metadata geometry ──────────────────────────────────────
  const mc = L.meta.corner;
  const mLeft = isLeft(mc);
  const metaColor = cornerColor(mc);
  const metaTextX = mLeft ? M : W - M;
  const metaAnchor = mLeft ? "start" : "end";
  const rowH = 23;
  const metaStartY = isTop(mc) ? M + 8 : H - M - rows.length * rowH + 8;

  // ── Eclipse badge (+ optional Awe Co badge alongside) ──────
  const el = L.eclipseLogo;
  const elColor = cornerColor(el.corner);
  const badgeS = Math.round(U * 0.048);
  const badgeGap = Math.round(U * 0.016);
  const elRowW = badgeS + (el.aweBadge ? badgeGap + badgeS : 0);
  const elX = isLeft(el.corner) ? M : W - M - elRowW;
  const elY = isTop(el.corner) ? M : H - M - badgeS;

  // ── Awe Co brand tag (text only) ───────────────────────────
  const aw = L.awe;
  const awColor = cornerColor(aw.corner);
  const awLeft = isLeft(aw.corner);
  const tagX = awLeft ? M : W - M;
  const tagAnchor = awLeft ? "start" : "end";
  const tagY = isTop(aw.corner) ? M + 12 : H - M;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%", height: "auto" }}
    >
      <defs>
        <linearGradient id={gradId} x1={g.coords.x1} y1={g.coords.y1} x2={g.coords.x2} y2={g.coords.y2}>
          {g.stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves={3} seed={variant.grainSeed} stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" result="gray" />
          <feComponentTransfer in="gray">
            <feFuncR type="linear" slope="1.8" intercept="-0.4" />
            <feFuncG type="linear" slope="1.8" intercept="-0.4" />
            <feFuncB type="linear" slope="1.8" intercept="-0.4" />
          </feComponentTransfer>
        </filter>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>

      {/* Atmosphere — full-bleed, or a contained square on a flat frame */}
      {g.mode === "full" ? (
        <rect x={0} y={0} width={W} height={H} fill={`url(#${gradId})`} />
      ) : (
        (() => {
          const side = Math.round(U * 0.74);
          return (
            <>
              <rect x={0} y={0} width={W} height={H} fill={g.frame} />
              <rect
                x={Math.round((W - side) / 2)}
                y={Math.round(H * 0.44 - side / 2)}
                width={side}
                height={side}
                fill={`url(#${gradId})`}
              />
            </>
          );
        })()
      )}

      <CircleMotif
        kind={motif.kind}
        cx={mCx}
        cy={mCy}
        r={mR}
        gradient={g}
        uid={uid}
        shadowX={motif.shadowX}
        shadowY={motif.shadowY}
        limbSize={motif.limbSize}
        glowArea={motif.glowArea}
      />

      {audio && motif.kind !== "none" && (
        <AudioCorona
          cx={mCx}
          cy={mCy}
          r={mR}
          signature={audio.signature}
          rayCount={audio.rayCount}
          rayMax={mR * audio.rayLen}
          color={audio.highContrast ? "#ffffff" : coronaWarm}
          roundTips={audio.roundTips}
        />
      )}

      <GeoLayer
        fit={fit}
        path={model.eclipse.path}
        limits={model.eclipse.limits}
        band={model.eclipse.band}
        mode={variant.pathStyle}
        bandFill={variant.umbraFill}
        bandStroke={variant.umbraStroke}
        baseMap={variant.baseMap}
        location={{ ...model.location, name: model.markerText || model.location.name }}
        clipId={clipId}
        style={{
          land: "rgba(255,255,255,0.06)",
          coastline: "rgba(255,255,255,0.30)",
          coastlineWidth: 0.7,
          centerline: "#ffffff",
          centerlineWidth: 1.4,
          marker: "#ff5c02",
          markerLabel: "rgba(255,255,255,0.92)",
          labelFamily: MONO,
        }}
      />

      {/* Grain */}
      {(variant.grainOn ?? true) && (
        <>
          <rect x={0} y={0} width={W} height={H} filter={`url(#${grainId})`} opacity={variant.grainIntensity} style={{ mixBlendMode: "overlay" }} />
          <rect x={0} y={0} width={W} height={H} filter={`url(#${grainId})`} opacity={variant.grainIntensity * 0.6} style={{ mixBlendMode: "soft-light" }} />
        </>
      )}

      {/* ── Headline ─────────────────────────────────────────── */}
      {hl.axis === "vertical" ? (
        <text transform={vTransform} fill={vColor} fontFamily={aspFamily} fontWeight={aspWeight} fontStyle={aspStyle} fontSize={aspSizeV} letterSpacing={aspLS}>
          {vText}
        </text>
      ) : (
        <text fill={headlineColor} textAnchor={aspAnchor} fontFamily={aspFamily} fontWeight={aspWeight} fontStyle={aspStyle} fontSize={aspSize} letterSpacing={aspLS}>
          {aspLines.map((ln, i) => (
            <tspan key={i} x={aspX} y={aspTop + i * aspLineH}>
              {ln}
            </tspan>
          ))}
        </text>
      )}

      {/* ── Metadata ─────────────────────────────────────────── */}
      {L.meta.style === "spine" ? (
        <text
          transform={mLeft ? `translate(${M + 3}, ${H - M}) rotate(-90)` : `translate(${W - M - 3}, ${M}) rotate(90)`}
          fill={metaColor}
          opacity={0.72}
          fontFamily={MONO}
          fontSize={8}
          letterSpacing={1.5}
        >
          {rows.map((r) => `${r.label} ${r.value}`).join("     ·     ")}
        </text>
      ) : (
        rows.map((r, i) => {
          const y = metaStartY + i * rowH;
          return (
            <g key={r.label}>
              <text x={metaTextX} y={y} textAnchor={metaAnchor} fill={metaColor} opacity={0.5} fontFamily={MONO} fontSize={6.5} letterSpacing={1}>
                {r.label}
              </text>
              <text x={metaTextX} y={y + 9.5} textAnchor={metaAnchor} fill={metaColor} opacity={0.85} fontFamily={MONO} fontSize={9} letterSpacing={0.3}>
                {r.value}
              </text>
            </g>
          );
        })
      )}

      {/* ── Eclipse App badge (+ optional Awe Co badge) ──────── */}
      {el.on && (
        <g>
          <EclipseBadge x={elX} y={elY} size={badgeS} fill={elColor} opacity={0.96} />
          {el.aweBadge && (
            <AweCoBadge x={elX + badgeS + badgeGap} y={elY} size={badgeS} fill={elColor} opacity={0.96} />
          )}
        </g>
      )}

      {/* ── Awe Co brand tag (text only) ─────────────────────── */}
      {aw.on && (
        <text x={tagX} y={tagY} textAnchor={tagAnchor} fill={awColor} opacity={0.82} fontFamily={MONO} fontSize={10.5} letterSpacing={2}>
          {TAGLINE}
        </text>
      )}
    </svg>
  );
}
