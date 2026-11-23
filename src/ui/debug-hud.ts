/** Panel de depuración en el DOM. Se refresca como mucho cada `intervalMs` para no tocar el DOM en cada fotograma. */
export class DebugHud {
  private elapsed = Infinity;
  private lastText = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly intervalMs = 200,
  ) {}

  update(frameMs: number, lines: () => string[]): void {
    this.elapsed += frameMs;
    if (this.elapsed < this.intervalMs) return;
    this.elapsed = 0;
    const text = lines().join('\n');
    if (text === this.lastText) return;
    this.el.textContent = text;
    this.lastText = text;
  }
}
