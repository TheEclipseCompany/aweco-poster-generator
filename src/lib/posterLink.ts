/**
 * Handoff between the batch/generator views and the single-poster studio.
 * A poster's full identity — seed, eclipse, location, headline, ratio, and its
 * *resolved* variant (absolute values, no ranges) — is serialized into the URL
 * so "open this poster" lands on /poster reflecting exactly what was clicked,
 * and the link stays shareable and refresh-safe.
 */
import { ECLIPSES, type EclipseId } from "@/data/eclipses";
import { ASPIRATIONS } from "@/data/copy";
import { makeVariant, type PosterVariant } from "@/poster/variant";
import { FRAME, PRINT_WIDTH_IN, type MarkerAnchor, type PosterLocation, type Ratio } from "@/poster/types";

/** Audio corona options carried in the share/raw URL (signature fetched from sigUrl). */
export interface PosterAudioOpts {
  /** Public URL of an audio-signature JSON ({ rms[], peak[] }). */
  sigUrl: string;
  on: boolean;
  rays: number;
  spikeLen: number;
  roundTips: boolean;
  hiContrast: boolean;
}

export interface PosterPayload {
  seed: string;
  eclipseId: EclipseId;
  location: PosterLocation;
  headline: string;
  ratio: Ratio;
  variant: PosterVariant;
  /** Custom text beside the map marker (absent = the location name). */
  markerText?: string;
  /** Where the marker label sits around the dot (absent = "e", to the right). */
  markerAnchor?: MarkerAnchor;
  /** Locale for fixed strings + Intl value formatting (absent = "en"). */
  locale?: string;
  /** Optional audio corona (fetched at render time from sigUrl). */
  audio?: PosterAudioOpts;
}

export function encodePoster(p: PosterPayload): string {
  return encodeURIComponent(JSON.stringify(p));
}

export function decodePoster(s?: string | null): PosterPayload | null {
  if (!s) return null;
  try {
    return JSON.parse(decodeURIComponent(s)) as PosterPayload;
  } catch {
    return null;
  }
}

export function posterHref(p: PosterPayload): string {
  return `/poster?p=${encodePoster(p)}`;
}

/** Chrome-free render of the same payload — just the poster, edge to edge. */
export function posterRawHref(p: PosterPayload): string {
  return `/poster/raw?p=${encodePoster(p)}`;
}

const IMAGER = "https://image.theeclipse.store/";
const DPI = 300;

/**
 * Screenshot-service URL that captures the raw render at print resolution:
 * width from the ratio's intended print size at 300 DPI, height derived from
 * the exact frame proportions so the viewport matches the SVG edge to edge.
 * Needs the deployment origin (the imager must be able to reach the URL).
 */
export function imagerHref(origin: string, p: PosterPayload): string {
  const { w, h } = FRAME[p.ratio];
  const width = Math.round(PRINT_WIDTH_IN[p.ratio] * DPI);
  const height = Math.round((width * h) / w);
  const url = encodeURIComponent(`${origin}${posterRawHref(p)}`);
  return `${IMAGER}?url=${url}&width=${width}&height=${height}`;
}

const DEFAULT_SEED = "AWE-2024";

/** The out-of-the-box poster (studio fresh-open, raw route with no payload). */
export function defaultPayload(): PosterPayload {
  const eclipseId: EclipseId = "2024-04-08";
  const e = ECLIPSES[eclipseId];
  return {
    seed: DEFAULT_SEED,
    eclipseId,
    location: e.defaultLocation,
    headline: ASPIRATIONS[0],
    ratio: "3:4",
    variant: makeVariant(DEFAULT_SEED, e.baseSpanDeg),
  };
}
