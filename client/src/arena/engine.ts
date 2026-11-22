import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';

/*
 * The 3D frame of the Arena games: a three.js renderer on a canvas that follows its size, renders every
 * frame, lowers the resolution when the phone cannot keep up (and raises it again), and frees the
 * graphics memory when the game ends – browsers allow only a few 3D contexts at a time.
 */

export interface ArenaScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Every frame, with the seconds since the last one (at most 0.05). */
  update(dt: number): void;
  dispose?(): void;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

/**
 * Runs a 3D scene on the canvas while the component lives. `create` builds the scene once (again when
 * `key` changes); `running` pauses the updates (the last picture stays).
 */
export function useArenaScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  create: (renderer: THREE.WebGLRenderer) => ArenaScene,
  key: unknown = 0,
): RefObject<ArenaScene | null> {
  const current = useRef<ArenaScene | null>(null);
  const factory = useRef(create);
  factory.current = create;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
    let ratio = maxRatio;
    renderer.setPixelRatio(ratio);

    const stage = factory.current(renderer);
    current.current = stage;

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      stage.camera.aspect = width / height;
      stage.camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    let last = performance.now();
    let slow = 0;
    let fast = 0;
    const loop = (now: number) => {
      const elapsed = now - last;
      last = now;
      // Dynamic resolution: a slow phone gets fewer pixels, a fast one gets them back.
      if (elapsed > 26) slow++;
      else if (elapsed < 15) fast++;
      if (slow > 40 && ratio > 0.6) {
        ratio = Math.max(0.6, ratio * 0.85);
        renderer.setPixelRatio(ratio);
        resize();
        slow = 0;
        fast = 0;
      } else if (fast > 240 && ratio < maxRatio) {
        ratio = Math.min(maxRatio, ratio * 1.1);
        renderer.setPixelRatio(ratio);
        resize();
        slow = 0;
        fast = 0;
      }
      stage.update(Math.min(0.05, elapsed / 1000));
      renderer.render(stage.scene, stage.camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.dispose?.();
      disposeScene(stage.scene);
      renderer.dispose();
      renderer.forceContextLoss();
      current.current = null;
    };
  }, [canvasRef, key]);

  return current;
}

/** A soft sky gradient as scene background. */
export function skyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A round, soft glow for sparkles and lights (additive sprites). */
export function glowTexture(color = '#ffffff'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, `${color}aa`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
