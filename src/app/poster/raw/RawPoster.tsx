"use client";

import { useEffect, useMemo } from "react";
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

  // Screenshot-readiness beacon for the image server: the poster is in the
  // DOM (this effect runs after commit) and the display/mono webfonts have
  // loaded — before that, a capture would show fallback type.
  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) document.body.classList.add("page-is-ready-for-screenshot");
    });
    return () => {
      active = false;
      document.body.classList.remove("page-is-ready-for-screenshot");
    };
  }, [p]);

  const eclipse = ECLIPSES[p.eclipseId];
  const { lat, lon } = p.location;
  const circumstances = useMemo(
    () => computeCircumstances(eclipse.elementsKey, lat, lon),
    [eclipse.elementsKey, lat, lon],
  );
  const model: PosterModel = {
    eclipse,
    location: p.location,
    circumstances,
    aspiration: p.headline,
    ratio: p.ratio,
    markerText: p.markerText,
    markerAnchor: p.markerAnchor,
    locale: p.locale,
  };
  return p.ratio === "ticket" ? (
    <TicketSVG model={model} variant={p.variant} />
  ) : p.ratio === "stamp" ? (
    <StampSVG model={model} variant={p.variant} />
  ) : (
    <PosterSVG model={model} variant={p.variant} />
  );
}
