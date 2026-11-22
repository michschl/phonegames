import * as THREE from 'three';
import { onDispose } from './engine.ts';

/*
 * The effects the Arena games share: a sky drawn by a shader (sun, clouds, stars, northern lights), its
 * light as reflections on shiny things, particles, glowing trails, confetti and a camera shake.
 * All shaders write scene light and leave the mapping to the screen to three.js, so they look the same with
 * and without the passes of engine.ts.
 */

const NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * noise(p);
      p = p * 2.03 + 17.0;
      amp *= 0.5;
    }
    return sum;
  }
`;

/** GLSL noise for the shaders of the games (`hash12`, `hash13`, `noise`, `fbm`). */
export const GLSL_NOISE = NOISE;

/* ------------------------------------------------------------------ sky */

export interface SkyLook {
  top: string;
  horizon: string;
  /** Below the horizon (default: the horizon colour). */
  bottom?: string;
  sun?: { dir: [number, number, number]; color?: string; size?: number; glow?: number };
  /** Brightness of the stars, 0–1. */
  stars?: number;
  /** How much of the sky the clouds cover, 0–1. */
  clouds?: number;
  cloudColor?: string;
  /** Northern lights, 0–1. */
  aurora?: number;
  intensity?: number;
}

/** A sky around the camera: gradient, sun with halo, drifting clouds, twinkling stars, northern lights. */
export class Sky extends THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  constructor(look: SkyLook) {
    const sun = look.sun;
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(look.top) },
        uHorizon: { value: new THREE.Color(look.horizon) },
        uBottom: { value: new THREE.Color(look.bottom ?? look.horizon) },
        uSunDir: { value: new THREE.Vector3(...(sun?.dir ?? [0, 1, 0])).normalize() },
        uSunColor: { value: new THREE.Color(sun?.color ?? '#ffffff').multiplyScalar(sun ? 1 : 0) },
        uSunSize: { value: sun?.size ?? 0.0012 },
        uSunGlow: { value: sun?.glow ?? 1 },
        uStars: { value: look.stars ?? 0 },
        uClouds: { value: look.clouds ?? 0 },
        uCloudColor: { value: new THREE.Color(look.cloudColor ?? '#ffffff') },
        uAurora: { value: look.aurora ?? 0 },
        uIntensity: { value: look.intensity ?? 1 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          // Only the rotation of the camera counts: the sky is always far away.
          vec4 p = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunSize;
        uniform float uSunGlow;
        uniform float uStars;
        uniform float uClouds;
        uniform vec3 uCloudColor;
        uniform float uAurora;
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uBottom, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, s) * 9.0 + (pow(s, 64.0) * 0.7 + pow(s, 7.0) * 0.2) * uSunGlow);
          if (uStars > 0.0 && h > -0.1) {
            vec3 p = d * 80.0;
            vec3 id = floor(p);
            float n = hash13(id);
            vec3 f = fract(p) - 0.5 - (vec3(hash13(id + 7.0), hash13(id + 13.0), hash13(id + 19.0)) - 0.5) * 0.5;
            float star = smoothstep(0.22, 0.0, length(f)) * step(0.982, n);
            float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + n * 4.0) + n * 90.0);
            col += star * twinkle * uStars * 3.0 * mix(vec3(0.75, 0.87, 1.0), vec3(1.0, 0.88, 0.7), fract(n * 17.0));
          }
          if (uClouds > 0.0 && h > 0.0) {
            vec2 uv = d.xz / (h + 0.14) * 0.8 + vec2(uTime * 0.012, 0.0);
            float c = fbm(uv * 1.4);
            float m = smoothstep(1.0 - uClouds, 1.25 - uClouds, c) * smoothstep(0.0, 0.14, h);
            vec3 lit = uCloudColor * (0.82 + 0.3 * fbm(uv * 3.1 + 5.0)) + uSunColor * pow(s, 10.0) * 0.6;
            col = mix(col, lit, m * 0.9);
          }
          if (uAurora > 0.0 && h > 0.02) {
            float a = atan(d.x, -d.z);
            float wave = fbm(vec2(a * 1.6 + uTime * 0.04, uTime * 0.03));
            float curtain = smoothstep(0.38, 0.72, fbm(vec2(a * 2.6 - uTime * 0.05, wave * 2.4)));
            float band = smoothstep(0.015, 0.09, h) * smoothstep(0.7, 0.16, h + wave * 0.25);
            float rays = 0.55 + 0.45 * sin(a * 46.0 + fbm(vec2(a * 9.0, uTime * 0.25)) * 7.0);
            vec3 hue = mix(vec3(0.1, 1.0, 0.5), vec3(0.6, 0.25, 1.0), smoothstep(0.18, 0.6, h));
            col += hue * curtain * band * rays * uAurora * 1.8;
          }
          gl_FragColor = vec4(col * uIntensity, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(new THREE.SphereGeometry(50, 32, 20), material);
    this.frustumCulled = false;
    this.renderOrder = -1000;
  }

  /** Lets clouds drift and stars twinkle. */
  tick(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }
}

/** The light of a sky as reflections and soft fill light on all standard materials of the scene. */
export function environmentFrom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, look: SkyLook, intensity = 1): void {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const sky = new Sky({ ...look, stars: 0, clouds: 0, aurora: 0 });
  room.add(sky);
  const target = generator.fromScene(room, 0.03);
  scene.environment = target.texture;
  scene.environmentIntensity = intensity;
  sky.geometry.dispose();
  sky.material.dispose();
  generator.dispose();
  onDispose(scene, () => target.dispose());
}

/* ------------------------------------------------------------------ glow */

let glowCanvas: HTMLCanvasElement | null = null;

/** A soft white dot; sprites and particles tint it. */
export function softDot(): THREE.CanvasTexture {
  if (!glowCanvas) {
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(glowCanvas);
}

/** A light that glows: an additive sprite; `intensity` above 1 makes it bloom. */
export function glow(color: THREE.ColorRepresentation, size: number, intensity = 1): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: softDot(),
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

/** A colour brighter than white paper: it glows with bloom. */
export function hdr(color: THREE.ColorRepresentation, intensity: number): THREE.Color {
  return new THREE.Color(color).multiplyScalar(intensity);
}

/* ------------------------------------------------------------------ particles */

export interface EmitOptions {
  /** Size at the end of the life (default: shrinks to nothing). */
  endSize?: number;
  alpha?: number;
  /** Acceleration downwards (negative: rises). */
  gravity?: number;
  /** Slows down, per second. */
  drag?: number;
  /** Brighter than the colour (glows with bloom). */
  intensity?: number;
}

export interface BurstOptions extends EmitOptions {
  speed?: [number, number];
  life?: [number, number];
  size?: [number, number];
  /** Extra push upwards. */
  up?: number;
  /** Only this far around a direction (radians); default: all around. */
  cone?: { dir: THREE.Vector3; angle: number };
}

const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();
const scratchColor = new THREE.Color();

/** A pool of soft dots that fly, fall and fade: sparks, snow dust, smoke, embers. The oldest make room. */
export class Particles extends THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  private readonly max: number;
  private cursor = 0;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  /** Per particle: age, life, start size, end size, start alpha, gravity, drag. */
  private readonly state: Float32Array;
  private alive = 0;

  constructor(max = 300, { additive = true, sharp = 1.6 }: { additive?: boolean; sharp?: number } = {}) {
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3);
    const col = new Float32Array(max * 4);
    const size = new Float32Array(max);
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 300 }, uSharp: { value: sharp } },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uScale / max(-mv.z, 0.01), 220.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uSharp;
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(1.0 - d, 0.0), uSharp) * vColor.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(geometry, material);
    this.max = max;
    this.pos = pos;
    this.col = col;
    this.size = size;
    this.vel = new Float32Array(max * 3);
    this.state = new Float32Array(max * 7);
    this.frustumCulled = false;
    const buffer = new THREE.Vector2();
    // World sizes become pixels: by the height of the picture and the opening of the camera.
    this.onBeforeRender = (renderer, _scene, camera) => {
      const target = renderer.getRenderTarget();
      const height = target ? target.height : renderer.getDrawingBufferSize(buffer).y;
      material.uniforms.uScale!.value = height * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
    };
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.ColorRepresentation, options: EmitOptions = {}): void {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    scratchColor.set(color).multiplyScalar(options.intensity ?? 1);
    this.col.set([scratchColor.r, scratchColor.g, scratchColor.b, 0], i * 4);
    this.state.set([0, life, size, options.endSize ?? 0, options.alpha ?? 1, options.gravity ?? 0, options.drag ?? 0], i * 7);
    this.alive = Math.max(this.alive, 1);
  }

  /** Many at once from one point. */
  burst(origin: { x: number; y: number; z: number }, count: number, colors: THREE.ColorRepresentation[], options: BurstOptions = {}): void {
    const [s0, s1] = options.speed ?? [1, 3];
    const [l0, l1] = options.life ?? [0.4, 0.9];
    const [z0, z1] = options.size ?? [0.1, 0.25];
    for (let n = 0; n < count; n++) {
      if (options.cone) {
        scratch.randomDirection().multiplyScalar(Math.tan(options.cone.angle) * Math.random());
        scratch.add(scratch2.copy(options.cone.dir).normalize()).normalize();
      } else scratch.randomDirection();
      const speed = s0 + Math.random() * (s1 - s0);
      this.emit(
        origin.x,
        origin.y,
        origin.z,
        scratch.x * speed,
        scratch.y * speed + (options.up ?? 0),
        scratch.z * speed,
        l0 + Math.random() * (l1 - l0),
        z0 + Math.random() * (z1 - z0),
        colors[n % colors.length]!,
        options,
      );
    }
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    const { pos, vel, col, size, state } = this;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const s = i * 7;
      const life = state[s + 1]!;
      if (life <= 0) continue;
      const age = state[s]! + dt;
      const v = i * 3;
      if (age >= life) {
        state[s + 1] = 0;
        size[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      state[s] = age;
      const slow = Math.max(0, 1 - state[s + 6]! * dt);
      vel[v] = vel[v]! * slow;
      vel[v + 1] = vel[v + 1]! * slow - state[s + 5]! * dt;
      vel[v + 2] = vel[v + 2]! * slow;
      pos[v] = pos[v]! + vel[v]! * dt;
      pos[v + 1] = pos[v + 1]! + vel[v + 1]! * dt;
      pos[v + 2] = pos[v + 2]! + vel[v + 2]! * dt;
      const t = age / life;
      size[i] = state[s + 2]! + (state[s + 3]! - state[s + 2]!) * t;
      // Appear quickly, fade slowly.
      col[i * 4 + 3] = state[s + 4]! * Math.min(1, t * 12) * (1 - t) ** 1.4;
    }
    this.alive = alive;
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.aColor!.needsUpdate = true;
    this.geometry.attributes.aSize!.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ trail */

/** A glowing ribbon that follows a moving thing and always faces the camera. */
export class Trail extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  private readonly points: Float32Array;
  private readonly length: number;
  private readonly width: number;
  private filled = 0;
  private acc = 0;
  private readonly side = new THREE.Vector3(1, 0, 0);
  private readonly rgb: THREE.Color;

  constructor(
    length = 32,
    width = 0.3,
    color: THREE.ColorRepresentation = '#ffffff',
    { additive = true, intensity = 1, opacity = 1 }: { additive?: boolean; intensity?: number; opacity?: number } = {},
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(length * 6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(length * 8), 4));
    const index: number[] = [];
    for (let i = 0; i < length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    super(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.length = length;
    this.width = width;
    this.points = new Float32Array(length * 3);
    this.rgb = new THREE.Color(color).multiplyScalar(intensity);
    this.frustumCulled = false;
  }

  reset(): void {
    this.filled = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Every frame: where the thing is now. */
  follow(x: number, y: number, z: number, dt: number, camera: { position: THREE.Vector3 }): void {
    const p = this.points;
    this.acc += dt;
    if (this.filled === 0 || this.acc >= 1 / 60) {
      this.acc = 0;
      p.copyWithin(3, 0, (this.length - 1) * 3);
      this.filled = Math.min(this.length, this.filled + 1);
    }
    p[0] = x;
    p[1] = y;
    p[2] = z;
    const n = this.filled;
    const position = this.geometry.attributes.position as THREE.BufferAttribute;
    const color = this.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0) * 3;
      const b = Math.min(i + 1, n - 1) * 3;
      scratch.set(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!);
      scratch2.set(camera.position.x - p[i * 3]!, camera.position.y - p[i * 3 + 1]!, camera.position.z - p[i * 3 + 2]!);
      scratch.cross(scratch2);
      if (scratch.lengthSq() > 1e-10) this.side.copy(scratch.normalize());
      const fade = 1 - i / (this.length - 1);
      const w = this.width * 0.5 * fade;
      position.setXYZ(i * 2, p[i * 3]! + this.side.x * w, p[i * 3 + 1]! + this.side.y * w, p[i * 3 + 2]! + this.side.z * w);
      position.setXYZ(i * 2 + 1, p[i * 3]! - this.side.x * w, p[i * 3 + 1]! - this.side.y * w, p[i * 3 + 2]! - this.side.z * w);
      const alpha = fade * fade;
      color.setXYZW(i * 2, this.rgb.r, this.rgb.g, this.rgb.b, alpha);
      color.setXYZW(i * 2 + 1, this.rgb.r, this.rgb.g, this.rgb.b, alpha);
    }
    position.needsUpdate = true;
    color.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
}

/* ------------------------------------------------------------------ confetti */

const CONFETTI = ['#ff4f6d', '#ffd23f', '#2ec5ff', '#9be15d', '#a46bff', '#ff8a3d', '#ffffff'];
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();

/** Paper snippets shot up from both lower corners of the picture; they tumble down in front of everything. */
export class Confetti extends THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  /** Per piece: x y z, vx vy vz, rx ry rz, wx wy wz, age, phase. */
  private readonly state: Float32Array;
  private readonly base: THREE.Color[] = [];
  private readonly pieces: number;
  private running = false;
  private unit = 1;

  constructor(pieces = 140) {
    super(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false }), pieces);
    this.pieces = pieces;
    this.state = new Float32Array(pieces * 14);
    this.frustumCulled = false;
    this.renderOrder = 999;
    this.visible = false;
    for (let i = 0; i < pieces; i++) {
      this.base.push(new THREE.Color(CONFETTI[i % CONFETTI.length]!));
      this.setColorAt(i, this.base[i]!);
    }
  }

  /** Fires. The pieces live in the picture of this camera, wherever it looks. */
  burst(camera: THREE.PerspectiveCamera, scene: THREE.Scene): void {
    if (!camera.parent) scene.add(camera);
    if (this.parent !== camera) camera.add(this);
    const dist = Math.max(camera.near * 4, 4);
    const halfH = dist * Math.tan((camera.fov * Math.PI) / 360);
    const halfW = halfH * camera.aspect;
    this.unit = halfH;
    const s = this.state;
    for (let i = 0; i < this.pieces; i++) {
      const o = i * 14;
      const left = i % 2 === 0;
      s[o] = (left ? -1 : 1) * halfW * (0.9 + Math.random() * 0.2);
      s[o + 1] = -halfH * (1.02 + Math.random() * 0.1);
      s[o + 2] = -dist - Math.random() * 0.5;
      s[o + 3] = (left ? 1 : -1) * halfW * (0.3 + Math.random() * 1.9);
      s[o + 4] = halfH * (2.8 + Math.random() * 2.2);
      s[o + 5] = 0;
      for (let k = 6; k < 9; k++) s[o + k] = Math.random() * Math.PI * 2;
      for (let k = 9; k < 12; k++) s[o + k] = (Math.random() - 0.5) * 14;
      s[o + 12] = -Math.random() * 0.25;
      s[o + 13] = Math.random() * Math.PI * 2;
    }
    this.running = true;
    this.visible = true;
  }

  update(dt: number): void {
    if (!this.running) return;
    const s = this.state;
    const u = this.unit;
    let alive = 0;
    for (let i = 0; i < this.pieces; i++) {
      const o = i * 14;
      s[o + 12] = s[o + 12]! + dt;
      const age = s[o + 12]!;
      if (age < 0) {
        scale.setScalar(0);
      } else {
        const falling = s[o + 4]! < 0;
        const drag = Math.max(0, 1 - (falling ? 3.2 : 1.1) * dt);
        s[o + 3] = s[o + 3]! * Math.max(0, 1 - 1.4 * dt) + Math.sin(age * 5 + s[o + 13]!) * u * 0.9 * dt;
        s[o + 4] = s[o + 4]! * drag - u * 3.4 * dt;
        s[o] = s[o]! + s[o + 3]! * dt;
        s[o + 1] = s[o + 1]! + s[o + 4]! * dt;
        for (let k = 0; k < 3; k++) s[o + 6 + k] = s[o + 6 + k]! + s[o + 9 + k]! * dt;
        const gone = age > 5 || s[o + 1]! < -u * 1.3;
        if (!gone) alive++;
        scale.set(u * 0.045, u * 0.075, 1).multiplyScalar(gone ? 0 : 1);
      }
      euler.set(s[o + 6]!, s[o + 7]!, s[o + 8]!);
      quaternion.setFromEuler(euler);
      matrix.compose(scratch.set(s[o]!, s[o + 1]!, s[o + 2]!), quaternion, scale);
      this.setMatrixAt(i, matrix);
      // A piece is brightest when it faces the viewer.
      const facing = Math.abs(Math.cos(s[o + 6]!) * Math.cos(s[o + 7]!));
      this.setColorAt(i, scratchColor.copy(this.base[i]!).multiplyScalar(0.5 + 0.7 * facing));
    }
    this.instanceMatrix.needsUpdate = true;
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
    if (alive === 0) {
      this.running = false;
      this.visible = false;
    }
  }
}

/* ------------------------------------------------------------------ shake */

/** A jolt of the camera that dies down. Apply after the camera is placed for the frame. */
export class Shake {
  private trauma = 0;
  private time = 0;

  kick(amount = 0.5): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  apply(camera: THREE.Camera, dt: number, strength = 0.25): void {
    if (this.trauma <= 0) return;
    this.time += dt * 38;
    const k = this.trauma * this.trauma * strength;
    camera.position.x += (Math.sin(this.time * 1.3) + Math.sin(this.time * 2.9 + 1.7)) * 0.5 * k;
    camera.position.y += (Math.sin(this.time * 1.7 + 4.1) + Math.sin(this.time * 3.3)) * 0.5 * k;
    camera.rotation.z += Math.sin(this.time * 2.1 + 2.2) * k * 0.08;
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
  }
}

/* ------------------------------------------------------------------ nebula */

export interface NebulaLook {
  deep: string;
  a: string;
  b: string;
  c: string;
  seed?: number;
  /** How large the clouds are (smaller number: larger clouds). */
  scale?: number;
  stars?: number;
}

/** Deep space on a large plane: slowly drifting clouds of gas in three colours, dust lanes and stars. */
export class Nebula extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(size: number, look: NebulaLook) {
    const material = new THREE.ShaderMaterial({
      depthWrite: false,
      fog: false,
      uniforms: {
        uDeep: { value: new THREE.Color(look.deep) },
        uA: { value: new THREE.Color(look.a) },
        uB: { value: new THREE.Color(look.b) },
        uC: { value: new THREE.Color(look.c) },
        uSeed: { value: look.seed ?? 1 },
        uScale: { value: (look.scale ?? 1) * 0.02 },
        uStars: { value: look.stars ?? 1 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        varying vec2 vUv;
        void main() {
          vPos = position.xy;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uA;
        uniform vec3 uB;
        uniform vec3 uC;
        uniform float uSeed;
        uniform float uScale;
        uniform float uStars;
        uniform float uTime;
        varying vec2 vPos;
        varying vec2 vUv;
        ${NOISE}
        float stars(vec2 p, float density, float radius) {
          vec2 id = floor(p);
          float n = hash12(id);
          vec2 f = fract(p) - 0.5 - (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.6;
          float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + n * 5.0) + n * 70.0);
          return smoothstep(radius, 0.0, length(f)) * step(1.0 - density, n) * twinkle;
        }
        void main() {
          vec2 p = vPos * uScale + uSeed * 3.7;
          float t = uTime * 0.012;
          vec2 warp = vec2(fbm(p + t), fbm(p * 1.1 - t + 40.0));
          float n1 = fbm(p * 1.1 + warp * 1.7);
          float n2 = fbm(p * 2.2 - warp * 1.3 + 31.0);
          vec3 col = uDeep;
          col += uA * pow(n1, 3.0) * 0.55;
          col += uB * pow(n2, 3.4) * 0.7;
          col += uC * pow(n1 * n2 * 2.3, 4.0) * 0.5;
          col *= 0.35 + 0.65 * smoothstep(0.25, 0.62, fbm(p * 3.1 + 9.0));
          vec2 s = vPos * 0.6;
          float star = stars(s, 0.035, 0.13) * 1.2 + stars(s * 0.37 + 11.0, 0.05, 0.1) * 3.5;
          col += star * uStars * mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash12(floor(s * 0.37)));
          // The plane ends in the dark.
          col *= smoothstep(0.5, 0.36, length(vUv - 0.5));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(new THREE.PlaneGeometry(size, size), material);
    this.rotation.x = -Math.PI / 2;
    this.frustumCulled = false;
    this.renderOrder = -900;
  }

  tick(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }
}

/* ------------------------------------------------------------------ water and lava */

export interface WaterLook {
  deep: string;
  shallow: string;
  /** What the surface mirrors at a flat angle. */
  sky: string;
  /** The colour it fades to far away. */
  horizon: string;
  foam?: string;
  sun: [number, number, number];
  sunColor?: string;
  /** A sea of lava: dark crust with glowing cracks instead of waves. */
  lava?: boolean;
}

/** A sea to the horizon: rolling waves with glints of the sun and foam on the crests – or glowing lava. */
export class Water extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  constructor(size: number, look: WaterLook) {
    const material = new THREE.ShaderMaterial({
      fog: false,
      uniforms: {
        uDeep: { value: new THREE.Color(look.deep) },
        uShallow: { value: new THREE.Color(look.shallow) },
        uSky: { value: new THREE.Color(look.sky) },
        uHorizon: { value: new THREE.Color(look.horizon) },
        uFoam: { value: new THREE.Color(look.foam ?? '#ffffff') },
        uSunDir: { value: new THREE.Vector3(...look.sun).normalize() },
        uSunColor: { value: new THREE.Color(look.sunColor ?? '#ffffff') },
        uLava: { value: look.lava ? 1 : 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        uniform vec3 uHorizon;
        uniform vec3 uFoam;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uLava;
        uniform float uTime;
        varying vec3 vWorld;
        ${NOISE}
        float waves(vec2 p) {
          float t = uTime;
          return noise(p * 0.55 + vec2(t * 0.35, t * 0.2)) * 0.6 + noise(p * 1.6 - vec2(t * 0.5, -t * 0.3)) * 0.3 + noise(p * 4.3 + t * 0.8) * 0.1;
        }
        void main() {
          vec2 p = vWorld.xz;
          vec3 v = normalize(cameraPosition - vWorld);
          float far = smoothstep(30.0, 170.0, length(vWorld.xz - cameraPosition.xz));
          vec3 col;
          if (uLava > 0.5) {
            float t = uTime;
            float flow = fbm(p * 0.22 + vec2(t * 0.02, -t * 0.015));
            float crack = abs(fbm(p * 0.42 + flow * 1.6 + t * 0.012) - 0.5);
            float hot = smoothstep(0.016, 0.0, crack);
            float warm = smoothstep(0.075, 0.0, crack);
            vec3 crust = uDeep * (0.35 + flow * 0.9);
            col = crust + uShallow * warm * warm * 0.75 + uSunColor * hot * (1.9 + 0.7 * sin(t * 1.4 + flow * 9.0));
          } else {
            float e = 0.14;
            float h = waves(p);
            vec3 n = normalize(vec3(h - waves(p + vec2(e, 0.0)), e * 1.5, h - waves(p + vec2(0.0, e))));
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            col = mix(uDeep, uShallow, smoothstep(0.32, 0.74, h));
            col = mix(col, uSky, fresnel * 0.65);
            // Glints only on the steepest little waves, so the sea glitters instead of glaring.
            float glint = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 700.0) * step(0.62, noise(p * 9.0 + uTime * 1.3));
            col += uSunColor * glint * 3.2;
            col = mix(col, uFoam, smoothstep(0.74, 0.82, h) * 0.4);
          }
          col = mix(col, uHorizon, far);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    super(new THREE.PlaneGeometry(size, size), material);
    this.rotation.x = -Math.PI / 2;
    this.frustumCulled = false;
  }

  tick(time: number): void {
    this.material.uniforms.uTime!.value = time;
  }
}

/** A fine grain to lay over a colour, so that large faces do not look flat. */
export function grainTexture(strength = 0.14, size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 255 * (1 - strength * Math.random());
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
