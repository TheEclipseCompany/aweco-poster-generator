/**
 * Local eclipse circumstances, computed by the same Besselian-element engine
 * the-eclipse-app-web uses (vendored in src/eclipse/ from packages/eclipse:
 * lib.ts, the Xavier Jubier-derived calculator, plus elements.ts, the
 * per-eclipse element sets). No API, no keys — pure synchronous math.
 * Feeds the poster metadata block.
 */
import {
  createEclipseCalculator,
  EclipseEventType,
  type EclipseCalculationContact,
} from "@/eclipse/lib";
import elements from "@/eclipse/elements";

export interface Circumstances {
  /** Whether this eclipse is actually visible (above horizon) at the location. */
  visible: boolean;
  /** total | annular | partial | none (none = not locally visible). */
  kind: "total" | "annular" | "partial" | "none";
  /** True only when the location is inside the path of totality. */
  inTotality: boolean;
  /** Fraction of the sun's disc covered at maximum, 0..1. */
  obscuration: number;
  /** Contact times as UTC Date objects (format with formatLocalTime). */
  partialBegin?: Date;
  totalBegin?: Date;
  peak?: Date;
  totalEnd?: Date;
  partialEnd?: Date;
  /** Duration of totality in seconds (undefined when not total). */
  totalityDurationSec?: number;
}

const KINDS: Record<EclipseEventType, Circumstances["kind"]> = {
  [EclipseEventType.Total]: "total",
  [EclipseEventType.Annular]: "annular",
  [EclipseEventType.Partial]: "partial",
  [EclipseEventType.None]: "none",
};

const toDate = (c: EclipseCalculationContact | undefined): Date | undefined =>
  c ? new Date(c.utcTimestamp * 1000) : undefined;

/**
 * Compute circumstances of the eclipse identified by `elementsKey` (the web
 * app's slug convention, e.g. "2026-total") at a location. A fresh calculator
 * is built per call — the engine's closure is stateful, so instances must not
 * be shared across coordinate calls.
 */
export function computeCircumstances(
  elementsKey: string,
  lat: number,
  lon: number,
): Circumstances {
  const elementSet = elements[elementsKey as keyof typeof elements];
  if (!elementSet) throw new Error(`No Besselian elements for "${elementsKey}"`);
  const calculator = createEclipseCalculator(elementSet);
  const c = calculator({ lat, lng: lon, elevation: 0 });

  const kind = KINDS[c.eventType];
  if (kind === "none" || !c.isEventAboveHorizonForMaxEclipse) {
    return { visible: false, kind: "none", inTotality: false, obscuration: 0 };
  }

  // c2/c3 exist only inside the umbral path; the engine sets the umbral
  // duration only when the sun is up for at least one of them.
  const inTotality =
    kind === "total" && !!c.c2 && !!c.c3 && c.umbralDurationInSeconds > 0;

  return {
    visible: true,
    kind,
    inTotality,
    obscuration: c.eclipseObscuration,
    partialBegin: toDate(c.c1),
    totalBegin: toDate(c.c2),
    peak: toDate(c.cMid),
    totalEnd: toDate(c.c3),
    partialEnd: toDate(c.c4),
    totalityDurationSec: inTotality ? c.umbralDurationInSeconds : undefined,
  };
}
