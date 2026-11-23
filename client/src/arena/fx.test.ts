import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Confetti, hdr, onDispose, Particles, Shake, Trail } from './fx.ts';

describe('Arena effects', () => {
  it('particles fly, fall, fade and die; the oldest make room', () => {
    const pool = new Particles(4);
    const position = pool.geometry.attributes.position as THREE.BufferAttribute;
    const color = pool.geometry.attributes.aColor as THREE.BufferAttribute;
    const size = pool.geometry.attributes.aSize as THREE.BufferAttribute;
    pool.emit(0, 0, 0, 2, 0, 0, 1, 0.5, '#ffffff', { gravity: 10 });
    pool.update(0.1);
    expect(position.getX(0)).toBeCloseTo(0.2);
    expect(position.getY(0)).toBeLessThan(0);
    expect(color.getW(0)).toBeGreaterThan(0.5);
    expect(size.getX(0)).toBeCloseTo(0.45);
    pool.update(0.8);
    expect(color.getW(0)).toBeLessThan(0.1);
    pool.update(0.2);
    expect(size.getX(0)).toBe(0);
    expect(color.getW(0)).toBe(0);
    // More than the pool holds: after the last place it goes on at the first, over the oldest.
    for (let i = 0; i < 6; i++) pool.emit(i, 0, 0, 0, 0, 0, 5, 1, '#ff0000');
    pool.update(0.01);
    expect([0, 1, 2, 3].map((i) => position.getX(i))).toEqual([3, 4, 5, 2]);
  });

  it('a burst sends particles in all directions, or only into a cone', () => {
    const pool = new Particles(64);
    pool.burst({ x: 1, y: 2, z: 3 }, 64, ['#ffffff'], { speed: [2, 2], life: [1, 1], cone: { dir: new THREE.Vector3(0, 1, 0), angle: 0.3 } });
    pool.update(0.5);
    const position = pool.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 64; i++) {
      expect(position.getY(i)).toBeGreaterThan(2.8);
      expect(Math.hypot(position.getX(i) - 1, position.getZ(i) - 3)).toBeLessThan(0.4);
    }
  });

  it('a colour above white stays in proportion', () => {
    const c = hdr('#ff8000', 2);
    expect(c.r).toBeCloseTo(2);
    expect(c.b).toBe(0);
  });

  it('a trail grows behind a moving point and starts again after a reset', () => {
    const trail = new Trail(8, 0.4, '#ffffff');
    const eye = { position: new THREE.Vector3(0, 10, 0) };
    for (let i = 0; i < 20; i++) trail.follow(i, 0, 0, 1 / 30, eye);
    expect(trail.geometry.drawRange.count).toBe(7 * 6);
    const position = trail.geometry.attributes.position as THREE.BufferAttribute;
    // The head is as wide as the trail and lies across the direction of travel.
    expect(position.getX(0)).toBeCloseTo(19);
    expect(Math.abs(position.getZ(0) - position.getZ(1))).toBeCloseTo(0.4);
    trail.reset();
    expect(trail.geometry.drawRange.count).toBe(0);
  });

  it('a shake moves the camera and dies down', () => {
    const camera = new THREE.PerspectiveCamera();
    const shake = new Shake();
    shake.apply(camera, 0.016);
    expect(camera.position.length()).toBe(0);
    shake.kick(1);
    shake.apply(camera, 0.016);
    expect(camera.position.length()).toBeGreaterThan(0);
    camera.position.set(0, 0, 0);
    for (let i = 0; i < 80; i++) shake.apply(camera, 0.016);
    camera.position.set(0, 0, 0);
    shake.apply(camera, 0.016);
    expect(camera.position.length()).toBe(0);
  });

  it('confetti rides with the camera and disappears when it has fallen', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 0.5, 0.1, 100);
    const confetti = new Confetti(20);
    scene.add(confetti);
    expect(confetti.visible).toBe(false);
    confetti.burst(camera, scene);
    expect(confetti.parent).toBe(camera);
    expect(camera.parent).toBe(scene);
    confetti.update(0.016);
    expect(confetti.visible).toBe(true);
    for (let i = 0; i < 400; i++) confetti.update(0.016);
    expect(confetti.visible).toBe(false);
  });

  it('what a scene registers is there to be freed at the end', () => {
    const scene = new THREE.Scene();
    let freed = 0;
    onDispose(scene, () => freed++);
    for (const free of scene.userData.disposers as (() => void)[]) free();
    expect(freed).toBe(1);
  });
});
