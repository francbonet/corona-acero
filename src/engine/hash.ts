/** Hash FNV-1a incremental sobre enteros de 32 bits. Sirve para comparar estados de simulación (determinismo, desincronías). */
export class Fnv32 {
  private h = 0x811c9dc5;

  add(value: number): this {
    let v = value | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= v & 0xff;
      this.h = Math.imul(this.h, 0x01000193);
      v >>>= 8;
    }
    return this;
  }

  digest(): number {
    return this.h >>> 0;
  }
}
