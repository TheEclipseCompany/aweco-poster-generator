"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeCircumstances } from "@/lib/astronomy";
import { ECLIPSES, ECLIPSE_LIST, type EclipseId } from "@/data/eclipses";
import { getTimeZoneIdForLocation } from "@/lib/timezone";
import { ASPIRATIONS } from "@/data/copy";
import { makeVariant, BLEND_MODES, DEFAULT_TUNE, DEFAULT_UMBRA_FILL, type BlendMode, type PosterVariant, type Corner, type LayoutConfig, type UmbraFill } from "@/poster/variant";
import { makeGradient, RECIPES, type GradientSpec } from "@/poster/gradient";
import { makeRng, randomSeed } from "@/lib/rng";
import { PosterSVG } from "@/poster/PosterSVG";
import { TicketSVG } from "@/poster/TicketSVG";
import { StampSVG } from "@/poster/StampSVG";
import { FRAME, type MarkerAnchor, type PosterLocation, type Ratio } from "@/poster/types";
import { BASE_MAPS } from "@/lib/coastline";
import { decodePoster, defaultPayload, imagerHref, posterHref, posterRawHref } from "@/lib/posterLink";
import { DEFAULT_LOCALE, locales } from "@/i18n/locales";
import { loadSignatureFile, type AudioSignature } from "@/lib/audioSignature";

const MONO = "var(--font-geist-mono), monospace";
const RATIOS: Ratio[] = ["3:4", "din-a", "9:16", "1:1", "ticket", "stamp"];
const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];
const ANCHORS: readonly MarkerAnchor[] = ["e", "w", "n", "s", "ne", "nw", "se", "sw"];
const PREVIEW_H = 760;

const lbl: React.CSSProperties = { fontFamily: MONO, fontSize: 10, color: "#8e8d8d", letterSpacing: 0.5 };
const val: React.CSSProperties = { fontFamily: MONO, fontSize: 10, color: "#e2e2e2", width: 38, textAlign: "right" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 12, color: "#e2e2e2", background: "#0e1216", border: "1px solid #2a2d33", borderRadius: 2, padding: "8px 10px" };

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ ...lbl, width: 96 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={val}>{value.toFixed(2)}</span>
    </div>
  );
}

