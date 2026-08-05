/**
 * Locale-aware value formatting, mirroring packages/eclipse/utils.ts in
 * the-eclipse-app-web: every formatter takes an explicit locale and builds on
 * raw Intl APIs (never toLocaleString, no ICU number/date skeletons in
 * messages). Durations reimplement Intl.DurationFormat out of
 * NumberFormat(style: "unit") + ListFormat, exactly like the web app's
 * formatDurationLikeIntl, so "4m 28s" localizes correctly everywhere.
 */

type DurationUnits = {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
};

/** Two largest non-zero units, unit-formatted and list-joined per locale. */
export function formatDurationLikeIntl(
  locale: string,
  { days = 0, hours = 0, minutes = 0, seconds = 0 }: DurationUnits,
  style: "narrow" | "short" | "long" = "narrow",
): string {
  let parts: Array<["day" | "hour" | "minute" | "second", number]> = [];
  if (days > 0) {
    parts = [["day", days], ["hour", hours]];
  } else if (hours > 0) {
    parts = [["hour", hours], ["minute", minutes]];
  } else if (minutes > 0) {
    parts = [["minute", minutes], ["second", seconds]];
  } else {
    parts = [["second", seconds]];
  }

  const formatUnit = (unit: "day" | "hour" | "minute" | "second", value: number) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: style }).format(value);

  const listFormatter = new Intl.ListFormat(locale, {
    style: style === "narrow" ? "narrow" : "short",
    type: "unit",
  });
  return listFormatter.format(parts.map(([u, v]) => formatUnit(u, v)));
}

/** Totality duration, e.g. "4m 28s" (en) — "—" when there is no totality. */
export function formatDuration(sec: number | undefined, locale: string): string {
  if (sec == null) return "—";
  const abs = Math.abs(sec);
  return formatDurationLikeIntl(locale, {
    days: Math.floor(abs / 86400),
    hours: Math.floor((abs % 86400) / 3600),
    minutes: Math.floor((abs % 3600) / 60),
    seconds: Math.floor(abs % 60),
  });
}

/** Obscuration as a locale percentage, e.g. "87.4%" / "87,4 %" / "100%". */
export function formatObscuration(frac: number, locale: string): string {
  const pct = frac * 100;
  const whole = pct >= 99.95 || pct === 0;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: whole ? 0 : 1,
    maximumFractionDigits: whole ? 0 : 1,
  }).format(frac);
}

/** Contact time in the locale's own clock convention (12h en, 24h de…). */
export function formatLocalTime(d: Date | undefined, tz: string, locale: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
  }).format(d);
}

/**
 * Eclipse calendar date in the locale's own numeric convention, e.g.
 * "04/08/2024" (en) / "08.04.2024" (de) / "2024/04/08" (ja). The ISO input is
 * a UTC calendar day, so the formatter pins timeZone to UTC — without it,
 * any viewer west of Greenwich would see the previous day.
 */
export function formatDateStamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Coordinates like "23.2494° N, 106.4111° W" — trimmed mirror of the web
 *  app's formatLatLngCoordinates (NumberFormat digits + ListFormat join). */
export function formatLatLngCoordinates(
  lat: number,
  lng: number,
  locale: string,
  fractionDigits = 4,
): string {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
  const list = new Intl.ListFormat(locale, { style: "short", type: "unit" });
  const part = (dec: number, pos: string, neg: string) =>
    `${nf.format(Math.abs(dec))}° ${dec >= 0 ? pos : neg}`;
  return list.format([part(lat, "N", "S"), part(lng, "E", "W")]);
}
