import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { arenaGraphics } from './support.ts';

/*
 * The 3D frame of the Arena games: a three.js renderer on a canvas that follows its size, renders every
 * frame, lowers the resolution when the phone cannot keep up (and raises it again), and frees the
 * graphics memory when the game ends – browsers allow only a few 3D contexts at a time.
 *
 * With effects, the picture is drawn in high dynamic range and finished in passes: bright things glow
 * (bloom), the corners darken a little (vignette), the light is mapped to the screen and edges are smoothed.
 * A phone that still stutters at the lowest resolution loses the effects for the rest of the game; without
 * a graphics chip (and with the setting «Schnell») they are never switched on.
 */

export interface ArenaFx {
  /** Glow of bright things. `threshold` is in scene light: 1 is white paper in full light, so only lamps glow. */
  bloom?: { strength: number; radius: number; threshold: number };
  /** Darker corners, 0–1. */
  vignette?: number;
  exposure?: number;
}

export interface ArenaScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Every frame, with the seconds since the last one (at most 0.05). */
  update(dt: number): void;
  dispose?(): void;
  /** The look of the finished picture; a game may change the values while it runs. */
  fx?: ArenaFx;
}

export interface ArenaInfo {
  /** Are the effects drawn (at least at the start)? A game may spend less on a phone without them. */
  effects: boolean;
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
  // What fx.ts registered with onDispose (render targets).
  for (const free of (scene.userData.disposers ?? []) as (() => void)[]) free();
  scene.environment?.dispose();
}

/** Drawn by the processor instead of a graphics chip (test browsers, some virtual machines)? */
function softwareRendering(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** The last pass: vignette, light mapped to the screen (ACES), sRGB. */
function outputPass(): ShaderPass {
  const material = new THREE.RawShaderMaterial({
    name: 'ArenaOutput',
    uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uVignette: { value: 0.3 } },
    vertexShader: /* glsl */ `
      precision highp float;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform float uVignette;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      varying vec2 vUv;
      void main() {
        vec3 color = texture2D(tDiffuse, vUv).rgb;
        vec2 q = vUv - 0.5;
        color *= 1.0 - uVignette * smoothstep(0.12, 0.6, dot(q, q));
        color = ACESFilmicToneMapping(color);
        gl_FragColor = sRGBTransferOETF(vec4(color, 1.0));
      }`,
  });
  return new ShaderPass(material);
}

/**
 * Runs a 3D scene on the canvas while the component lives. `create` builds the scene once (again when
 * `key` changes).
 */
export function useArenaScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  create: (renderer: THREE.WebGLRenderer, info: ArenaInfo) => ArenaScene,
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
    const wish = arenaGraphics();
    // «Schnell» also draws fewer pixels: that saves the most battery.
    const maxRatio = Math.min(window.devicePixelRatio || 1, wish === 'schnell' ? 1.5 : 2);
    let ratio = maxRatio;
    renderer.setPixelRatio(ratio);

    // The passes need pictures with more than 8 bits per colour; a chip that cannot draw into those gets none.
    const deep = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
    let effects = deep && (wish === 'schoen' || (wish === 'auto' && !softwareRendering(renderer)));
    const stage = factory.current(renderer, { effects });
    current.current = stage;
    const fx = stage.fx ?? {};
    if (fx.exposure) renderer.toneMappingExposure = fx.exposure;

    // The passes of the finished picture.
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    let output: ShaderPass | null = null;
    const passes: { dispose(): void }[] = [];
    const dropEffects = () => {
      composer?.dispose();
      for (const pass of passes) pass.dispose();
      passes.length = 0;
      composer = null;
      bloom = null;
      output = null;
      effects = false;
    };
    if (effects) {
      try {
        composer = new EffectComposer(renderer);
        const scenePass = new RenderPass(stage.scene, stage.camera);
        composer.addPass(scenePass);
        passes.push(scenePass);
        if (fx.bloom) {
          bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), fx.bloom.strength, fx.bloom.radius, fx.bloom.threshold);
          // One broken pixel (not a number, or endlessly bright) would be smeared over the whole picture: leave it out of the glow.
          bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
            'vec4 texel = texture2D( tDiffuse, vUv );',
            `vec4 texel = texture2D( tDiffuse, vUv );
            if ( ! ( texel.r >= 0.0 && texel.r < 60.0 && texel.g >= 0.0 && texel.g < 60.0 && texel.b >= 0.0 && texel.b < 60.0 ) ) texel = vec4( 0.0, 0.0, 0.0, 1.0 );`,
          );
          composer.addPass(bloom);
          passes.push(bloom);
        }
        output = outputPass();
        composer.addPass(output);
        const smooth = new FXAAPass();
        composer.addPass(smooth);
        passes.push(output, smooth);
      } catch {
        dropEffects();
      }
    }

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      if (composer) {
        composer.setPixelRatio(ratio);
        composer.setSize(width, height);
      }
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
        resize();
        slow = 0;
        fast = 0;
      } else if (slow > 40 && composer && wish === 'auto') {
        // Still too slow with the fewest pixels: go on without the effects.
        dropEffects();
        resize();
        slow = 0;
        fast = 0;
      } else if (fast > 240 && ratio < maxRatio) {
        ratio = Math.min(maxRatio, ratio * 1.1);
        resize();
        slow = 0;
        fast = 0;
      }
      stage.update(Math.min(0.05, elapsed / 1000));
      if (composer) {
        if (bloom && fx.bloom) {
          bloom.strength = fx.bloom.strength;
          bloom.radius = fx.bloom.radius;
          bloom.threshold = fx.bloom.threshold;
        }
        if (output) {
          output.uniforms.uVignette!.value = fx.vignette ?? 0.3;
          output.uniforms.toneMappingExposure!.value = renderer.toneMappingExposure;
        }
        composer.render();
      } else renderer.render(stage.scene, stage.camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      stage.dispose?.();
      dropEffects();
      disposeScene(stage.scene);
      renderer.dispose();
      renderer.forceContextLoss();
      current.current = null;
    };
  }, [canvasRef, key]);

  return current;
}
