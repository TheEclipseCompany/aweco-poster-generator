import type { EclipseRecord } from "@/data/eclipses";
import type { Circumstances } from "@/lib/astronomy";

export type Ratio = "3:4" | "din-a" | "9:16" | "1:1" | "ticket" | "stamp";

/** Compass position of the marker label around the location dot. */
export type MarkerAnchor = "e" | "w" | "n" | "s" | "ne" | "nw" | "se" | "sw";

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
  /** Where the marker label sits around the dot (absent = "e", to the right). */
  markerAnchor?: MarkerAnchor;
  /** Locale for fixed strings + Intl value formatting (absent = "en").
   *  Free-text inputs (aspiration, markerText) arrive already localized. */
  locale?: string;
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

/**
 * Intended print width per ratio, in inches — 300-DPI exports derive their
 * pixel size from this (height follows from the FRAME proportions).
 */
export const PRINT_WIDTH_IN: Record<Ratio, number> = {
  "3:4": 18, // 18×24″ poster
  "din-a": 420 / 25.4, // A2 (420×594 mm); same ratio rescales to any A size
  "9:16": 13.5, // 13.5×24″ poster
  "1:1": 12, // 12×12″ square print
  ticket: 9, // 9×5″ keepsake
  stamp: 4, // 4×4″
};
