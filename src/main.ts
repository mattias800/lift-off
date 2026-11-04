import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-900.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import { Game } from './game.ts';
import { Input } from './input.ts';
import { Renderer } from './render.ts';
import { AudioEngine } from './audio.ts';

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('game');
const game = new Game();
const input = new Input();
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
let paused = false;
let best = 0;
let resultDelay = 0;
let resultShown = false;
let accumulator = 0;
let previous = performance.now();
let padStartHeld = false;

try {
  best = Math.max(0, Number(localStorage.getItem('lift-off-best')) || 0);
} catch {
  /* Private browsing can deny storage. */
}
const updateBest = () => {
  element('best-score').textContent = `BEST ${String(best).padStart(6, '0')}`;
};
updateBest();

function start(): void {
  if (game.mode === 'won' || game.mode === 'lost') recordBest();
  void audio.unlock().catch(() => {
    element('sound').title = 'Audio unavailable in this browser';
  });
  input.clear();
  game.start();
  paused = false;
  resultDelay = 0;
  resultShown = false;
  accumulator = 0;
  element('overlay').hidden = true;
  element('result-overlay').hidden = true;
  element('pause-overlay').hidden = true;
  element('pause').hidden = false;
  element('announcer').textContent = 'Stop one. Fight your way to the rooftop.';
  canvas.focus({ preventScroll: true });
}

function pause(value = !paused): void {
  if (game.mode !== 'playing' && game.mode !== 'transition') return;
  paused = value;
  input.clear();
  accumulator = 0;
  element('pause-overlay').hidden = !paused;
  element('pause').hidden = paused;
  if (paused) element('resume').focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
}

function showResult(): void {
  resultShown = true;
  const won = game.mode === 'won';
  element('result-eyebrow').textContent = won ? 'EXPRESS SERVICE COMPLETE' : 'SERVICE INTERRUPTED';
  element('result-title').textContent = won ? 'ROOM AT THE TOP.' : 'GOING… DOWN.';
  element('result-description').textContent = won
    ? 'Fresh air. Finally. You made some room for yourself.'
    : 'Try a dodge when you see red. The rooftop is still up there.';
  element('result-score').textContent = String(game.score).padStart(6, '0');
  element('result-combo').textContent = `${game.bestCombo} HITS`;
  element('result-time').textContent =
    `${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  element('result-overlay').hidden = false;
  element('pause').hidden = true;
  element('announcer').textContent =
    `${won ? 'You won!' : 'Game over.'} Score ${game.score}. Best combo ${game.bestCombo}.`;
  recordBest();
  element('restart').focus({ preventScroll: true });
}

function recordBest(): void {
  if (game.score > best) {
    best = game.score;
    updateBest();
    try {
      localStorage.setItem('lift-off-best', String(best));
    } catch {
      /* Score still works for the session. */
    }
  }
}

function toggleSound(): void {
  void audio.unlock().catch(() => {});
  const enabled = audio.toggle();
  element('sound').innerHTML = enabled ? '♪ <span>SOUND ON</span>' : '♪ <span>SOUND OFF</span>';
  element('sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
}
async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      // Keep the touch pad visible on phones; desktop gets just the cabinet.
      const target = window.matchMedia('(pointer: coarse)').matches
        ? document.documentElement
        : element('cabinet');
      await target.requestFullscreen();
    }
  } catch {
    element('fullscreen').title = 'Fullscreen unavailable in this browser';
  }
}

element('start').addEventListener('click', start);
element('restart').addEventListener('click', start);
element('pause').addEventListener('click', () => pause(true));
element('resume').addEventListener('click', () => pause(false));
element('sound').addEventListener('click', toggleSound);
element('fullscreen').addEventListener('click', () => void fullscreen());
document.addEventListener('fullscreenchange', () =>
  element('fullscreen').setAttribute(
    'aria-label',
    document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen',
  ),
);
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Enter') {
    // Leave native button activation to the browser to avoid handling it twice.
    if (document.activeElement instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (game.mode === 'intro' || game.mode === 'won' || game.mode === 'lost') start();
    else if (paused) pause(false);
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    pause();
  }
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyF') void fullscreen();
});
window.addEventListener('blur', () => pause(true));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(true);
});

function frame(now: number): void {
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  let padStart = false;
  for (const pad of navigator.getGamepads?.() ?? []) padStart ||= pad?.buttons[9]?.pressed ?? false;
  if (padStart && !padStartHeld) {
    if (game.mode === 'intro' || game.mode === 'won' || game.mode === 'lost') start();
    else pause();
  }
  padStartHeld = padStart;
  if (!paused) {
    accumulator += dt;
    const controls = input.read();
    while (accumulator >= 1 / 60) {
      game.update(1 / 60, controls);
      accumulator -= 1 / 60;
    }
    const events = game.drainEvents();
    renderer.handle(events);
    for (const event of events) {
      audio.event(event);
      if (event.type === 'floor') element('announcer').textContent = `Stop ${event.value} of four.`;
    }
    if ((game.mode === 'won' || game.mode === 'lost') && !resultShown) {
      resultDelay += dt;
      if (resultDelay > 0.9) showResult();
    }
  }
  audio.update(!paused && game.mode === 'playing', game.floor);
  renderer.draw(game, dt, paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only diagnostics make automated smoke tests possible without a cheat API.
Object.defineProperty(window, '__LIFT_OFF__', {
  get: () => ({
    mode: game.mode,
    paused,
    floor: game.floor + 1,
    health: game.hero.hp,
    score: game.score,
    combo: game.combo,
    burst: game.burst,
    remaining: game.remaining,
    hero: { x: game.hero.x, y: game.hero.y, state: game.hero.state },
    enemies: game.enemies
      .filter((e) => e.hp > 0)
      .map((e) => ({ x: e.x, y: e.y, hp: e.hp, kind: e.kind, state: e.state })),
    time: game.time,
  }),
});
