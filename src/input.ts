import type { Controls } from './game.ts';

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyJ',
  'KeyK',
  'KeyL',
  'Space',
]);

export class Input {
  private keys = new Set<string>();
  private touches = new Map<number, string>();
  constructor() {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-key]')) {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        this.touches.set(e.pointerId, button.dataset.key!);
        this.keys.add(button.dataset.key!);
        button.classList.add('pressed');
      });
      const release = (e: PointerEvent) => {
        const key = this.touches.get(e.pointerId);
        this.touches.delete(e.pointerId);
        if (key && ![...this.touches.values()].includes(key)) this.keys.delete(key);
        button.classList.remove('pressed');
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }
  }
  clear(): void {
    this.keys.clear();
    this.touches.clear();
    document.querySelectorAll('.pressed').forEach((e) => e.classList.remove('pressed'));
  }
  read(): Controls {
    const down = (...codes: string[]) => codes.some((code) => this.keys.has(code));
    let x = Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft'));
    let y = Number(down('KeyS', 'ArrowDown')) - Number(down('KeyW', 'ArrowUp'));
    let punch = down('KeyJ'),
      kick = down('KeyK'),
      dodge = down('KeyL'),
      burst = down('Space');
    // Standard-mapped controllers: left stick/d-pad, X punch, A kick, B dodge, Y burst.
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const axis = (n: number) => (Math.abs(pad.axes[n] ?? 0) > 0.22 ? (pad.axes[n] ?? 0) : 0);
      x +=
        axis(0) +
        Number(pad.buttons[15]?.pressed ?? false) -
        Number(pad.buttons[14]?.pressed ?? false);
      y +=
        axis(1) +
        Number(pad.buttons[13]?.pressed ?? false) -
        Number(pad.buttons[12]?.pressed ?? false);
      punch ||= pad.buttons[2]?.pressed ?? false;
      kick ||= pad.buttons[0]?.pressed ?? false;
      dodge ||= pad.buttons[1]?.pressed ?? false;
      burst ||= pad.buttons[3]?.pressed ?? false;
    }
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
      punch,
      kick,
      dodge,
      burst,
    };
  }
}
