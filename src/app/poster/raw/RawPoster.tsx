"use client";

import { useMemo } from "react";
import { computeCircumstances } from "@/lib/astronomy";
import { ECLIPSES } from "@/data/eclipses";
import { decodePoster, defaultPayload } from "@/lib/posterLink";
import { PosterSVG } from "@/poster/PosterSVG";
import { TicketSVG } from "@/poster/TicketSVG";
import { StampSVG } from "@/poster/StampSVG";
import type { PosterModel } from "@/poster/types";

/**
 * The poster and nothing else — same encoded payload as /poster, no studio
 * chrome. The SVG fills the page width, so a headless capture (or print) at
 * any viewport width yields the design at full fidelity.
 */
export function RawPoster({ encoded }: { encoded?: string | null }) {
  const p = useMemo(() => decodePoster(encoded) ?? defaultPayload(), [encoded]);
  const eclipse = ECLIPSES[p.eclipseId];
  const { lat, lon } = p.location;
  const circumstances = useMemo(
    () => computeCircumstances(eclipse.date, lat, lon),
    [eclipse.date, lat, lon],
  );
  const model: PosterModel = {
    eclipse,
    location: p.location,
    circumstances,
    aspiration: p.headline,
    ratio: p.ratio,
    markerText: p.markerText,
  };
  return p.ratio === "ticket" ? (
    <TicketSVG model={model} variant={p.variant} />
  ) : p.ratio === "stamp" ? (
    <StampSVG model={model} variant={p.variant} />
  ) : (
    <PosterSVG model={model} variant={p.variant} />
  );
}
