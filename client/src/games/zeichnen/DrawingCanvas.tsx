import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';

interface Stroke {
  color: string;
  size: number;
  points: [number, number][];
}

export interface DrawingCanvasHandle {
  toDataUrl(): string | null;
  clear(): void;
}

const PAPER = '#fffdf7';
const COLORS = ['#1d1b26', '#e5383b', '#ff8a3d', '#ffd23f', '#2bb673', '#3a86ff', '#8b5cf6', '#8d5b3c'];
const SIZES = [4, 9, 18];

/** Finger drawing surface with colours, brush sizes, eraser, undo and clear. */
export function DrawingCanvas({ ref }: { ref?: Ref<DrawingCanvasHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const active = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [size, setSize] = useState(SIZES[1]!);
  const [erasing, setErasing] = useState(false);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    for (const stroke of strokes.current) drawStroke(ctx, stroke, width, height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      // Hidden (display: none) canvases report 0 – resizing would wipe the drawing.
      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
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

  useImperativeHandle(ref, () => ({
    toDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? null,
    clear: () => {
      strokes.current = [];
      setCount(0);
      redraw();
    },
  }));

  const point = (event: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { color: erasing ? PAPER : color, size: erasing ? size * 2.5 : size, points: [point(event)] };
    strokes.current.push(active.current);
    redraw();
  };

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    for (const e of events) {
      active.current.points.push([(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]);
    }
    redraw();
  };

  const up = () => {
    if (!active.current) return;
    active.current = null;
    setCount(strokes.current.length);
  };

  const undo = () => {
    sound.unpluck();
    haptic(8);
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  };

  const clear = () => {
    sound.whoosh();
    haptic([10, 30, 10]);
    strokes.current = [];
    setCount(0);
    redraw();
  };

  return (
    <div className="draw">
      <canvas
        ref={canvasRef}
        className="draw__canvas"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Zeichenfläche"
      />
      <div className="draw__tools">
        <div className="draw__colors">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`draw__color ${!erasing && color === c ? 'is-active' : ''}`}
              style={{ '--c': c } as CSSProperties}
              aria-label={`Farbe ${c}`}
              onClick={() => {
                sound.tap();
                haptic(5);
                setColor(c);
                setErasing(false);
              }}
            />
          ))}
        </div>
        <div className="draw__row">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`draw__size ${size === s ? 'is-active' : ''}`}
              aria-label={`Strichstärke ${s}`}
              onClick={() => {
                sound.tap();
                setSize(s);
              }}
            >
              <span style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
          <button
            type="button"
            className={`draw__tool ${erasing ? 'is-active' : ''}`}
            onClick={() => {
              sound.tap();
              setErasing((e) => !e);
            }}
          >
            🧽
          </button>
          <button type="button" className="draw__tool" onClick={undo} disabled={count === 0} aria-label="Rückgängig">
            ↶
          </button>
          <button type="button" className="draw__tool" onClick={clear} disabled={count === 0} aria-label="Alles löschen">
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  const scale = Math.min(width, height) / 360;
  const pts = stroke.points.map(([x, y]) => [x * width, y * height] as const);
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0]![0], pts[0]![1], (stroke.size * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  // Quadratic curves through the midpoints give smooth lines.
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}
