import { useEffect, useState } from 'react';
import { TickerIcon } from './TickerIcon';

const STEP_MS = 3000;

/**
 * The strip above the header: one promise at a time, the next one every 3 seconds, on every screen. It pauses while the
 * pointer or the keyboard focus is on it and while the tab is hidden (WCAG 2.2.2). All the promises are in the markup for a
 * screen reader; only the current one is visible.
 */
export function Ticker({ text }: { text: string }) {
  const items = text.split('|');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % items.length);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [paused, items.length]);

  return (
    <div
      className="ticker"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container">
        <ul className="ticker__list">
          {items.map((part, position) => (
            <li key={part} className={position === index ? 'ticker__item is-current' : 'ticker__item'}>
              <TickerIcon index={position} />
              {part}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
