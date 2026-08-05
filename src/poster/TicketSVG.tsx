/**
 * The "eclipse ticket" — a landscape boarding-pass-style stub generated for a
 * single location. The BACKGROUND is the real poster atmosphere (seeded
 * gradient + geography + eclipse-ring motif + grain) clipped to a notched
 * ticket outline; the ticket copy (where you are, local contact time, the
 * eclipse, your totality duration) and a tear-off admit-one stub sit on top.
 * Same {model, variant} signature as PosterSVG.
 */
import { useMemo } from "react";
import { fitProjection } from "@/lib/projection";
import { formatDuration, formatObscuration } from "@/lib/astronomy";
import { CircleMotif } from "@/poster/layers/CircleMotif";
import { GeoLayer } from "@/poster/layers/GeoLayer";
import { FRAME, type PosterModel } from "@/poster/types";
import type { PosterVariant } from "@/poster/variant";

const SANS = "var(--font-geist-sans), system-ui, -apple-system, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const EDITORIAL = "var(--font-editorial), Georgia, serif";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Deterministic admit-one code from the poster seed, e.g. "UMBRA-K9X2". */
function ticketCode(seed: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h ^ seed.charCodeAt(i), 16777619)) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = (Math.imul(h ^ (i + 1), 16777619)) >>> 0;
  }
  return `UMBRA-${out}`;
}

