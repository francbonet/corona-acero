import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM, defaultZoom } from '../src/render/camera';

describe('Camera', () => {
  const W = 1280;
  const H = 720;

  it('el desplazamiento es siempre un número entero de píxeles', () => {
    const cam = new Camera(3);
    cam.centerOn(10.4, -7.6);
    const o = cam.offset(W, H);
    expect(Number.isInteger(o.x)).toBe(true);
    expect(Number.isInteger(o.y)).toBe(true);
  });

  it('screenToWorld del centro de pantalla devuelve el centro de la cámara', () => {
    const cam = new Camera(2);
    cam.centerOn(100, 50);
    expect(cam.screenToWorld(W / 2, H / 2, W, H)).toEqual({ x: 100, y: 50 });
  });

  it('zoomAt mantiene bajo el cursor el mismo punto del mundo', () => {
    const cam = new Camera(2);
    cam.centerOn(200, 120);
    const cursor = { x: 900, y: 200 };
    const before = cam.screenToWorld(cursor.x, cursor.y, W, H);
    expect(cam.zoomAt(4, cursor.x, cursor.y, W, H)).toBe(true);
    const after = cam.screenToWorld(cursor.x, cursor.y, W, H);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('el zoom es entero y está limitado', () => {
    const cam = new Camera(2);
    cam.zoomAt(99, 0, 0, W, H);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.zoomAt(-5, 0, 0, W, H);
    expect(cam.zoom).toBe(MIN_ZOOM);
    expect(cam.zoomAt(MIN_ZOOM, 0, 0, W, H)).toBe(false);
  });

  it('no se sale de los límites', () => {
    const cam = new Camera(2);
    cam.setBounds({ minX: -100, minY: 0, maxX: 100, maxY: 50 });
    cam.pan(1000, 1000);
    expect({ x: cam.x, y: cam.y }).toEqual({ x: 100, y: 50 });
    cam.pan(-5000, -5000);
    expect({ x: cam.x, y: cam.y }).toEqual({ x: -100, y: 0 });
  });

  it('elige un zoom inicial entero según la pantalla', () => {
    expect(defaultZoom(800, 600)).toBe(2);
    expect(defaultZoom(1920, 1080)).toBe(3);
    expect(defaultZoom(3840, 2160)).toBe(4);
  });
});
