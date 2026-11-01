/**
 * ZeroPulse Localization Formatters
 * Formats dates, times, numbers and byte sizes adhering to the active locale.
 */

export type SupportedLanguage = 'en' | 'tr';

export function getLocale(lang?: string): string {
  if (lang === 'tr') return 'tr-TR';
  return 'en-US';
}

export function formatTime(
  date: Date | string | number | null | undefined,
  lang?: string
): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const locale = getLocale(lang);
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatClock(date: Date | number, lang?: string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(getLocale(lang), { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Locale-aware percentage from a 0–100 value: `34.2%` in English, `%34,2` in Turkish. */
export function formatPercent(value: number, lang?: string, fractionDigits: number = 1): string {
  return new Intl.NumberFormat(getLocale(lang), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

export function formatDateTime(
  date: Date | string | number | null | undefined,
  lang?: string
): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const locale = getLocale(lang);
  return d.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatByteRate(bytesPerSecond: number): string {
  return `${formatBytes(Math.max(0, Math.round(bytesPerSecond)))}/s`;
}

export function formatNumber(
  num: number,
  options?: Intl.NumberFormatOptions,
  lang?: string
): string {
  const locale = getLocale(lang);
  return new Intl.NumberFormat(locale, options).format(num);
}
