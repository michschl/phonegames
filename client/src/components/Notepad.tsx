import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '../lib/device.ts';
import { Icon } from './Icon.tsx';

/*
 * «Notizblatt»: a sheet for working out an answer – with a finger, or with a pen (Apple Pencil) on a
 * tablet. Squared like a maths booklet or lined. With a pen, the hand resting on the screen draws
 * nothing. The eraser removes whole strokes, so the lines of the paper stay.
 */

export interface NoteStroke {
  /** Points relative to the width of the sheet (x and y), so the notes keep their shape when it resizes. */
  points: [number, number][];
  width: number;
}

const INK = '#1d3f9e';
const RULE = 'rgba(80, 90, 140, 0.18)';
const PAPER = '#fffef9';
/** Squares or lines every 5 % of the width – about 5 mm on a tablet held upright. */
const STEP = 0.05;

function drawSheet(canvas: HTMLCanvasElement, strokes: NoteStroke[], grid: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = Math.max(1, width / 900);
  const step = width * STEP;
  ctx.beginPath();
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  if (grid) {
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;
    ctx.lineWidth = stroke.width * width;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0] * width, pts[0]![1] * width);
    if (pts.length === 1) ctx.lineTo(pts[0]![0] * width + 0.1, pts[0]![1] * width);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]!;
      const [nx, ny] = pts[i + 1]!;
      ctx.quadraticCurveTo(x * width, y * width, ((x + nx) / 2) * width, ((y + ny) / 2) * width);
    }
    if (pts.length > 1) ctx.lineTo(pts.at(-1)![0] * width, pts.at(-1)![1] * width);
    ctx.stroke();
  }
}

export function Notepad({
  strokes,
  onChange,
  grid,
  readOnly = false,
  label = 'Notizblatt',
}: {
  strokes: NoteStroke[];
  onChange?: (strokes: NoteStroke[]) => void;
  grid: boolean;
  readOnly?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<NoteStroke[]>(strokes);
  const active = useRef<NoteStroke | null>(null);
  const penSeen = useRef(false);
  const [erasing, setErasing] = useState(false);

  const redraw = useCallback(() => {
    if (canvasRef.current) drawSheet(canvasRef.current, live.current, grid);
  }, [grid]);

  useEffect(() => {
    live.current = strokes;
    redraw();
  }, [strokes, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      if (canvas.clientWidth === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [redraw]);

  const at = (event: { clientX: number; clientY: number }, rect: DOMRect): [number, number] => [
    (event.clientX - rect.left) / rect.width,
    (event.clientY - rect.top) / rect.width,
  ];

  /** A hand resting on the screen while writing with a pen must not draw. */
  const ignored = (event: ReactPointerEvent) => {
    if (event.pointerType === 'pen') penSeen.current = true;
    return event.pointerType === 'touch' && penSeen.current;
  };

  const eraseAt = (point: [number, number]) => {
    const radius = 0.025;
    const kept = live.current.filter((stroke) => !stroke.points.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < radius));
    if (kept.length !== live.current.length) {
      live.current = kept;
      haptic(6);
      redraw();
    }
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (readOnly || ignored(event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = at(event, event.currentTarget.getBoundingClientRect());
    if (erasing) {
      eraseAt(point);
      active.current = { points: [], width: 0 };
      return;
    }
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    active.current = { points: [point], width: 0.0035 + pressure * 0.003 };
    live.current = [...live.current, active.current];
    redraw();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!active.current || ignored(event)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    if (erasing) {
      for (const e of events) eraseAt(at(e, rect));
      return;
    }
    for (const e of events) active.current.points.push(at(e, rect));
    redraw();
  };

  const up = () => {
    if (!active.current) return;
    active.current = null;
    onChange?.(live.current);
  };

  const undo = () => {
    haptic(8);
    live.current = live.current.slice(0, -1);
    onChange?.(live.current);
    redraw();
  };

  const clear = () => {
    haptic([10, 30, 10]);
    live.current = [];
    onChange?.([]);
    redraw();
  };

  return (
    <div className={`notepad ${readOnly ? 'is-readonly' : ''}`}>
      <canvas
        ref={canvasRef}
        className="notepad__sheet"
        role="img"
        aria-label={readOnly ? `${label} (deine Notizen)` : `${label} – mit Finger oder Stift schreiben`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {!readOnly && (
        <div className="notepad__tools" role="toolbar" aria-label="Werkzeuge des Notizblatts">
          <button type="button" className={`chip ${!erasing ? 'is-active' : ''}`} aria-pressed={!erasing} onClick={() => setErasing(false)}>
            <Icon name="edit" size={16} />
            <span>Stift</span>
          </button>
          <button type="button" className={`chip ${erasing ? 'is-active' : ''}`} aria-pressed={erasing} onClick={() => setErasing(true)}>
            <Icon name="eraser" size={16} />
            <span>Radierer</span>
          </button>
          <button type="button" className="chip" onClick={undo} disabled={strokes.length === 0}>
            <Icon name="undo" size={16} />
            <span>Rückgängig</span>
          </button>
          <button type="button" className="chip" onClick={clear} disabled={strokes.length === 0}>
            <Icon name="trash" size={16} />
            <span>Leeren</span>
          </button>
        </div>
      )}
    </div>
  );
}
