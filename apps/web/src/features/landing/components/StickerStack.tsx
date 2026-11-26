import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';

export interface Sticker {
  id: string;
  className: string;
  content: ReactNode;
  /** Where it rests at first, in px from the top left of the board, and its tilt in degrees. */
  x: number;
  y: number;
  rotate: number;
}

interface Body {
  x: number;
  y: number;
  rotate: number;
  vx: number;
  vy: number;
  vr: number;
}

const FRICTION = 0.92;
const BOUNCE = 0.55;

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Sample task stickers on the landing page that the visitor can grab and toss. A thrown sticker slides on with friction,
 * bounces off the edges of the board and tilts with its speed; they never move on their own. Decorative (aria-hidden): the hero text says the same. With reduced motion they only follow the pointer, without the toss.
 */
export function StickerStack({ stickers, hint }: { stickers: Sticker[]; hint: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const bodies = useRef(new Map<string, Body>(stickers.map((s) => [s.id, { x: s.x, y: s.y, rotate: s.rotate, vx: 0, vy: 0, vr: 0 }])));
  const [order, setOrder] = useState(() => stickers.map((s) => s.id));
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; lastX: number; lastY: number; lastT: number } | null>(null);
  const frame = useRef(0);

  const paint = (id: string) => {
    const element = elements.current.get(id);
    const body = bodies.current.get(id);
    if (element && body) element.style.transform = `translate(${body.x}px, ${body.y}px) rotate(${body.rotate}deg)`;
  };

  /** The area a sticker may move in: a little past the edges, so a toss feels free but never loses the sticker. */
  const bounds = (id: string) => {
    const board = boardRef.current?.getBoundingClientRect();
    const element = elements.current.get(id);
    const width = board?.width ?? 0;
    const height = board?.height ?? 0;
    const stickerHeight = element?.offsetHeight ?? 0;
    return { minX: -width * 0.3, maxX: width * 0.3, minY: -24, maxY: Math.max(0, height - stickerHeight + 24) };
  };

  const step = () => {
    let moving = false;
    for (const [id, body] of bodies.current) {
      if (drag.current?.id === id) continue;
      if (Math.abs(body.vx) + Math.abs(body.vy) + Math.abs(body.vr) < 0.05) continue;
      moving = true;
      body.x += body.vx;
      body.y += body.vy;
      body.rotate += body.vr;
      body.vx *= FRICTION;
      body.vy *= FRICTION;
      body.vr *= FRICTION;
      const box = bounds(id);
      if (body.x < box.minX || body.x > box.maxX) {
        body.x = Math.min(box.maxX, Math.max(box.minX, body.x));
        body.vx *= -BOUNCE;
        body.vr += body.vx * 0.15;
      }
      if (body.y < box.minY || body.y > box.maxY) {
        body.y = Math.min(box.maxY, Math.max(box.minY, body.y));
        body.vy *= -BOUNCE;
      }
      body.rotate = Math.max(-14, Math.min(14, body.rotate));
      paint(id);
    }
    frame.current = moving ? requestAnimationFrame(step) : 0;
  };
  const run = () => {
    if (!frame.current) frame.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    stickers.forEach((s) => paint(s.id));
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const onPointerDown = (id: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const body = bodies.current.get(id)!;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, dx: event.clientX - body.x, dy: event.clientY - body.y, lastX: event.clientX, lastY: event.clientY, lastT: performance.now() };
    body.vx = body.vy = body.vr = 0;
    setGrabbed(id);
    setOrder((current) => [...current.filter((other) => other !== id), id]);
  };

  const onPointerMove = (id: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== id) return;
    const body = bodies.current.get(id)!;
    const now = performance.now();
    const dt = Math.max(1, now - current.lastT);
    // Speed in px per frame (~16 ms), smoothed, so the release keeps the feel of the last movement.
    body.vx = body.vx * 0.5 + ((event.clientX - current.lastX) / dt) * 16 * 0.5;
    body.vy = body.vy * 0.5 + ((event.clientY - current.lastY) / dt) * 16 * 0.5;
    body.x = event.clientX - current.dx;
    body.y = event.clientY - current.dy;
    body.rotate += (body.vx * 0.6 - body.rotate * 0.1) * 0.25;
    body.rotate = Math.max(-14, Math.min(14, body.rotate));
    Object.assign(current, { lastX: event.clientX, lastY: event.clientY, lastT: now });
    paint(id);
  };

  const onPointerUp = (id: string) => () => {
    if (drag.current?.id !== id) return;
    drag.current = null;
    setGrabbed(null);
    const body = bodies.current.get(id)!;
    if (reducedMotion()) {
      body.vx = body.vy = body.vr = 0;
      return;
    }
    // A very fast flick is capped, so a sticker slides a little way instead of crossing the whole board.
    const cap = (v: number) => Math.max(-28, Math.min(28, v));
    body.vx = cap(body.vx);
    body.vy = cap(body.vy);
    body.vr = body.vx * 0.12;
    run();
  };

  return (
    <div ref={boardRef} className="sticker-board" aria-hidden="true">
      {stickers.map((sticker) => (
        <div
          key={sticker.id}
          ref={(element) => {
            if (element) elements.current.set(sticker.id, element);
            else elements.current.delete(sticker.id);
          }}
          className={`ticket ${sticker.className}${grabbed === sticker.id ? ' is-grabbed' : ''}`}
          style={{ zIndex: order.indexOf(sticker.id) + 1 }}
          onPointerDown={onPointerDown(sticker.id)}
          onPointerMove={onPointerMove(sticker.id)}
          onPointerUp={onPointerUp(sticker.id)}
          onPointerCancel={onPointerUp(sticker.id)}
        >
          {sticker.content}
        </div>
      ))}
      <p className="sticker-board__hint">{hint}</p>
    </div>
  );
}
