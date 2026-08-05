import type { EclipseRecord } from "@/data/eclipses";
import type { Circumstances } from "@/lib/astronomy";

export type Ratio = "3:4" | "din-a" | "9:16" | "1:1" | "ticket" | "stamp";

export interface PosterLocation {
  name: string;
  admin?: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface PosterModel {
  eclipse: EclipseRecord;
  location: PosterLocation;
  circumstances: Circumstances;
  /** Aspiration headline (Neue York display). */
  aspiration: string;
  ratio: Ratio;
  /** Crop zoom — latitude degrees spanned by the frame. */
  spanDeg?: number;
  /** Custom text beside the map marker (absent = the location name). */
  markerText?: string;
}

export const FRAME: Record<Ratio, { w: number; h: number }> = {
  "3:4": { w: 768, h: 1024 },
  // ISO 216 / DIN A portrait (1:√2) — prints cleanly at any A size (A4…A0).
  "din-a": { w: 768, h: 1086 },
  "9:16": { w: 600, h: 1067 },
  "1:1": { w: 820, h: 820 },
  // Landscape ticket stub (~1.8:1), matching the boarding-pass reference.
  ticket: { w: 900, h: 500 },
  // Small square commemorative stamp / badge.
  stamp: { w: 520, h: 520 },
};