function Check({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 12, ...lbl, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      {label}
    </label>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ ...lbl, width: 64 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} style={{
            fontFamily: MONO, fontSize: 9.5, padding: "4px 7px", cursor: "pointer", borderRadius: 2,
            border: "1px solid", borderColor: value === o ? "#e2e2e2" : "#2a2d33",
            background: value === o ? "#e2e2e2" : "transparent", color: value === o ? "#0e1216" : "#8e8d8d",
          }}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Which recipe produced a gradient (matched by its dark+light endpoints). */
function recipeIndexOf(g: GradientSpec): number {
  const i = RECIPES.findIndex(
    (r) => r.colors[0] === g.darkColor && r.colors[r.colors.length - 1] === g.lightColor,
  );
  return i < 0 ? 0 : i;
}

export function PosterStudio({ encoded }: { encoded?: string | null }) {
  const init = useMemo(() => decodePoster(encoded) ?? defaultPayload(), [encoded]);

  const [eclipseId, setEclipseId] = useState<EclipseId>(init.eclipseId);
  const [location, setLocation] = useState<PosterLocation>(init.location);
  const [mLat, setMLat] = useState(String(init.location.lat));
  const [mLon, setMLon] = useState(String(init.location.lon));
  const [tzBusy, setTzBusy] = useState(false);
  const [headline, setHeadline] = useState(init.headline);
  const [markerText, setMarkerText] = useState(init.markerText ?? "");
  const [markerAnchor, setMarkerAnchor] = useState<MarkerAnchor>(init.markerAnchor ?? "e");
  const [ratio, setRatio] = useState<Ratio>(init.ratio);
  const [seed, setSeed] = useState(init.seed);
  const [variant, setVariant] = useState<PosterVariant>(init.variant);
  // Deployment origin for absolute links (imager) — set post-mount, empty in SSR.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const [locale, setLocale] = useState<string>(init.locale ?? DEFAULT_LOCALE);
  // Separate seed for gradient re-rolls so other dials stay untouched.
  const [gradSeed, setGradSeed] = useState(init.seed);

  // Audio corona (studio-only — not part of the seeded variant / share link).
  const [audioSig, setAudioSig] = useState<AudioSignature | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioErr, setAudioErr] = useState<string | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [rayCount, setRayCount] = useState(240);
  const [rayLen, setRayLen] = useState(0.7);
  const [roundTips, setRoundTips] = useState(false);
  const [hiContrast, setHiContrast] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onAudioFile = async (file: File | undefined) => {
    if (!file) return;
    setAudioBusy(true);
    setAudioErr(null);
    try {
      const sig = await loadSignatureFile(file);
      setAudioSig(sig);
      setAudioName(file.name);
      setAudioOn(true);
    } catch (e) {
      setAudioErr(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setAudioBusy(false);
    }
  };

  // Keep the address bar in sync with the poster on screen, so copying the
  // URL always shares exactly what you see. Debounced (sliders fire fast) and
  // via native replaceState — shallow, no server round-trip.
  useEffect(() => {
    const t = setTimeout(() => {
      window.history.replaceState(
        null,
        "",
        posterHref({ seed, eclipseId, location, headline, ratio, variant, markerText: markerText || undefined, markerAnchor, locale }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [seed, eclipseId, location, headline, ratio, variant, markerText, markerAnchor, locale]);

  const eclipse = ECLIPSES[eclipseId];
  const base = eclipse.baseSpanDeg;
  const circumstances = useMemo(
    () => computeCircumstances(eclipse.elementsKey, location.lat, location.lon),
    [eclipse.elementsKey, location.lat, location.lon],
  );

  const isTicket = ratio === "ticket";
  const isStamp = ratio === "stamp";
  const previewW = isTicket ? 560 : isStamp ? 300 : Math.round((PREVIEW_H * FRAME[ratio].w) / FRAME[ratio].h);
  // Cap the preview by the height the viewport leaves for the sticky pane
  // (top offset + ratio/link row), converted to a width via the frame aspect,
  // so the poster never pushes the row below the fold.
  const previewMaxW = `calc((100svh - 96px) * ${(FRAME[ratio].w / FRAME[ratio].h).toFixed(4)})`;
  const audio = audioSig && audioOn ? { signature: audioSig, rayCount, rayLen, roundTips, highContrast: hiContrast } : null;

  // ── variant helpers ─────────────────────────────────────────
  const m = variant.motif;
  const c = variant.crop;
  const setMotif = (patch: Partial<PosterVariant["motif"]>) =>
    setVariant((v) => ({ ...v, motif: { ...v.motif, ...patch } }));
  const setCrop = (patch: Partial<PosterVariant["crop"]>) =>
    setVariant((v) => ({ ...v, crop: { ...v.crop, ...patch } }));
  const setLayout = (patch: Partial<LayoutConfig>) =>
    setVariant((v) => ({ ...v, layout: { ...v.layout, ...patch } }));
  const setHl = (patch: Partial<LayoutConfig["headline"]>) =>
    setLayout({ headline: { ...variant.layout.headline, ...patch } });
  const setMeta = (patch: Partial<LayoutConfig["meta"]>) =>
    setLayout({ meta: { ...variant.layout.meta, ...patch } });
  const setEcl = (patch: Partial<LayoutConfig["eclipseLogo"]>) =>
    setLayout({ eclipseLogo: { ...variant.layout.eclipseLogo, ...patch } });
  const setAwe = (patch: Partial<LayoutConfig["awe"]>) =>
    setLayout({ awe: { ...variant.layout.awe, ...patch } });

  // Crop presented as zoom (× base span) + pan fractions of the span.
  const zoom = c.spanDeg / base;
  const panX = c.spanDeg ? c.offsetLon / c.spanDeg : 0;
  const panY = c.spanDeg ? c.offsetLat / c.spanDeg : 0;
  const setZoom = (z: number) => {
    const spanDeg = base * z;
    setCrop({ spanDeg, offsetLon: panX * spanDeg, offsetLat: panY * spanDeg });
  };

  const ringOn = m.kind === "ring";
  const toggleRing = () =>
    setMotif(ringOn ? { kind: "none" } : { kind: "ring", scale: m.scale || 0.35 });

  const uf = variant.umbraFill ?? DEFAULT_UMBRA_FILL;
  const setUmbraFill = (patch: Partial<UmbraFill>) =>
    setVariant((v) => ({ ...v, umbraFill: { ...(v.umbraFill ?? DEFAULT_UMBRA_FILL), ...patch } }));

  // Gradient is regenerated from a recipe + contained flag + its own seed.
  const recipeIdx = recipeIndexOf(variant.gradient);
  const contained = variant.gradient.mode === "contained";
  const regenGradient = (idx: number, isContained: boolean, gs: string) =>
    setVariant((v) => ({
      ...v,
      // Re-rolls swap the gradient wholesale; the authored field size rides along.
      gradient: {
        ...makeGradient(makeRng(gs), { recipes: [RECIPES[idx]], containedProb: isContained ? 1 : 0 }),
        containedScale: v.gradient.containedScale,
      },
    }));

  const chooseEclipse = (id: EclipseId) => {
    setEclipseId(id);
    const d = ECLIPSES[id].defaultLocation;
    setLocation(d);
    setMLat(String(d.lat));
    setMLon(String(d.lon));
    // Reset the crop to the new eclipse's natural framing.
    setCrop({ spanDeg: ECLIPSES[id].baseSpanDeg, offsetLat: 0, offsetLon: 0 });
  };
  // Apply typed coordinates: resolve the timezone offline (point-in-polygon
  // over the bundled world tz set, same approach as the-eclipse-app-web),
  // then feed the eclipse calculation.
  const applyCoords = async () => {
    const lat = parseFloat(mLat);
    const lon = parseFloat(mLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setTzBusy(true);
    try {
      const tz = (await getTimeZoneIdForLocation({ latitude: lat, longitude: lon })) ?? "UTC";
      setLocation((l) => ({ ...l, lat, lon, tz }));
    } finally {
      setTzBusy(false);
    }
  };
  const regenerateAll = () => {
    const s = randomSeed();
    setSeed(s);
    setGradSeed(s);
    // Everything re-rolls — including path treatment and base map — but the
    // authored umbra styling (wash colour/opacity/blend, stroke) rides along
    // as the look applied whenever a roll lands on umbra.
    setVariant((v) =>
      makeVariant(s, base, {
        ...DEFAULT_TUNE,
        umbraFill: v.umbraFill ?? DEFAULT_TUNE.umbraFill,
        umbraStroke: v.umbraStroke ?? DEFAULT_TUNE.umbraStroke,
      }),
    );
  };

  const panel: React.CSSProperties = { background: "#15171c", border: "1px solid #2a2d33", borderRadius: 4, padding: 14 };
  const h: React.CSSProperties = { ...lbl, color: "#cfcad6", fontSize: 11, letterSpacing: 1.5, margin: "0 0 8px" };

  const payload = { seed, eclipseId, location, headline, ratio, variant, markerText: markerText || undefined, markerAnchor, locale };
  const headerLink: React.CSSProperties = { ...lbl, color: "#8e8d8d", textDecoration: "none" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 18 }}>
        <Link href="/tune" style={headerLink}>← BATCH</Link>
        <span style={{ ...lbl, color: "#cfcad6", fontSize: 12, letterSpacing: 1.5 }}>SINGLE POSTER — {seed}</span>
      </div>

      <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={panel}>
            <p style={h}>ECLIPSE · LOCATION</p>
            <select style={input} value={eclipseId} onChange={(e) => chooseEclipse(e.target.value as EclipseId)}>
              {ECLIPSE_LIST.map((e) => (
                <option key={e.id} value={e.id} style={{ color: "#000" }}>{e.name}</option>
              ))}
            </select>
            <div style={{ marginTop: 8 }}>
              <span style={{ ...lbl, display: "block", marginBottom: 3 }}>location name (as displayed, localized)</span>
              <input
                style={input}
                value={location.name}
                onChange={(e) => setLocation((l) => ({ ...l, name: e.target.value, admin: undefined }))}
                spellCheck={false}
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input style={{ ...input, flex: 1, fontSize: 11 }} placeholder="lat" value={mLat} onChange={(e) => setMLat(e.target.value)} inputMode="decimal" />
              <input style={{ ...input, flex: 1, fontSize: 11 }} placeholder="long" value={mLon} onChange={(e) => setMLon(e.target.value)} inputMode="decimal" />
              <button onClick={applyCoords} disabled={tzBusy} style={{ fontFamily: MONO, fontSize: 11, color: "#0e1216", background: "#e2e2e2", border: "none", borderRadius: 2, padding: "0 12px", cursor: tzBusy ? "wait" : "pointer" }}>
                {tzBusy ? "…" : "SET"}
              </button>
            </div>
            <p style={{ ...lbl, margin: "6px 0 0" }}>tz {location.tz}</p>
            <div style={{ marginTop: 6 }}>
              <span style={{ ...lbl, display: "block", marginBottom: 3 }}>marker label</span>
              <input
                style={{ ...input, fontSize: 11 }}
                value={markerText}
                placeholder={location.name}
                onChange={(e) => setMarkerText(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div style={{ marginTop: 6 }}>
              <Seg label="label at" value={markerAnchor} options={ANCHORS} onChange={setMarkerAnchor} />
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ ...lbl, display: "block", marginBottom: 3 }}>language</span>
              <select style={{ ...input, fontSize: 11 }} value={locale} onChange={(e) => setLocale(e.target.value)}>
                {Object.entries(locales).map(([code, name]) => (
                  <option key={code} value={code} style={{ color: "#000" }}>{name}</option>
                ))}
              </select>
            </div>
            {!circumstances.visible && (
              <p style={{ fontFamily: MONO, fontSize: 10, color: "#d8915a", margin: "8px 0 0" }}>Not on the path of totality from here.</p>
            )}
          </div>

          {/* Headline copy is irrelevant to the ticket / stamp layouts. */}
          {!isTicket && !isStamp && (
            <div style={panel}>
              <p style={h}>HEADLINE</p>
              <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={2} spellCheck={false} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                {ASPIRATIONS.map((a) => (
                  <button key={a} onClick={() => setHeadline(a)} title={a} style={{ fontFamily: MONO, fontSize: 9, color: "#8e8d8d", background: "transparent", border: "1px solid #2a2d33", borderRadius: 2, padding: "3px 6px", cursor: "pointer" }}>
                    {a.length > 16 ? a.slice(0, 15) + "…" : a}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Range label="size" min={0.6} max={1.6} step={0.01} value={variant.headlineScale} onChange={(n) => setVariant((v) => ({ ...v, headlineScale: n }))} />
              </div>
            </div>
          )}

          <div style={panel}>
            <p style={h}>ECLIPSE RING</p>
            <Check on={ringOn} label="ring on" onToggle={toggleRing} />
            <div style={{ marginTop: 10, opacity: ringOn ? 1 : 0.4, pointerEvents: ringOn ? "auto" : "none" }}>
              <Range label="scale" min={0.08} max={2} step={0.01} value={m.scale} onChange={(n) => setMotif({ scale: n })} />
              <Range label="position x" min={0} max={1} step={0.01} value={m.cxFrac} onChange={(n) => setMotif({ cxFrac: n })} />
              <Range label="position y" min={0} max={1} step={0.01} value={m.cyFrac} onChange={(n) => setMotif({ cyFrac: n })} />
              <p style={{ ...lbl, fontSize: 9, letterSpacing: 1.5, margin: "12px 0 6px", borderTop: "1px solid #2a2d33", paddingTop: 9 }}>SUN SETTINGS</p>
              <Range label="shadow x" min={-1} max={1} step={0.05} value={m.shadowX ?? 0} onChange={(n) => setMotif({ shadowX: n })} />
              <Range label="shadow y" min={-1} max={1} step={0.05} value={m.shadowY ?? 0} onChange={(n) => setMotif({ shadowY: n })} />
              <Range label="limb size" min={0.5} max={3} step={0.05} value={m.limbSize ?? 1.6} onChange={(n) => setMotif({ limbSize: n })} />
              <Range label="glow area" min={0} max={1} step={0.02} value={m.glowArea ?? 0.6} onChange={(n) => setMotif({ glowArea: n })} />
            </div>

            {!isTicket && !isStamp && (
              <>
                <p style={{ ...lbl, fontSize: 9, letterSpacing: 1.5, margin: "14px 0 8px", borderTop: "1px solid #2a2d33", paddingTop: 10 }}>
                  AUDIO CORONA
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json,audio/*"
                  style={{ display: "none" }}
                  onChange={(e) => onAudioFile(e.target.files?.[0])}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{ fontFamily: MONO, fontSize: 10, color: "#0e1216", background: "#e2e2e2", border: "none", borderRadius: 2, padding: "6px 10px", cursor: "pointer" }}
                  >
                    {audioBusy ? "reading…" : audioSig ? "replace audio ↑" : "upload audio / .json ↑"}
                  </button>
                  {audioSig && <Check on={audioOn} label="show" onToggle={() => setAudioOn((v) => !v)} />}
                </div>
                {audioName && !audioErr && (
                  <p style={{ ...lbl, fontSize: 9, color: "#8e8d8d", margin: "6px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ▸ {audioName}
                  </p>
                )}
                {audioErr && (
                  <p style={{ fontFamily: MONO, fontSize: 9.5, color: "#d8915a", margin: "6px 0 0" }}>{audioErr}</p>
                )}
                {audioSig && (
                  <div style={{ marginTop: 10, opacity: audioOn ? 1 : 0.4, pointerEvents: audioOn ? "auto" : "none" }}>
                    <Range label="rays" min={120} max={360} step={4} value={rayCount} onChange={setRayCount} />
                    <Range label="spike len" min={0.2} max={1.4} step={0.02} value={rayLen} onChange={setRayLen} />
                    <div style={{ marginTop: 6 }}>
                      <Check on={roundTips} label="rounded tips" onToggle={() => setRoundTips((v) => !v)} />
                      <Check on={hiContrast} label="high contrast" onToggle={() => setHiContrast((v) => !v)} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={panel}>
            <p style={h}>GRADIENT</p>
            <Seg label="recipe" value={RECIPES[recipeIdx].name} options={RECIPES.map((r) => r.name)} onChange={(name) => regenGradient(RECIPES.findIndex((r) => r.name === name), contained, gradSeed)} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              {!isTicket && <Check on={contained} label="contained" onToggle={() => regenGradient(recipeIdx, !contained, gradSeed)} />}
              <button onClick={() => { const gs = randomSeed(); setGradSeed(gs); regenGradient(recipeIdx, contained, gs); }} style={{ fontFamily: MONO, fontSize: 9.5, color: "#8e8d8d", background: "transparent", border: "1px solid #2a2d33", borderRadius: 2, padding: "4px 8px", cursor: "pointer" }}>re-roll ↻</button>
            </div>
            {contained && !isTicket && (
              <div style={{ marginTop: 8 }}>
                <Range label="field size" min={0.3} max={1} step={0.01} value={variant.gradient.containedScale ?? 0.74} onChange={(n) => setVariant((v) => ({ ...v, gradient: { ...v.gradient, containedScale: n } }))} />
              </div>
            )}
            {isTicket && (
              <div style={{ marginTop: 8 }}>
                <Seg label="direction" value={variant.gradientDir ?? "bottom"} options={["bottom", "top", "left", "right"] as const} onChange={(d) => setVariant((v) => ({ ...v, gradientDir: d }))} />
              </div>
            )}
          </div>

          <div style={panel}>
            <p style={h}>MAP · PATH · CROP · GRAIN</p>
            <Seg label="map" value={variant.baseMap ?? "land-110m"} options={BASE_MAPS} onChange={(v) => setVariant((x) => ({ ...x, baseMap: v }))} />
            <Seg label="path" value={variant.pathStyle ?? "centerline"} options={["centerline", "umbra"] as const} onChange={(v) => setVariant((x) => ({ ...x, pathStyle: v }))} />
            {(variant.pathStyle ?? "centerline") === "umbra" && !eclipse.limits && (
              <p style={{ fontFamily: MONO, fontSize: 9.5, color: "#d8915a", margin: "0 0 6px" }}>No umbra outline for this eclipse — drawing the centerline.</p>
            )}
            {(variant.pathStyle ?? "centerline") === "umbra" && eclipse.limits && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Check on={variant.umbraStroke ?? true} label="stroke" onToggle={() => setVariant((v) => ({ ...v, umbraStroke: !(v.umbraStroke ?? true) }))} />
                  <Check on={uf.on} label="fill" onToggle={() => setUmbraFill({ on: !uf.on })} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, opacity: uf.on ? 1 : 0.4, pointerEvents: uf.on ? "auto" : "none" }}>
                    <input type="color" value={uf.color} onChange={(e) => setUmbraFill({ color: e.target.value })} style={{ width: 30, height: 20, padding: 0, border: "1px solid #2a2d33", borderRadius: 2, background: "transparent", cursor: "pointer" }} />
                    <span style={{ ...lbl, fontSize: 9 }}>{uf.color}</span>
                  </div>
                </div>
                <div style={{ marginBottom: 6, opacity: uf.on ? 1 : 0.4, pointerEvents: uf.on ? "auto" : "none" }}>
                  <Range label="fill opacity" min={0} max={1} step={0.01} value={uf.opacity} onChange={(n) => setUmbraFill({ opacity: n })} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...lbl, width: 96 }}>blend</span>
                    <select style={{ ...input, flex: 1, fontSize: 10, padding: "4px 6px" }} value={uf.blend ?? "normal"} onChange={(e) => setUmbraFill({ blend: e.target.value as BlendMode })}>
                      {BLEND_MODES.map((b) => (
                        <option key={b} value={b} style={{ color: "#000" }}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
            <Range label="zoom" min={0.5} max={2} step={0.01} value={zoom} onChange={setZoom} />
            <Range label="pan x" min={-0.35} max={0.35} step={0.01} value={panX} onChange={(n) => setCrop({ offsetLon: n * c.spanDeg })} />
            <Range label="pan y" min={-0.35} max={0.35} step={0.01} value={panY} onChange={(n) => setCrop({ offsetLat: n * c.spanDeg })} />
            <Range label="grain" min={0.3} max={0.9} step={0.01} value={variant.grainIntensity} onChange={(n) => setVariant((v) => ({ ...v, grainIntensity: n }))} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={{ ...lbl, width: 96 }}>grain field</span>
              <Check on={variant.grainOn ?? true} label="on" onToggle={() => setVariant((v) => ({ ...v, grainOn: !(v.grainOn ?? true) }))} />
              <button onClick={() => setVariant((v) => ({ ...v, grainSeed: ((v.grainSeed + 7) % 97) + 1 }))} style={{ fontFamily: MONO, fontSize: 9.5, color: "#8e8d8d", background: "transparent", border: "1px solid #2a2d33", borderRadius: 2, padding: "4px 8px", cursor: "pointer" }}>re-roll ↻</button>
            </div>
          </div>

          {isTicket ? (
            <div style={panel}>
              <p style={h}>TYPOGRAPHY</p>
              <Check on={variant.layout.headline.editorial} label="editorial italic" onToggle={() => setHl({ editorial: !variant.layout.headline.editorial })} />
            </div>
          ) : isStamp ? null : (
            <div style={panel}>
              <p style={h}>HEADLINE LAYOUT</p>
              <Seg label="position" value={variant.layout.headline.vpos} options={["high", "low"] as const} onChange={(v) => setHl({ vpos: v })} />
              <Seg label="" value={variant.layout.headline.hpos} options={["left", "center", "right"] as const} onChange={(v) => setHl({ hpos: v })} />
              <Seg label="axis" value={variant.layout.headline.axis} options={["horizontal", "vertical"] as const} onChange={(v) => setHl({ axis: v })} />
              <Seg label="align" value={variant.layout.headline.align} options={["left", "center", "right"] as const} onChange={(v) => setHl({ align: v })} />
              <Check on={variant.layout.headline.editorial} label="editorial italic" onToggle={() => setHl({ editorial: !variant.layout.headline.editorial })} />
            </div>
          )}

          <div style={panel}>
            <p style={h}>METADATA</p>
            <Seg label="corner" value={variant.layout.meta.corner} options={CORNERS} onChange={(v) => setMeta({ corner: v })} />
            <Seg label="style" value={variant.layout.meta.style} options={["stack", "spine"] as const} onChange={(v) => setMeta({ style: v })} />
          </div>

          <div style={panel}>
            <p style={h}>ECLIPSE APP BADGE</p>
            <div style={{ marginBottom: 8 }}>
              <Check on={variant.layout.eclipseLogo.on} label="badge on" onToggle={() => setEcl({ on: !variant.layout.eclipseLogo.on })} />
              <Check on={variant.layout.eclipseLogo.aweBadge} label="awe co badge" onToggle={() => setEcl({ aweBadge: !variant.layout.eclipseLogo.aweBadge })} />
            </div>
            <Seg label="corner" value={variant.layout.eclipseLogo.corner} options={CORNERS} onChange={(v) => setEcl({ corner: v })} />
          </div>

          <div style={panel}>
            <p style={h}>AWE CO BRAND TAG</p>
            <div style={{ marginBottom: 8 }}>
              <Check on={variant.layout.awe.on} label="tag on" onToggle={() => setAwe({ on: !variant.layout.awe.on })} />
            </div>
            <Seg label="corner" value={variant.layout.awe.corner} options={CORNERS} onChange={(v) => setAwe({ corner: v })} />
          </div>

          <button onClick={regenerateAll} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, padding: "9px 16px", background: "transparent", color: "#8e8d8d", border: "1px solid #2a2d33", borderRadius: 2, cursor: "pointer" }}>
            REGENERATE FROM NEW SEED ↻
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0, position: "sticky", top: 16 }}>
          {/* Ratio switcher + export links live ABOVE the poster so they're
              always on screen — the poster below scales to the leftover
              viewport height and can never push them out of view. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
            {RATIOS.map((r) => (
              <button key={r} onClick={() => setRatio(r)} style={{ fontFamily: MONO, fontSize: 11, padding: "7px 12px", cursor: "pointer", borderRadius: 2, border: "1px solid", borderColor: ratio === r ? "#e2e2e2" : "#2a2d33", background: ratio === r ? "#e2e2e2" : "transparent", color: ratio === r ? "#0e1216" : "#8e8d8d" }}>
                {r}
              </button>
            ))}
            <a href={posterRawHref(payload)} target="_blank" rel="noreferrer" style={{ ...headerLink, marginLeft: "auto" }}>
              RAW ↗
            </a>
            {origin && (
              <a href={imagerHref(origin, payload)} target="_blank" rel="noreferrer" style={{ ...headerLink, marginLeft: 8 }}>
                IMAGER ↗
              </a>
            )}
          </div>
          <div style={{ width: previewW, maxWidth: `min(100%, ${previewMaxW})` }}>
            {isTicket ? (
              <TicketSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio, locale }} variant={variant} />
            ) : isStamp ? (
              <StampSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio, locale }} variant={variant} />
            ) : (
              <PosterSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio, markerText: markerText || undefined, markerAnchor, locale }} variant={variant} audio={audio} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