function fmtCoords(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${la}, ${lo}`;
}

function fmtTime12(d: Date | undefined, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(d);
}

/** Smoothstep easing, clamped to [0,1]. */
function smoothstep(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
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

/** Interpolated colour at position t (0..1) along a sorted dark→light ramp. */
function sampleRamp(stops: { offset: number; color: string }[], t: number): string {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < stops.length; i++) {
    if (tt <= stops[i].offset) {
      const span = stops[i].offset - stops[i - 1].offset || 1;
      return lerpHex(stops[i - 1].color, stops[i].color, (tt - stops[i - 1].offset) / span);
    }
  }
  return stops[stops.length - 1].color;
}

export function TicketSVG({
  model,
  variant,
}: {
  model: PosterModel;
  variant: PosterVariant;
}) {
  const { w: W, h: H } = FRAME.ticket;
  const U = Math.min(W, H);
  const uid = variant.seed.replace(/[^A-Za-z0-9]/g, "");
  const clipId = `ticket-clip-${uid}`;
  const gradId = `ticket-atmo-${uid}`;
  const grainId = `ticket-grain-${uid}`;
  const scrimId = `ticket-scrim-${uid}`;
  const { circumstances: c, location: loc, eclipse } = model;
  const g = variant.gradient;
  const motif = variant.motif;

  // Partial directional gradient: the recipe colours only occupy a band near
  // the chosen edge and fade to transparent over a near-black base, so most of
  // the ticket reads dark and the eclipse ring feels more dynamic.
  const COVERAGE = 0.66; // fraction of the axis the colour band spans
  const dir = variant.gradientDir ?? "bottom";
  const DIR_COORDS = {
    top: { x1: 0.5, y1: 1, x2: 0.5, y2: 0 },
    bottom: { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
    left: { x1: 1, y1: 0.5, x2: 0, y2: 0.5 },
    right: { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
  } as const;
  const dc = DIR_COORDS[dir];
  // offset 0 = far edge (transparent → base shows), offset 1 = emanating edge.
  // Resample the recipe into many smoothstep-eased stops so both the colour
  // ramp and the fade into the dark base are gradual (no banding / hard seams).
  const start = 1 - COVERAGE;
  const STEPS = 20;
  const dirStops = Array.from({ length: STEPS + 1 }, (_, i) => {
    const o = i / STEPS;
    return {
      offset: Number(o.toFixed(4)),
      color: sampleRamp(g.stops, smoothstep((o - start) / COVERAGE)),
      opacity: Number(smoothstep(o / start).toFixed(4)),
    };
  });

  const pad = 6;
  const left = pad;
  const right = W - pad;
  const top = pad;
  const bottom = H - pad;
  const cr = 44; // corner radius — modest rounding
  const notchR = 64; // large side cutouts
  const midY = H / 2;
  const tearX = Math.round(W * 0.74);

  // Single outline path: rounded rect with a concave notch on each side edge.
  const outline = [
    `M ${left + cr} ${top}`,
    `H ${right - cr}`,
    `A ${cr} ${cr} 0 0 1 ${right} ${top + cr}`,
    `V ${midY - notchR}`,
    `A ${notchR} ${notchR} 0 0 0 ${right} ${midY + notchR}`,
    `V ${bottom - cr}`,
    `A ${cr} ${cr} 0 0 1 ${right - cr} ${bottom}`,
    `H ${left + cr}`,
    `A ${cr} ${cr} 0 0 1 ${left} ${bottom - cr}`,
    `V ${midY + notchR}`,
    `A ${notchR} ${notchR} 0 0 0 ${left} ${midY - notchR}`,
    `V ${top + cr}`,
    `A ${cr} ${cr} 0 0 1 ${left + cr} ${top}`,
    "Z",
  ].join(" ");

  // Same projection the poster uses, so the geography matches the variant.
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

  // ── Copy ────────────────────────────────────────────────────
  const M = 52;
  const placeName = loc.admin ? `${loc.name}, ${loc.admin}` : loc.name;
  const coordLine = `${fmtCoords(loc.lat, loc.lon)}  ·  ${fmtTime12(c.totalBegin ?? c.peak, loc.tz)}`;
  const eclipseName = `${eclipse.date.slice(0, 4)} Total Solar Eclipse`;
  const inTot = c.inTotality;
  const big = inTot ? formatDuration(c.totalityDurationSec) : formatObscuration(c.obscuration);
  const bigLabel = inTot ? "of totality" : "coverage";
  const code = ticketCode(variant.seed);
  const stubCx = (tearX + W) / 2;
  const sub = "rgba(255,255,255,0.66)";
  // Editorial-italic is an opt-in aesthetic for the display type (name + duration).
  const editorial = variant.layout.headline.editorial;

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
          <path d={outline} />
        </clipPath>
        <linearGradient id={gradId} x1={dc.x1} y1={dc.y1} x2={dc.x2} y2={dc.y2}>
          {dirStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
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
        {/* Legibility veil: darkens only the top and bottom edges (behind the
            title and the big duration); the middle stays clear so a side
            gradient still reads. */}
        <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#090b0f" stopOpacity={0.55} />
          <stop offset="22%" stopColor="#090b0f" stopOpacity={0} />
          <stop offset="62%" stopColor="#090b0f" stopOpacity={0} />
          <stop offset="100%" stopColor="#090b0f" stopOpacity={0.8} />
        </linearGradient>
      </defs>

      {/* ── Dark base + partial poster gradient + ring, clipped to ticket ─ */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={W} height={H} fill="#0c0e12" />
        <rect x={0} y={0} width={W} height={H} fill={`url(#${gradId})`} />
        <CircleMotif
          kind={motif.kind}
          cx={motif.cxFrac * W}
          cy={motif.cyFrac * H}
          r={motif.scale * U}
          gradient={g}
          uid={uid}
          shadowX={motif.shadowX}
          shadowY={motif.shadowY}
          limbSize={motif.limbSize}
          glowArea={motif.glowArea}
        />
      </g>

      {/* Geography — same layer as the poster, clipped to the ticket. The
          location dot stays; its label is suppressed (the copy names it). */}
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

      {/* Grain + legibility veil */}
      <g clipPath={`url(#${clipId})`}>
        {(variant.grainOn ?? true) && (
          <rect x={0} y={0} width={W} height={H} filter={`url(#${grainId})`} opacity={variant.grainIntensity * 0.7} style={{ mixBlendMode: "overlay" }} />
        )}
        <rect x={0} y={0} width={W} height={H} fill={`url(#${scrimId})`} />
      </g>

      {/* Outline + perforated tear line */}
      <path d={outline} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.4} />
      <line x1={tearX} y1={top + 14} x2={tearX} y2={bottom - 14} stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} strokeDasharray="2 6" />

      {/* ── Main info (left of the tear) ─────────────────────── */}
      <text
        x={M}
        y={88}
        fontFamily={editorial ? EDITORIAL : SANS}
        fontSize={editorial ? 36 : 31}
        fontStyle={editorial ? "italic" : "normal"}
        fontWeight={editorial ? 400 : 600}
        fill="#ffffff"
        letterSpacing={editorial ? 0 : -0.2}
      >
        {placeName}
      </text>
      <text x={M} y={118} fontFamily={SANS} fontSize={14} fill={sub} letterSpacing={0.2}>
        {coordLine}
      </text>
      <text x={M} y={141} fontFamily={SANS} fontSize={14} fill={sub} letterSpacing={0.2}>
        {eclipseName}
      </text>

      <text x={M} y={H - 60} fontFamily={SANS} fill="#ffffff">
        <tspan
          fontFamily={editorial ? EDITORIAL : SANS}
          fontStyle={editorial ? "italic" : "normal"}
          fontSize={editorial ? 78 : 70}
          fontWeight={editorial ? 400 : 700}
          letterSpacing={editorial ? 0 : -2}
        >
          {big}
        </tspan>
        <tspan fontSize={24} fontWeight={400} fill="rgba(255,255,255,0.7)" dx={12}>{bigLabel}</tspan>
      </text>

      {/* ── Stub (right of the tear) ─────────────────────────── */}
      <text transform={`translate(${stubCx - 8} ${midY}) rotate(-90)`} textAnchor="middle" fontFamily={MONO} fontSize={29} fontWeight={700} fill="#ffffff" letterSpacing={1.5}>
        {code}
      </text>
      <text transform={`translate(${stubCx + 30} ${midY}) rotate(-90)`} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill="rgba(255,255,255,0.55)" letterSpacing={3}>
        ADMIT ONE: TOTALITY
      </text>
    </svg>
  );
}
