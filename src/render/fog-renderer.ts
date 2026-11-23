import { type Container, GlProgram, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';
import { createCanvas } from './pixel-canvas';
import { mapWorldBounds } from './iso';

/**
 * Niebla de guerra: negra donde nunca se ha visto, oscurecida donde se vio pero ahora no hay nadie y nada
 * donde se ve. Se dibuja con un único rectángulo y un shader que lee el estado de cada casilla de una textura
 * pequeña (una casilla = un texel) y, entre casillas, interpola, deforma un poco el borde con ruido y lo trama
 * con una matriz de Bayer fija al mundo: el borde queda suave, en pixel art, sin rombos.
 * Solo se sube la textura cuando cambia algo.
 */

const VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}
`;

const FRAGMENT = /* glsl */ `#version 300 es
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uFog;
uniform vec2 uMapSize;
uniform vec3 uFogColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Estado de una casilla: 0 sin explorar, 0.5 explorada, 1 a la vista (fuera del mapa, sin explorar).
float stateAt(vec2 t) {
  if (t.x < 0.0 || t.y < 0.0 || t.x >= uMapSize.x || t.y >= uMapSize.y) return 0.0;
  return texture(uFog, (t + 0.5) / uMapSize).r;
}

// Umbral de Bayer 4×4 (0–1) sin tablas: el de 2×2 aplicado a dos escalas.
float bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer(vec2 p) {
  return bayer2(0.5 * p) * 0.25 + bayer2(p) + 1.0 / 32.0;
}

void main() {
  vec2 px = floor(vWorld);
  vec2 c = px + 0.5;
  // Píxel del mundo -> casilla continua (inversa de la proyección 2:1).
  vec2 t = vec2((c.y / 8.0 + c.x / 16.0) * 0.5, (c.y / 8.0 - c.x / 16.0) * 0.5);
  t += (vec2(vnoise(t * 0.8), vnoise(t * 0.8 + 17.3)) - 0.5) * 0.7;
  // Interpolación entre los centros de las casillas.
  vec2 g = t - 0.5;
  vec2 i = floor(g);
  vec2 f = fract(g);
  float v = mix(mix(stateAt(i), stateAt(i + vec2(1.0, 0.0)), f.x), mix(stateAt(i + vec2(0.0, 1.0)), stateAt(i + vec2(1.0, 1.0)), f.x), f.y);
  // Tramado entre los tres niveles.
  float lv = clamp(v * 2.0, 0.0, 2.0);
  float lo = floor(lv);
  float level = fract(lv) > bayer(px) ? lo + 1.0 : lo;
  float alpha = level >= 2.0 ? 0.0 : (level >= 1.0 ? 0.5 : 1.0);
  finalColor = vec4(uFogColor * alpha, alpha);
}
`;

export class FogRenderer {
  private readonly state: Uint8Array;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly texture: Texture;

  constructor(
    layer: Container,
    private readonly width: number,
    private readonly height: number,
  ) {
    // 1 no es ningún estado: así la primera actualización escribe todas las casillas.
    this.state = new Uint8Array(width * height).fill(1);
    const { canvas, ctx } = createCanvas(width, height);
    this.ctx = ctx;
    this.image = ctx.createImageData(width, height);
    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'nearest';

    // Rectángulo que cubre todo el mapa (con margen), en píxeles del mundo.
    const b = mapWorldBounds(width, height);
    const m = 64;
    const geometry = new MeshGeometry({
      positions: new Float32Array([b.minX - m, b.minY - m, b.maxX + m, b.minY - m, b.maxX + m, b.maxY + m, b.minX - m, b.maxY + m]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = new Shader({
      glProgram: new GlProgram({ name: 'fog-of-war', vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        uFog: this.texture.source,
        fogUniforms: {
          uMapSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
          uFogColor: { value: new Float32Array([12 / 255, 8 / 255, 6 / 255]), type: 'vec3<f32>' },
        },
      },
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.eventMode = 'none';
    layer.addChild(mesh);
  }

  /** `null` = mostrar todo (depuración). */
  update(vision: { visible: Uint8Array; explored: Uint8Array } | null): void {
    const n = this.width * this.height;
    let changed = false;
    const data = this.image.data;
    for (let i = 0; i < n; i++) {
      const s = !vision || vision.visible[i] ? 255 : vision.explored[i] ? 128 : 0;
      if (s === this.state[i]) continue;
      this.state[i] = s;
      data[i * 4] = s;
      data[i * 4 + 3] = 255;
      changed = true;
    }
    if (!changed) return;
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
  }
}
