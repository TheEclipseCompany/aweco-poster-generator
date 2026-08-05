"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeCircumstances } from "@/lib/astronomy";
import { ECLIPSES, ECLIPSE_LIST, type EclipseId } from "@/data/eclipses";
import { searchCities, nearestCityTz, type City } from "@/lib/cities";
import { ASPIRATIONS } from "@/data/copy";
import { makeVariant } from "@/poster/variant";
import { randomSeed } from "@/lib/rng";
import { PosterSVG } from "@/poster/PosterSVG";
import { TicketSVG } from "@/poster/TicketSVG";
import { StampSVG } from "@/poster/StampSVG";
import { posterHref } from "@/lib/posterLink";
import { FRAME, type PosterLocation, type Ratio } from "@/poster/types";

const MONO = "var(--font-geist-mono), monospace";
const RATIOS: Ratio[] = ["3:4", "din-a", "9:16", "1:1", "ticket", "stamp"];
const PREVIEW_H = 620;

const label: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: "#8e8d8d", display: "block", margin: "0 0 6px" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontFamily: MONO, fontSize: 13, color: "#e2e2e2", background: "#15171c", border: "1px solid #2a2d33", borderRadius: 2, padding: "9px 11px" };

export function Generator() {
  const [eclipseId, setEclipseId] = useState<EclipseId>("2024-04-08");
  const [location, setLocation] = useState<PosterLocation>(ECLIPSES["2024-04-08"].defaultLocation);
  const [query, setQuery] = useState(ECLIPSES["2024-04-08"].defaultLocation.name);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [mLat, setMLat] = useState("");
  const [mLon, setMLon] = useState("");
  const [headline, setHeadline] = useState<string>(ASPIRATIONS[0]);
  const [ratio, setRatio] = useState<Ratio>("3:4");
  const [seed, setSeed] = useState("AWE-2024");

  const eclipse = ECLIPSES[eclipseId];
  const circumstances = useMemo(
    () => computeCircumstances(eclipse.date, location.lat, location.lon),
    [eclipse.date, location],
  );
  const variant = useMemo(() => makeVariant(seed, eclipse.baseSpanDeg), [seed, eclipse.baseSpanDeg]);
  const suggestions = useMemo(() => (open ? searchCities(query) : []), [open, query]);

  const chooseEclipse = (id: EclipseId) => {
    setEclipseId(id);
    const d = ECLIPSES[id].defaultLocation;
    setLocation(d);
    setQuery(d.name);
  };
  const pickCity = (c: City) => {
    setLocation({ name: c.name, admin: c.admin, lat: c.lat, lon: c.lon, tz: c.tz });
    setQuery(c.name);
    setOpen(false);
  };
  const applyManual = () => {
    const lat = parseFloat(mLat);
    const lon = parseFloat(mLon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setLocation({ name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, tz: nearestCityTz(lat, lon) });
    }
  };

  const isTicket = ratio === "ticket";
  const isStamp = ratio === "stamp";
  const previewW = isTicket ? 520 : isStamp ? 268 : Math.round((PREVIEW_H * FRAME[ratio].w) / FRAME[ratio].h);

  return (
    <div style={{ display: "flex", gap: 36, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={label}>ECLIPSE</label>
          <select style={input} value={eclipseId} onChange={(e) => chooseEclipse(e.target.value as EclipseId)}>
            {ECLIPSE_LIST.map((e) => (
              <option key={e.id} value={e.id} style={{ color: "#000" }}>{e.name}</option>
            ))}
          </select>
        </div>

        <div style={{ position: "relative" }}>
          <label style={label}>LOCATION</label>
          <input
            style={input}
            value={query}
            placeholder="Search a city…"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            spellCheck={false}
          />
          {suggestions.length > 0 && (
            <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 4, position: "absolute", zIndex: 10, width: "100%", boxSizing: "border-box", background: "#15171c", border: "1px solid #2a2d33", borderRadius: 2, maxHeight: 220, overflowY: "auto" }}>
              {suggestions.map((c) => (
                <li key={`${c.name}-${c.lat}`}>
                  <button
                    onMouseDown={(e) => { e.preventDefault(); pickCity(c); }}
                    style={{ width: "100%", textAlign: "left", fontFamily: MONO, fontSize: 12, color: "#e2e2e2", background: "transparent", border: "none", padding: "7px 8px", cursor: "pointer", borderRadius: 2 }}
                  >
                    {c.name} <span style={{ color: "#6a6a6a" }}>· {c.admin}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setManual((m) => !m)} style={{ fontFamily: MONO, fontSize: 9.5, color: "#8e8d8d", background: "transparent", border: "none", padding: "6px 0 0", cursor: "pointer" }}>
            {manual ? "▾ hide manual lat/long" : "▸ enter lat/long manually"}
          </button>
          {manual && (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input style={{ ...input, flex: 1 }} placeholder="lat" value={mLat} onChange={(e) => setMLat(e.target.value)} inputMode="decimal" />
              <input style={{ ...input, flex: 1 }} placeholder="long" value={mLon} onChange={(e) => setMLon(e.target.value)} inputMode="decimal" />
              <button onClick={applyManual} style={{ fontFamily: MONO, fontSize: 11, color: "#0e1216", background: "#e2e2e2", border: "none", borderRadius: 2, padding: "0 12px", cursor: "pointer" }}>SET</button>
            </div>
          )}
          {!circumstances.visible && (
            <p style={{ fontFamily: MONO, fontSize: 10, color: "#d8915a", margin: "8px 0 0" }}>
              Not visible from here — pick a spot on the path of totality.
            </p>
          )}
        </div>

        <div>
          <label style={label}>HEADLINE</label>
          <textarea
            style={{ ...input, resize: "vertical", lineHeight: 1.5 }}
            rows={2}
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Type a headline — Enter for a line break"
            spellCheck={false}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
            {ASPIRATIONS.map((a) => (
              <button key={a} title={a} onClick={() => setHeadline(a)} style={{ fontFamily: MONO, fontSize: 9, color: "#8e8d8d", background: "transparent", border: "1px solid #2a2d33", borderRadius: 2, padding: "3px 6px", cursor: "pointer" }}>
                {a.length > 16 ? a.slice(0, 15) + "…" : a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={label}>ASPECT RATIO</label>
          <div style={{ display: "flex", gap: 6 }}>
            {RATIOS.map((r) => (
              <button
                key={r}
                onClick={() => setRatio(r)}
                style={{ flex: 1, fontFamily: MONO, fontSize: 12, padding: "9px 0", cursor: "pointer", borderRadius: 2, border: "1px solid", borderColor: ratio === r ? "#e2e2e2" : "#2a2d33", background: ratio === r ? "#e2e2e2" : "transparent", color: ratio === r ? "#0e1216" : "#8e8d8d" }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button onClick={() => setSeed(randomSeed())} style={{ width: "100%", fontFamily: MONO, fontSize: 13, letterSpacing: 1, padding: "12px 0", background: "#fff", color: "#0e1216", border: "none", borderRadius: 2, cursor: "pointer" }}>
            GENERATE ↻
          </button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={{ ...input, flex: 1, fontSize: 11 }} value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="seed" spellCheck={false} />
          </div>
          <Link
            href={posterHref({ seed, eclipseId, location, headline, ratio, variant })}
            prefetch={false}
            style={{ display: "block", textAlign: "center", marginTop: 8, fontFamily: MONO, fontSize: 12, letterSpacing: 1, padding: "11px 0", background: "transparent", color: "#e2e2e2", textDecoration: "none", border: "1px solid #2a2d33", borderRadius: 2 }}
          >
            REFINE ↗
          </Link>
        </div>
      </div>

      <div>
        <div style={{ width: previewW, maxWidth: "100%" }}>
          {isTicket ? (
            <TicketSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio }} variant={variant} />
          ) : isStamp ? (
            <StampSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio }} variant={variant} />
          ) : (
            <PosterSVG model={{ eclipse, location, circumstances, aspiration: headline, ratio }} variant={variant} />
          )}
        </div>
        <p style={{ fontFamily: MONO, fontSize: 10, color: "#6a6a6a", padding: "10px 0 0" }}>
          {ratio} · seed {seed}
        </p>
      </div>
    </div>
  );
}
