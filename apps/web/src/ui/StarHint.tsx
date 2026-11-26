import type { ReactNode } from 'react';

/**
 * Optional help behind a ★: a native disclosure (<details>), so it works with the keyboard and a screen reader without script.
 * Used for examples next to a field («Приклад опису») and for notes that most people do not need.
 */
export function StarHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="star-hint">
      <summary>
        <span aria-hidden="true">★</span> {label}
      </summary>
      <div className="star-hint__body">{children}</div>
    </details>
  );
}
