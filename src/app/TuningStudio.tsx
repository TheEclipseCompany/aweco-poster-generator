"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeCircumstances } from "@/lib/astronomy";
import { BASE_MAPS } from "@/lib/coastline";
import { ECLIPSES, type EclipseId } from "@/data/eclipses";
import { makeVariant, BLEND_MODES, DEFAULT_TUNE, type BlendMode, type TuneConfig, type Corner, type LayoutConfig } from "@/poster/variant";
import { RECIPES } from "@/poster/gradient";
import { ASPIRATIONS } from "@/data/copy";
import { randomSeed } from "@/lib/rng";
import { PosterSVG } from "@/poster/PosterSVG";
import { posterHref } from "@/lib/posterLink";
import type { PosterLocation, PosterModel } from "@/poster/types";

interface Props {
  eclipseId: EclipseId;
  location: PosterLocation;
  aspiration: string;
  baseSpanDeg: number;
}

const INITIAL_BATCH = Array.from({ length: 12 }, (_, i) => `BATCH-${i}`);
const MONO = "var(--font-geist-mono), monospace";

const lbl: React.CSSProperties = { fontFamily: MONO, fontSize: 10, color: "#8e8d8d", letterSpacing: 0.5 };
const val: React.CSSProperties = { fontFamily: MONO, fontSize: 10, color: "#e2e2e2", width: 34, textAlign: "right" };

