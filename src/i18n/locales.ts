/**
 * Single source of truth for supported locales (code → endonym), mirroring
 * apps/web/i18n/supported-locales.mjs in the-eclipse-app-web so the poster
 * generator speaks the same languages as the product. To add or remove a
 * language, edit this object — everything else derives from it. A locale
 * without its own messages file still renders: strings fall back to English
 * while all Intl-driven formatting (durations, percentages, times) follows
 * the locale.
 */
export const locales = {
  en: "English",
  is: "Íslenska",
  es: "Español",
  fr: "Français",
  ca: "Català",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  ar: "العربية",
  ja: "日本語",
} as const;

export type Locale = keyof typeof locales;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && v in locales;
}
