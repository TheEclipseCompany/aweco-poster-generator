/**
 * Minimal message-file i18n, conceptually mirroring the-eclipse-app-web:
 * per-locale JSON message files (kebab-case keys, nested namespaces, values
 * are display-ready strings), consumed through the same structural
 * `Translator` shape shared code there declares (packages/eclipse/summary.tsx)
 * so a swap to next-intl's `t` later is a drop-in. Dates/numbers are never
 * embedded in messages — they're formatted in JS (src/lib/format.ts) and
 * interpolated as plain `{placeholder}` strings, matching how the web app
 * uses ICU (pre-formatted values, no number/date skeletons).
 *
 * Missing keys fall back locale → English → "[missing: path]" (the same
 * behavior as the web app's native runtime in packages/i18n/native.tsx).
 */
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";

export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

type Messages = { [key: string]: string | Messages };

/** Locales with their own messages file; the rest fall back to English. */
const MESSAGES: Partial<Record<Locale, Messages>> = { en, es };

function lookup(messages: Messages | undefined, path: string[]): string | undefined {
  let node: Messages | string | undefined = messages;
  for (const part of path) {
    if (typeof node !== "object" || node === undefined) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Translator for a locale, optionally scoped to a namespace — mirrors
 * `useTranslations("ns")` / `getTranslations("ns")` call shapes.
 */
export function createTranslator(locale: string, namespace?: string): Translator {
  const tag = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = MESSAGES[tag];
  const prefix = namespace ? namespace.split(".") : [];
  return (key, values) => {
    const path = [...prefix, ...key.split(".")];
    const raw = lookup(messages, path) ?? lookup(MESSAGES[DEFAULT_LOCALE], path);
    if (raw === undefined) return `[missing: ${path.join(".")}]`;
    if (!values) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) =>
      name in values ? String(values[name]) : m,
    );
  };
}
