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