function Range({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ ...lbl, width: 110 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
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

function Seg<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
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

const CORNERS: readonly Corner[] = ["tl", "tr", "bl", "br"];

export function TuningStudio({ eclipseId, location, aspiration, baseSpanDeg }: Props) {
  const [cfg, setCfg] = useState<TuneConfig>(DEFAULT_TUNE);
  const [batch, setBatch] = useState<string[]>(INITIAL_BATCH);
  const [headline, setHeadline] = useState<string>(aspiration);

  const circumstances = useMemo(
    () => computeCircumstances(ECLIPSES[eclipseId].date, location.lat, location.lon),
    [eclipseId, location],
  );
  const base: Omit<PosterModel, "ratio"> = {
    eclipse: ECLIPSES[eclipseId], location, circumstances, aspiration: headline,
  };
  const variants = useMemo(
    () => batch.map((s) => makeVariant(s, baseSpanDeg, cfg)),
    [batch, baseSpanDeg, cfg],
  );

  const setRing = (patch: Partial<TuneConfig["ring"]>) =>
    setCfg((c) => ({ ...c, ring: { ...c.ring, ...patch } }));
  const ringPair = (key: "scale" | "x" | "y", idx: 0 | 1, n: number) =>
    setCfg((c) => { const v = [...c.ring[key]] as [number, number]; v[idx] = n; return { ...c, ring: { ...c.ring, [key]: v } }; });
  const L = cfg.layout;
  const setHeadline2 = (patch: Partial<LayoutConfig["headline"]>) =>
    setCfg((c) => ({ ...c, layout: { ...c.layout, headline: { ...c.layout.headline, ...patch } } }));
  const setMeta = (patch: Partial<LayoutConfig["meta"]>) =>
    setCfg((c) => ({ ...c, layout: { ...c.layout, meta: { ...c.layout.meta, ...patch } } }));
  const setEcl = (patch: Partial<LayoutConfig["eclipseLogo"]>) =>
    setCfg((c) => ({ ...c, layout: { ...c.layout, eclipseLogo: { ...c.layout.eclipseLogo, ...patch } } }));
  const setAwe = (patch: Partial<LayoutConfig["awe"]>) =>
    setCfg((c) => ({ ...c, layout: { ...c.layout, awe: { ...c.layout.awe, ...patch } } }));
  const pair = (key: "spanMul" | "grain" | "headlineScale", idx: 0 | 1, n: number) =>
    setCfg((c) => { const v = [...c[key]] as [number, number]; v[idx] = n; return { ...c, [key]: v }; });
  const setFill = (patch: Partial<TuneConfig["umbraFill"]>) =>
    setCfg((c) => ({ ...c, umbraFill: { ...c.umbraFill, ...patch } }));

  const panel: React.CSSProperties = {
    background: "#15171c", border: "1px solid #2a2d33", borderRadius: 4, padding: 14, minWidth: 290,
  };
  const h: React.CSSProperties = { ...lbl, color: "#cfcad6", fontSize: 11, letterSpacing: 1.5, margin: "0 0 8px" };

  return (
    <div style={{ display: "flex", gap: 28, alignItems: "stretch", flex: 1, minHeight: 0 }}>
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", minHeight: 0, paddingRight: 10 }}>
        <div style={panel}>
          <p style={h}>HEADLINE</p>
          <textarea
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder="Type a headline — press Enter for a line break"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: "#e2e2e2", background: "#0e1216", border: "1px solid #2a2d33", borderRadius: 2, padding: "8px 10px", resize: "vertical" }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
            {ASPIRATIONS.map((a) => (
              <button
                key={a}
                onClick={() => setHeadline(a)}
                title={a}
                style={{ fontFamily: MONO, fontSize: 9, color: "#8e8d8d", background: "transparent", border: "1px solid #2a2d33", borderRadius: 2, padding: "3px 6px", cursor: "pointer" }}
              >
                {a.length > 16 ? a.slice(0, 15) + "…" : a}
              </button>
            ))}
          </div>
        </div>

        <div style={panel}>
          <p style={h}>ECLIPSE RING</p>
          <Check on={cfg.ring.on} label="ring on" onToggle={() => setRing({ on: !cfg.ring.on })} />
          <div style={{ marginTop: 10 }}>
            <Range label="scale min" min={0.08} max={2} step={0.01} value={cfg.ring.scale[0]} onChange={(n) => ringPair("scale", 0, n)} />
            <Range label="scale max" min={0.08} max={2} step={0.01} value={cfg.ring.scale[1]} onChange={(n) => ringPair("scale", 1, n)} />
            <Range label="pos x min" min={0} max={1} step={0.01} value={cfg.ring.x[0]} onChange={(n) => ringPair("x", 0, n)} />
            <Range label="pos x max" min={0} max={1} step={0.01} value={cfg.ring.x[1]} onChange={(n) => ringPair("x", 1, n)} />
            <Range label="pos y min" min={0} max={1} step={0.01} value={cfg.ring.y[0]} onChange={(n) => ringPair("y", 0, n)} />
            <Range label="pos y max" min={0} max={1} step={0.01} value={cfg.ring.y[1]} onChange={(n) => ringPair("y", 1, n)} />
          </div>
          <p style={{ ...lbl, color: "#8e8d8d", fontSize: 9, letterSpacing: 1.5, margin: "12px 0 6px", borderTop: "1px solid #2a2d33", paddingTop: 9 }}>
            SUN SETTINGS
          </p>
          <Range label="shadow x" min={-1} max={1} step={0.05} value={cfg.ring.shadowX} onChange={(n) => setRing({ shadowX: n })} />
          <Range label="shadow y" min={-1} max={1} step={0.05} value={cfg.ring.shadowY} onChange={(n) => setRing({ shadowY: n })} />
          <Range label="limb size" min={0.5} max={3} step={0.05} value={cfg.ring.limbSize} onChange={(n) => setRing({ limbSize: n })} />
          <Range label="glow area" min={0} max={1} step={0.02} value={cfg.ring.glowArea} onChange={(n) => setRing({ glowArea: n })} />
        </div>

        <div style={panel}>
          <p style={h}>GRADIENT</p>
          <Range label="contained %" min={0} max={0.8} step={0.02} value={cfg.containedProb} onChange={(n) => setCfg((c) => ({ ...c, containedProb: n }))} />
          <div style={{ marginTop: 8 }}>
            {RECIPES.map((r, i) => (
              <Check key={r.name} on={cfg.recipes[i]} label={r.name}
                onToggle={() => setCfg((c) => { const v = [...c.recipes]; v[i] = !v[i]; return { ...c, recipes: v }; })} />
            ))}
          </div>
        </div>

        <div style={panel}>
          <p style={h}>MAP · PATH · CROP · TYPE · GRAIN</p>
          <div style={{ marginBottom: 6 }}>
            {BASE_MAPS.map((m, i) => (
              <Check key={m} on={cfg.baseMaps[i]} label={m}
                onToggle={() => setCfg((c) => { const v = [...c.baseMaps]; v[i] = !v[i]; return { ...c, baseMaps: v }; })} />
            ))}
          </div>
          <Range label="umbra %" min={0} max={1} step={0.02} value={cfg.umbraProb} onChange={(n) => setCfg((c) => ({ ...c, umbraProb: n }))} />
          {cfg.umbraProb > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Check on={cfg.umbraStroke} label="stroke" onToggle={() => setCfg((c) => ({ ...c, umbraStroke: !c.umbraStroke }))} />
                <Check on={cfg.umbraFill.on} label="fill" onToggle={() => setFill({ on: !cfg.umbraFill.on })} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, opacity: cfg.umbraFill.on ? 1 : 0.4, pointerEvents: cfg.umbraFill.on ? "auto" : "none" }}>
                  <input type="color" value={cfg.umbraFill.color} onChange={(e) => setFill({ color: e.target.value })} style={{ width: 30, height: 20, padding: 0, border: "1px solid #2a2d33", borderRadius: 2, background: "transparent", cursor: "pointer" }} />
                  <span style={{ ...lbl, fontSize: 9 }}>{cfg.umbraFill.color}</span>
                </div>
              </div>
              <div style={{ marginBottom: 6, opacity: cfg.umbraFill.on ? 1 : 0.4, pointerEvents: cfg.umbraFill.on ? "auto" : "none" }}>
                <Range label="fill opacity" min={0} max={1} step={0.01} value={cfg.umbraFill.opacity} onChange={(n) => setFill({ opacity: n })} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...lbl, width: 110 }}>blend</span>
                  <select
                    style={{ flex: 1, fontFamily: MONO, fontSize: 10, color: "#e2e2e2", background: "#0e1216", border: "1px solid #2a2d33", borderRadius: 2, padding: "4px 6px" }}
                    value={cfg.umbraFill.blend ?? "normal"}
                    onChange={(e) => setFill({ blend: e.target.value as BlendMode })}
                  >
                    {BLEND_MODES.map((b) => (
                      <option key={b} value={b} style={{ color: "#000" }}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
          <Range label="zoom min" min={0.5} max={2} step={0.05} value={cfg.spanMul[0]} onChange={(n) => pair("spanMul", 0, n)} />
          <Range label="zoom max" min={0.5} max={2} step={0.05} value={cfg.spanMul[1]} onChange={(n) => pair("spanMul", 1, n)} />
          <Range label="pan" min={0} max={0.35} step={0.01} value={cfg.panFrac} onChange={(n) => setCfg((c) => ({ ...c, panFrac: n }))} />
          <Range label="headline min" min={0.6} max={1.6} step={0.02} value={cfg.headlineScale[0]} onChange={(n) => pair("headlineScale", 0, n)} />
          <Range label="headline max" min={0.6} max={1.6} step={0.02} value={cfg.headlineScale[1]} onChange={(n) => pair("headlineScale", 1, n)} />
          <Range label="grain min" min={0.3} max={0.9} step={0.02} value={cfg.grain[0]} onChange={(n) => pair("grain", 0, n)} />
          <Range label="grain max" min={0.3} max={0.9} step={0.02} value={cfg.grain[1]} onChange={(n) => pair("grain", 1, n)} />
        </div>

        <div style={panel}>
          <p style={h}>HEADLINE LAYOUT</p>
          <Seg label="position" value={L.headline.vpos} options={["high", "low"] as const} onChange={(v) => setHeadline2({ vpos: v })} />
          <Seg label="" value={L.headline.hpos} options={["left", "center", "right"] as const} onChange={(v) => setHeadline2({ hpos: v })} />
          <Seg label="axis" value={L.headline.axis} options={["horizontal", "vertical"] as const} onChange={(v) => setHeadline2({ axis: v })} />
          <Seg label="align" value={L.headline.align} options={["left", "center", "right"] as const} onChange={(v) => setHeadline2({ align: v })} />
          <div style={{ marginTop: 8 }}>
            <Check on={L.headline.editorial} label="editorial italic" onToggle={() => setHeadline2({ editorial: !L.headline.editorial })} />
          </div>
        </div>

        <div style={panel}>
          <p style={h}>METADATA</p>
          <Seg label="corner" value={L.meta.corner} options={CORNERS} onChange={(v) => setMeta({ corner: v })} />
          <Seg label="style" value={L.meta.style} options={["stack", "spine"] as const} onChange={(v) => setMeta({ style: v })} />
        </div>

        <div style={panel}>
          <p style={h}>ECLIPSE APP BADGE</p>
          <div style={{ marginBottom: 8 }}>
            <Check on={L.eclipseLogo.on} label="badge on" onToggle={() => setEcl({ on: !L.eclipseLogo.on })} />
            <Check on={L.eclipseLogo.aweBadge} label="awe co badge" onToggle={() => setEcl({ aweBadge: !L.eclipseLogo.aweBadge })} />
          </div>
          <Seg label="corner" value={L.eclipseLogo.corner} options={CORNERS} onChange={(v) => setEcl({ corner: v })} />
        </div>

        <div style={panel}>
          <p style={h}>AWE CO BRAND TAG</p>
          <div style={{ marginBottom: 8 }}>
            <Check on={L.awe.on} label="tag on" onToggle={() => setAwe({ on: !L.awe.on })} />
          </div>
          <Seg label="corner" value={L.awe.corner} options={CORNERS} onChange={(v) => setAwe({ corner: v })} />
        </div>

        <button onClick={() => setBatch(Array.from({ length: 12 }, randomSeed))}
          style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 1, padding: "10px 16px", background: "#fff", color: "#0e1216", border: "none", borderRadius: 2, cursor: "pointer" }}>
          RE-ROLL BATCH ↻
        </button>
        <button onClick={() => setCfg(DEFAULT_TUNE)}
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, padding: "8px 16px", background: "transparent", color: "#8e8d8d", border: "1px solid #2a2d33", borderRadius: 2, cursor: "pointer" }}>
          RESET CONFIG
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          {variants.map((v, i) => (
            <Link
              key={i}
              href={posterHref({ seed: batch[i], eclipseId, location, headline, ratio: "3:4", variant: v })}
              prefetch={false}
              style={{ display: "block", textDecoration: "none", cursor: "pointer" }}
              title="Open this poster in the single-poster studio"
            >
              <PosterSVG model={{ ...base, ratio: "3:4" }} variant={v} />
              <p style={{ ...lbl, padding: "4px 0", fontSize: 8.5 }}>
                {v.gradient.mode === "contained" ? "▣" : "▒"} {v.motif.kind} · edit ↗
              </p>
            </Link>
          ))}
        </div>
        <pre style={{ ...lbl, fontSize: 9, color: "#6a6a6a", marginTop: 16, whiteSpace: "pre-wrap", maxWidth: "100%" }}>
          {JSON.stringify(cfg)}
        </pre>
      </div>
    </div>
  );
}
