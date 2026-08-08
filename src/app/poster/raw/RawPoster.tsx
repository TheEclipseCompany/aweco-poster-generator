"use client";

import { useEffect, useMemo, useState } from "react";
import { computeCircumstances } from "@/lib/astronomy";
import { ECLIPSES } from "@/data/eclipses";
import { decodePoster, defaultPayload } from "@/lib/posterLink";
import { parseSignatureJSON, type AudioSignature } from "@/lib/audioSignature";
import { PosterSVG, type AudioCoronaOpts } from "@/poster/PosterSVG";
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
  const [audioSig, setAudioSig] = useState<AudioSignature | null>(null);
  const [audioReady, setAudioReady] = useState(!p.audio?.on || !p.audio?.sigUrl);

  useEffect(() => {
    let active = true;
    const opts = p.audio;
    if (!opts?.on || !opts.sigUrl) {
      setAudioSig(null);
      setAudioReady(true);
      return;
    }
    setAudioReady(false);
    fetch(opts.sigUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch audio signature (${r.status})`);
        return r.text();
      })
      .then((text) => {
        if (!active) return;
        setAudioSig(parseSignatureJSON(text));
        setAudioReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!active) return;
        setAudioSig(null);
        setAudioReady(true);
      });
    return () => {
      active = false;
    };
  }, [p.audio?.on, p.audio?.sigUrl]);

  // Screenshot-readiness beacon for the image server: the poster is in the
  // DOM, fonts are loaded, and any audio signature fetch has settled.
  useEffect(() => {
    if (!audioReady) return;
    let active = true;
    document.fonts.ready.then(() => {
      if (!active) return;
      document.body.classList.add("page-is-ready-for-screenshot");
      // When embedded in the store /frame iframe, notify the parent.
      try {
        window.parent?.postMessage("page-is-ready-for-screenshot", "*");
      } catch {
        /* ignore */
      }
    });
    return () => {
      active = false;
      document.body.classList.remove("page-is-ready-for-screenshot");
    };
  }, [p, audioReady]);

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

  const audio: AudioCoronaOpts | null =
    audioSig && p.audio?.on
      ? {
          signature: audioSig,
          rayCount: p.audio.rays,
          rayLen: p.audio.spikeLen,
          roundTips: p.audio.roundTips,
          highContrast: p.audio.hiContrast,
        }
      : null;

  return p.ratio === "ticket" ? (
    <TicketSVG model={model} variant={p.variant} />
  ) : p.ratio === "stamp" ? (
    <StampSVG model={model} variant={p.variant} />
  ) : (
    <PosterSVG model={model} variant={p.variant} audio={audio} />
  );
}
