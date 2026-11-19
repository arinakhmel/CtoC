/** The one place that turns integer kopecks into text for the UI (ADR-0007: no floats in the data, only here). */
export function formatUah(kopecks: number): string {
  const hryvnias = kopecks / 100;
  const text = hryvnias.toLocaleString('uk-UA', {
    minimumFractionDigits: kopecks % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} грн`;
}

/** A deadline as the student reads it: date and time in the browser's time zone. */
export const formatDeadline = (iso: string): string =>
  new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A payment date as the student reads it: the day only, in the browser's time zone. */
export const formatDate = (iso: string): string => new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * A form shows UAH; the API takes integer kopecks (US-26 top-up, US-36 withdrawal). Only digits with an optional separator and at
 * most two decimals are an amount: anything else (letters, `1e3`, `0x10`, a third decimal that would be rounded away) gives NaN,
 * which the shared schema rejects.
 */
export const uahToKopecks = (uah: string): number => {
  const text = uah.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : Number.NaN;
};
