import { FLOORS, Game } from './game.ts';
import type { Actor, GameEvent } from './game.ts';

const C = {
  ink: '#15242d',
  dark: '#20343b',
  wall: '#3e6664',
  lime: '#d7fa70',
  cream: '#f1efce',
  pink: '#f47b8f',
  teal: '#82c9ab',
  orange: '#f3a76e',
};
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}
interface Ring {
  x: number;
  y: number;
  life: number;
  color: string;
  size: number;
}

/** All art is drawn at 480 × 300 and scaled without filtering. Character
 * pieces share a small palette and are posed from the simulation state. */
export class Renderer {
  private canvas = document.createElement('canvas');
  private c: CanvasRenderingContext2D;
  private output: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private rings: Ring[] = [];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(output: HTMLCanvasElement) {
    this.canvas.width = 480;
    this.canvas.height = 300;
    this.c = this.canvas.getContext('2d')!;
    this.output = output.getContext('2d')!;
    this.output.imageSmoothingEnabled = false;
  }

  private rect(x: number, y: number, w: number, h: number, fill: string): void {
    this.c.fillStyle = fill;
    this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  private text(
    text: string,
    x: number,
    y: number,
    color = C.cream,
    size = 7,
    align: CanvasTextAlign = 'left',
  ): void {
    this.c.font = `bold ${size}px monospace`;
    this.c.textAlign = align;
    this.c.textBaseline = 'top';
    this.c.fillStyle = C.ink;
    this.c.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
    this.c.fillStyle = color;
    this.c.fillText(text, Math.round(x), Math.round(y));
  }
  private line(x: number, y: number, xx: number, yy: number, color: string, width = 1): void {
    this.c.beginPath();
    this.c.moveTo(x, y);
    this.c.lineTo(xx, yy);
    this.c.lineWidth = width;
    this.c.strokeStyle = color;
    this.c.stroke();
  }
  private polygon(points: number[][], color: string): void {
    this.c.beginPath();
    points.forEach(([x, y], i) => (i ? this.c.lineTo(x, y) : this.c.moveTo(x, y)));
    this.c.closePath();
    this.c.fillStyle = color;
    this.c.fill();
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      const hit = e.type === 'hit' || e.type === 'damage' || e.type === 'wall';
      if (hit || e.type === 'kill' || e.type === 'burst' || e.type === 'slam') {
        const color = e.type === 'damage' ? C.pink : e.type === 'wall' ? C.orange : C.lime;
        const count = this.reducedMotion
          ? 4
          : e.type === 'burst'
            ? 38
            : e.type === 'kill'
              ? 18
              : 12;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2,
            speed = 15 + Math.random() * 85;
          const life = 0.2 + Math.random() * 0.35;
          this.particles.push({
            x: e.x,
            y: e.y - 24,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            life,
            max: life,
            color: i % 3 ? color : C.cream,
            size: i % 4 ? 2 : 3,
          });
        }
        if (hit) {
          this.rings.push({ x: e.x, y: e.y - 24, life: 0.2, color, size: 18 });
          this.floaters.push({ x: e.x, y: e.y - 52, text: String(e.value), color, life: 0.65 });
        }
        if (e.type === 'wall')
          this.floaters.push({
            x: e.x,
            y: e.y - 65,
            text: 'WALL SLAM!',
            color: C.orange,
            life: 0.9,
          });
        if (e.type === 'burst')
          this.rings.push({ x: e.x, y: e.y - 15, life: 0.55, color: C.lime, size: 110 });
        if (e.type === 'slam')
          this.rings.push({ x: e.x, y: e.y, life: 0.55, color: C.pink, size: 110 });
        if (e.kind === 'armor')
          this.floaters.push({ x: e.x, y: e.y - 65, text: 'ARMOR', color: C.orange, life: 0.6 });
        if (e.type === 'kill' && e.kind === 'boss')
          this.floaters.push({
            x: e.x,
            y: e.y - 75,
            text: 'YOU’RE FIRED.',
            color: C.lime,
            life: 1.8,
          });
      }
      if (e.type === 'dodge') {
        for (let i = 0; i < 7; i++)
          this.particles.push({
            x: e.x + (Math.random() - 0.5) * 15,
            y: e.y - 2,
            vx: (Math.random() - 0.5) * 30,
            vy: -5,
            life: 0.3,
            max: 0.3,
            color: '#8da49a',
            size: 2,
          });
      }
      if (e.type === 'floor') this.floaters = [];
    }
  }

  draw(game: Game, dt: number, paused: boolean): void {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    this.rect(0, 0, 480, 300, '#172830');
    c.save();
    if (game.shake > 0 && !this.reducedMotion && !paused)
      c.translate(
        Math.round((Math.random() - 0.5) * game.shake),
        Math.round((Math.random() - 0.5) * game.shake),
      );
    this.room(game);
    // Floor shadows and warning zones stay under every character.
    const actors = game.mode === 'intro' ? this.attractActors(game) : [game.hero, ...game.enemies];
    for (const a of actors) {
      c.globalAlpha = a.hp <= 0 ? Math.max(0, 1 - a.deadTime) : 1;
      c.fillStyle = '#0c20276e';
      c.beginPath();
      c.ellipse(
        Math.round(a.x),
        Math.round(a.y) + 1,
        a.kind === 'boss' ? 15 : 11,
        4,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      if (a.state === 'windup') this.warning(a);
    }
    c.globalAlpha = 1;
    actors.sort((a, b) => a.y - b.y).forEach((a) => this.actor(a, game.clock));
    this.effects(paused ? 0 : dt);
    this.foreground(game);
    c.restore();
    if (game.mode !== 'intro') this.hud(game);
    if (game.mode === 'transition') this.floorCard(game);
    // A subtle edge vignette helps keep the action inside the cab.
    const vignette = c.createRadialGradient(240, 160, 125, 240, 160, 310);
    vignette.addColorStop(0, '#07171d00');
    vignette.addColorStop(1, '#07171d55');
    c.fillStyle = vignette;
    c.fillRect(0, 0, 480, 300);
    this.output.clearRect(0, 0, 960, 600);
    this.output.drawImage(this.canvas, 0, 0, 960, 600);
  }

  private room(game: Game): void {
    const c = this.c,
      t = game.clock;
    // The shaft: perforated steel, guide rails, and moving floor markers.
    this.rect(0, 0, 480, 300, '#192b34');
    for (let x = 12; x < 480; x += 19)
      for (let y = 12; y < 300; y += 20) this.rect(x, y, 2, 2, '#263b42');
    for (const x of [38, 433]) {
      this.rect(x, 0, 9, 300, '#0e202a');
      this.rect(x + 2, 0, 2, 300, '#405b60');
      const offset = game.mode === 'transition' ? (t * 70) % 88 : 0;
      for (let y = -88; y < 340; y += 88) {
        this.rect(x - 3, y + offset, 15, 7, '#345057');
        this.rect(x - 1, y + offset + 1, 11, 2, '#567171');
      }
    }
    this.rect(65, 45, 350, 230, '#0c1b26');
    this.rect(69, 48, 342, 225, '#819684');
    this.rect(73, 51, 334, 219, '#2a4b50');
    // Ceiling and its fluorescent light.
    this.polygon(
      [
        [75, 53],
        [405, 53],
        [389, 77],
        [91, 77],
      ],
      '#718b7a',
    );
    this.rect(138, 57, 204, 10, '#253f42');
    this.rect(143, 58, 194, 5, C.cream);
    this.rect(148, 63, 184, 2, '#a8c68c');
    this.rect(98, 72, 284, 3, '#213c40');
    const glow = c.createLinearGradient(0, 68, 0, 170);
    glow.addColorStop(0, '#e0fcb51a');
    glow.addColorStop(1, '#e0fcb500');
    c.fillStyle = glow;
    c.fillRect(91, 67, 298, 105);
    // Back panels, seams, grain, and lower kick plate.
    this.rect(92, 78, 296, 108, '#48726a');
    for (let x = 96; x < 389; x += 24) {
      this.rect(x, 78, 1, 105, '#2c5555');
      this.rect(x + 2, 79, 1, 101, '#638874');
    }
    for (let i = 0; i < 30; i++)
      this.rect(98 + ((i * 67) % 288), 84 + ((i * 17) % 92), 2 + (i % 5), 1, '#527c6b');
    this.rect(92, 164, 296, 22, '#264c50');
    this.rect(93, 163, 294, 3, '#b4b793');
    this.rect(93, 167, 294, 1, '#729081');
    // Light from the door recess.
    this.rect(178, 76, 126, 110, '#1b363c');
    this.rect(183, 79, 116, 107, '#a7ac86');
    this.rect(187, 82, 108, 103, '#152a35');
    for (let y = 84; y < 185; y += 7) this.rect(188, y, 106, 1, '#29414a');
    if (game.door > 0.03) {
      this.rect(203, 80, 77, 103, '#121f2c');
      this.rect(205, 84, 73, 88, ['#3b3a49', '#45444e', '#3a4d52', '#6d6255'][game.floor]);
      this.rect(205, 116, 73, 3, '#ce9b7c');
      for (let x = 209; x < 278; x += 15) this.rect(x, 90, 2, 84, '#273e48');
      this.text(['LOBBY', '02', '03', 'ROOF'][game.floor], 241, 101, '#c4c6a1', 10, 'center');
    }
    const opening = Math.round(game.door * 48);
    c.save();
    c.beginPath();
    c.rect(188, 82, 107, 103);
    c.clip();
    this.rect(188 - opening, 82, 53, 103, '#758e7b');
    this.rect(242 + opening, 82, 53, 103, '#6b8777');
    if (opening < 48) {
      this.rect(192 - opening, 85, 1, 74, '#9fb192');
      this.rect(246 + opening, 85, 1, 73, '#8ea58b');
      this.rect(238 - opening, 82, 2, 103, '#afba93');
      this.rect(242 + opening, 82, 1, 103, '#243f41');
      for (let i = 0; i < 7; i++) {
        this.rect(197 - opening, 92 + i * 11, 31, 1, '#809780');
        this.rect(251 + opening, 95 + i * 11, 30, 1, '#78917d');
      }
    }
    c.restore();
    this.rect(183, 79, 4, 107, '#bac09b');
    this.rect(295, 79, 4, 107, '#657c69');
    this.rect(186, 78, 110, 3, '#c3c59b');
    this.rect(185, 184, 113, 3, '#c0bb91');
    // Left notice, scratches, and rebellious graffiti.
    this.rect(110, 95, 35, 36, '#193a40');
    this.rect(112, 97, 31, 32, '#dad7ae');
    this.text('PLEASE', 127, 101, '#3d514c', 5, 'center');
    this.text('NO', 127, 109, '#3d514c', 7, 'center');
    this.text('FIGHTING', 127, 119, '#3d514c', 5, 'center');
    this.line(113, 122, 141, 103, '#d77a77', 2);
    this.line(111, 123, 143, 104, '#d77a77');
    this.text('yeah, right.', 103, 141, '#c0ca9d', 5);
    this.line(108, 150, 140, 147, '#b5c79c');
    // Cab position display and call buttons.
    this.rect(220, 67, 40, 12, '#142e35');
    this.text('↑ ' + String(game.floor + 1).padStart(2, '0'), 240, 69, C.lime, 8, 'center');
    this.rect(322, 100, 34, 53, '#27464a');
    this.rect(324, 102, 30, 49, '#95a58a');
    this.rect(328, 106, 22, 10, '#203c40');
    this.text('↑', 339, 106, C.lime, 8, 'center');
    for (let i = 0; i < 6; i++) {
      const x = 329 + (i % 2) * 11,
        y = 121 + Math.floor(i / 2) * 9;
      this.rect(x, y, 7, 6, '#4b6863');
      this.rect(x + 2, y + 1, 3, 3, i === game.floor ? C.lime : '#c0c5a1');
    }
    this.rect(364, 91, 10, 66, '#34595a');
    this.rect(367, 95, 4, 58, '#759385');
    // Brass rails run across the walls.
    this.rect(95, 155, 82, 4, '#223b40');
    this.rect(97, 154, 78, 2, '#b4bc8c');
    this.rect(302, 155, 84, 4, '#223b40');
    this.rect(304, 154, 80, 2, '#b4bc8c');
    // Sidewalls in perspective.
    this.polygon(
      [
        [75, 54],
        [92, 78],
        [92, 186],
        [68, 267],
      ],
      '#35595b',
    );
    this.polygon(
      [
        [405, 54],
        [388, 78],
        [388, 186],
        [412, 267],
      ],
      '#2e5054',
    );
    this.line(78, 87, 91, 105, '#729181');
    this.line(402, 88, 389, 106, '#557a70');
    this.polygon(
      [
        [77, 160],
        [92, 150],
        [92, 157],
        [75, 170],
      ],
      '#9fae8e',
    );
    this.polygon(
      [
        [389, 150],
        [403, 160],
        [405, 169],
        [389, 157],
      ],
      '#8a9f85',
    );
    // The entire playable world, 3 m² of scuffed tiles.
    this.polygon(
      [
        [92, 186],
        [388, 186],
        [412, 267],
        [68, 267],
      ],
      '#637b74',
    );
    for (let y = 190; y < 268; y += 13)
      this.line(92 - (y - 186) * 0.3, y, 388 + (y - 186) * 0.3, y, '#4c6865');
    for (let x = 90; x <= 390; x += 30) {
      const end = 240 + (x - 240) * 1.17;
      this.line(x, 186, end, 267, '#4b6865');
      this.line(x + 1, 187, end + 1, 267, '#7b8c7a');
    }
    for (let i = 0; i < 18; i++) {
      const x = 100 + ((i * 43) % 280),
        y = 195 + ((i * 13) % 64);
      this.rect(x, y, 3 + (i % 6), 1, '#7f9080');
    }
    this.polygon(
      [
        [94, 187],
        [386, 187],
        [389, 194],
        [91, 194],
      ],
      '#b5af7f',
    );
    for (let x = 97; x < 386; x += 13)
      this.polygon(
        [
          [x, 187],
          [x + 5, 187],
          [x + 2, 193],
          [x - 3, 193],
        ],
        '#525e52',
      );
    // Warm light pools directly under the overhead fixture.
    const floorGlow = c.createRadialGradient(240, 209, 2, 240, 209, 150);
    floorGlow.addColorStop(0, '#e0efac16');
    floorGlow.addColorStop(1, '#e0efac00');
    c.fillStyle = floorGlow;
    c.fillRect(90, 186, 300, 80);
    // Small flattened paper cup: the only other resident.
    this.polygon(
      [
        [368, 246],
        [376, 245],
        [378, 250],
        [371, 251],
      ],
      '#c9c2a0',
    );
    this.rect(370, 247, 5, 1, '#bc806c');
  }

  private foreground(game: Game): void {
    this.rect(65, 49, 7, 226, '#a0ac8d');
    this.rect(67, 52, 2, 217, '#d0cfaa');
    this.rect(408, 49, 7, 226, '#7d9480');
    this.rect(412, 52, 2, 217, '#b0b995');
    this.rect(65, 268, 350, 7, '#a3ad8a');
    this.rect(68, 269, 344, 2, '#d3cea2');
    this.rect(74, 275, 332, 4, '#0f222c');
    this.rect(165, 276, 150, 9, '#253d40');
    this.text('3 m²  /  NO ROOM FOR MANNERS', 240, 278, '#92a58c', 5, 'center');
    if (game.mode === 'playing' && game.floor === 0 && game.time < 13)
      this.text(
        'J  PUNCH    K  KICK    L  DODGE    SPACE  BURST',
        240,
        290,
        '#a6b6a0',
        5,
        'center',
      );
  }

  private attractActors(game: Game): Actor[] {
    const base = game.hero;
    return [
      { ...base, x: 312, y: 238, face: -1, state: 'idle', kind: 'hero', walk: 0 },
      { ...base, id: 22, x: 352, y: 214, face: -1, state: 'idle', kind: 'heavy', walk: 0 },
      { ...base, id: 23, x: 251, y: 207, face: 1, state: 'idle', kind: 'punk', walk: 0 },
    ];
  }

  private warning(a: Actor): void {
    const c = this.c,
      p = 1 - a.timer / a.windup;
    c.globalAlpha = 0.2 + p * 0.3;
    if (a.nextAttack === 'slam') {
      c.fillStyle = C.pink;
      c.beginPath();
      c.ellipse(a.x, a.y, 72, 35, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = C.pink;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(a.x, a.y, 72 * p, 35 * p, 0, 0, Math.PI * 2);
      c.stroke();
    } else
      this.polygon(
        [
          [a.x, a.y - 4],
          [a.x + a.face * 46, a.y - 14],
          [a.x + a.face * 46, a.y + 10],
        ],
        C.pink,
      );
    c.globalAlpha = 1;
    this.text('!', a.x, a.y - (a.kind === 'boss' ? 65 : 56), C.pink, 11, 'center');
    this.rect(a.x - 12, a.y + 5, 24, 2, '#2d3d3c');
    this.rect(a.x - 12, a.y + 5, 24 * p, 2, C.pink);
  }

  private actor(a: Actor, clock: number): void {
    const c = this.c;
    if (a.hp <= 0 && a.deadTime > 1) return;
    c.save();
    c.translate(Math.round(a.x), Math.round(a.y));
    c.scale(a.face, 1);
    if (a.kind === 'boss') c.scale(1.25, 1.18);
    else if (a.kind === 'heavy') c.scale(1.15, 1.07);
    if (a.hp <= 0) {
      c.globalAlpha = Math.max(0, 1 - a.deadTime / 0.95);
      c.translate(0, -4);
      c.rotate(a.face * Math.min(1.5, a.deadTime * 5));
    }
    if (a.invulnerable > 0 && a.kind === 'hero' && Math.floor(clock * 25) % 2 === 0)
      c.globalAlpha = 0.55;
    const hero = a.kind === 'hero',
      heavy = a.kind === 'heavy',
      boss = a.kind === 'boss';
    const outline = '#14242e',
      skin = hero ? '#e7b38f' : heavy ? '#c79077' : boss ? '#d6bea2' : '#d6a384';
    const skinLight = hero ? '#f4d2a2' : '#f0c9a1';
    const jacket = hero ? '#9edcb0' : heavy ? '#e4ac68' : boss ? '#424c63' : '#b489b9';
    const darkJacket = hero ? '#52967f' : heavy ? '#ac714e' : boss ? '#2a374c' : '#785e89';
    const trouser = hero ? '#354c5b' : boss ? '#29394b' : '#3b425c';
    const glove = hero ? '#f09379' : heavy ? '#63505a' : '#dfc2a3';
    const walking = a.state === 'walk',
      hurt = a.state === 'hurt',
      dodge = a.state === 'dodge';
    const step = walking ? Math.sin(a.walk) : 0,
      bob = walking ? Math.abs(Math.sin(a.walk)) * 1.4 : Math.sin(clock * 3 + a.id) * 0.6;
    let lean = hurt ? -5 : dodge ? 6 : a.state === 'windup' ? -3 : 0;
    const attack = a.attack,
      progress = attack ? attack.time / attack.duration : 0;
    if (attack?.kind === 'slam')
      c.translate(0, -Math.sin(Math.min(1, progress * 3) * Math.PI) * 12);
    const striking = attack && progress > 0.2 && progress < 0.7;
    if (attack && attack.kind === 'burst') {
      c.save();
      c.scale(a.face, 1);
      c.strokeStyle = C.lime;
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(0, -22, 25 + progress * 7, 13, clock * 8, 0, Math.PI * 1.6);
      c.stroke();
      c.restore();
      lean = Math.sin(progress * 12) * 5;
    }
    if (dodge) {
      c.translate(0, 7);
      c.rotate(0.2);
    }
    c.translate(lean, -bob);
    // Pixel-art limbs have a one-pixel dark outline, a main color, and highlights.
    const limb = (x: number, y: number, xx: number, yy: number, width: number, color: string) => {
      this.line(x, y, xx, yy, outline, width + 3);
      this.line(x, y, xx, yy, color, width);
    };
    const boot = (x: number, y: number) => {
      this.rect(x - 3, y - 2, 9, 5, outline);
      this.rect(x - 2, y - 2, 8, 3, '#d9d4af');
      this.rect(x + 3, y - 3, 3, 2, '#e4e1bd');
    };
    const kick = attack?.kind === 'kick' && striking;
    const leftFoot = -5 + step * 5,
      rightFoot = 5 - step * 5;
    limb(-4, -16, leftFoot, -3, 5, trouser);
    boot(leftFoot - 1, -2);
    if (kick) {
      limb(4, -17, 15, -24, 6, trouser);
      limb(15, -24, 30, -24, 5, trouser);
      boot(31, -24);
    } else {
      limb(4, -16, rightFoot, -3, 5, trouser);
      boot(rightFoot, -2);
    }
    this.rect(-8, -33, 16, 18, outline);
    this.rect(-7, -32, 14, 16, jacket);
    this.rect(-7, -29, 4, 11, darkJacket);
    this.rect(3, -31, 3, 13, hero ? '#c3e5bb' : jacket);
    this.rect(-2, -31, 5, 15, hero ? '#b65b6e' : boss ? '#cad3c0' : '#d2bd9d');
    this.rect(-1, -29, 2, 12, hero ? '#f2c286' : boss ? '#e98e71' : '#7e6582');
    this.rect(-7, -18, 14, 3, darkJacket);
    this.rect(-1, -17, 3, 2, '#d1ba83');
    if (hero) {
      this.rect(-6, -28, 3, 2, '#d9f5bc');
      this.rect(4, -26, 2, 3, '#e0e9b7');
    }
    if (boss) {
      this.polygon(
        [
          [-5, -32],
          [-1, -26],
          [-1, -31],
        ],
        '#7a8990',
      );
      this.polygon(
        [
          [5, -32],
          [2, -26],
          [1, -31],
        ],
        '#7a8990',
      );
    }
    // Back arm is raised into a guard.
    limb(-6, -29, -11, -22, 4, darkJacket);
    limb(-11, -22, -6, -25, 4, skin);
    this.rect(-9, -28, 6, 5, outline);
    this.rect(-8, -27, 5, 4, glove);
    let handX = 12,
      handY = -27,
      elbowX = 12,
      elbowY = -23;
    if (a.state === 'windup') {
      elbowX = -2;
      elbowY = -25;
      handX = -6;
      handY = -35;
    }
    if (striking && attack?.kind !== 'kick') {
      handX = attack?.kind === 'uppercut' ? 19 : 30;
      handY = attack?.kind === 'uppercut' ? -43 : -29;
      elbowX = 16;
      elbowY = attack?.kind === 'uppercut' ? -27 : -27;
      lean = 3;
    }
    if (hurt) {
      handX = 13;
      handY = -34;
      elbowX = 15;
      elbowY = -23;
    }
    limb(6, -29, elbowX, elbowY, 5, jacket);
    limb(elbowX, elbowY, handX, handY, 4, skin);
    this.rect(handX - 3, handY - 3, 7, 7, outline);
    this.rect(handX - 2, handY - 2, 6, 5, glove);
    this.rect(handX - 1, handY - 2, 4, 1, skinLight);
    // Neck, face, hair silhouette, ear, and the single-pixel scowl.
    this.rect(-2, -36, 6, 4, skin);
    this.rect(-7, -47, 14, 14, outline);
    this.rect(-6, -46, 12, 11, skin);
    this.rect(6, -42, 2, 5, skin);
    this.rect(2, -43, 4, 4, skinLight);
    this.rect(-6, -40, 3, 4, '#b78374');
    if (hero) {
      this.rect(-7, -48, 12, 5, '#263c47');
      this.rect(-5, -50, 9, 3, '#263c47');
      this.rect(-6, -46, 4, 6, '#263c47');
      this.rect(-3, -48, 6, 1, '#4a6470');
      this.rect(-7, -43, 2, 4, skin);
      this.rect(3, -42, 3, 2, outline);
      this.rect(4, -42, 1, 1, C.cream);
      this.rect(3, -36, 4, 1, '#714e4f');
      this.rect(-7, -35, 4, 3, '#d9edac');
    } else if (heavy) {
      this.rect(-6, -48, 12, 5, '#493f50');
      this.rect(-2, -52, 6, 7, '#d96c73');
      this.rect(-3, -51, 3, 2, '#f09680');
      this.rect(2, -42, 5, 2, outline);
      this.rect(2, -36, 5, 2, '#674c50');
    } else if (boss) {
      this.rect(-7, -49, 13, 5, '#d9d5bd');
      this.rect(-6, -46, 3, 7, '#a7b2a7');
      this.rect(3, -47, 4, 2, '#b5bfae');
      this.rect(-1, -42, 9, 3, '#1b303b');
      this.rect(0, -42, 3, 1, '#7a9c9d');
      this.rect(4, -36, 3, 1, '#70595a');
    } else {
      this.rect(-7, -48, 13, 5, '#604c69');
      this.rect(-7, -46, 4, 8, '#604c69');
      this.rect(-6, -49, 10, 2, '#86677e');
      this.rect(2, -42, 4, 2, outline);
      this.rect(3, -36, 4, 1, '#735253');
      this.rect(-7, -35, 7, 2, darkJacket);
    }
    if (striking) {
      c.globalAlpha = 0.7;
      if (kick) {
        this.line(19, -32, 36, -29, C.cream, 2);
        this.line(23, -35, 34, -34, C.lime, 1);
      } else {
        this.line(handX + 6, handY - 4, handX + 13, handY - 4, C.cream, 2);
        this.rect(handX + 9, handY + 2, 5, 1, C.lime);
      }
      c.globalAlpha = 1;
    }
    if (a.flash > 0) {
      c.globalCompositeOperation = 'source-atop';
      this.rect(-7, -46, 14, 44, '#f9f0c880');
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();
    if (a.kind !== 'hero' && a.hp > 0 && a.hp < a.maxHp) {
      this.rect(a.x - 12, a.y - 61, 24, 3, '#172b34');
      this.rect(
        a.x - 11,
        a.y - 60,
        22 * (a.hp / a.maxHp),
        1,
        a.kind === 'boss' ? C.orange : C.pink,
      );
    }
    if (a.kind === 'hero' && a.hp > 0) {
      this.polygon(
        [
          [a.x - 3, a.y - 59],
          [a.x + 3, a.y - 59],
          [a.x, a.y - 56],
        ],
        C.lime,
      );
    }
  }

  private effects(dt: number): void {
    const c = this.c;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 100 * dt;
      c.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      this.rect(p.x, p.y, p.size, p.size, p.color);
    }
    c.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      const fraction = r.size === 110 ? r.life / 0.55 : r.life / 0.2;
      c.globalAlpha = Math.max(0, fraction);
      c.strokeStyle = r.color;
      c.lineWidth = r.size === 110 ? 3 : 2;
      c.beginPath();
      c.ellipse(
        r.x,
        r.y,
        r.size * (1 - fraction) + 3,
        (r.size === 110 ? 0.45 : 1) * r.size * (1 - fraction) + 3,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      if (r.size !== 110) {
        this.line(r.x - 9, r.y - 9, r.x + 9, r.y + 9, C.cream);
        this.line(r.x + 9, r.y - 9, r.x - 9, r.y + 9, C.cream);
      }
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    c.globalAlpha = 1;
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= dt * 16;
      c.globalAlpha = Math.min(1, f.life * 3);
      this.text(f.text, f.x, f.y, f.color, f.text.length > 3 ? 6 : 9, 'center');
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    c.globalAlpha = 1;
  }

  private hud(game: Game): void {
    this.rect(14, 10, 156, 31, '#183038e8');
    this.rect(15, 11, 25, 29, '#8bbb94');
    this.text('1P', 27, 14, C.ink, 7, 'center');
    this.text('↑', 27, 24, C.ink, 10, 'center');
    this.text('THE COURIER', 46, 13, C.cream, 6);
    this.rect(46, 23, 116, 6, '#102831');
    this.rect(47, 24, 114 * (game.hero.hp / 100), 4, game.hero.hp > 30 ? C.lime : C.pink);
    for (let i = 1; i < 10; i++) this.rect(47 + i * 11.4, 24, 1, 4, '#2f4d42');
    this.text('BURST', 46, 33, game.burst >= 100 ? C.lime : '#9db5a4', 5);
    this.rect(70, 33, 80, 3, '#102831');
    this.rect(70, 33, 80 * (game.burst / 100), 3, game.burst >= 100 ? C.lime : '#75bca5');
    if (game.burst >= 100 && Math.floor(game.clock * 3) % 2) this.text('READY', 153, 32, C.lime, 5);
    this.text(String(game.score).padStart(6, '0'), 240, 12, C.cream, 11, 'center');
    this.text('SCORE', 240, 26, '#8da699', 5, 'center');
    this.text('STOP', 385, 13, '#a6b9a1', 6);
    this.text(String(game.floor + 1).padStart(2, '0') + '/04', 385, 23, C.lime, 11);
    if (game.mode === 'playing')
      this.text(
        `${game.remaining} ${game.remaining === 1 ? 'UNINVITED GUEST' : 'UNINVITED GUESTS'}`,
        240,
        43,
        '#bbc8a9',
        5,
        'center',
      );
    if (game.combo >= 2) {
      this.text(String(game.combo).padStart(2, '0'), 452, 93, C.lime, 24, 'right');
      this.text('HIT COMBO', 453, 119, C.cream, 6, 'right');
      this.rect(412, 130, 39, 2, '#34524e');
      this.rect(412, 130, 39 * Math.max(0, game.comboTimer / 2.5), 2, C.lime);
      if (game.combo >= 8)
        this.text(
          game.combo >= 16 ? 'PERSONAL SPACE!' : 'KEEP IT UP!',
          452,
          139,
          C.orange,
          5,
          'right',
        );
    }
    const boss = game.enemies.find((e) => e.kind === 'boss' && e.hp > 0);
    if (boss) {
      this.text('THE BUILDING MANAGER', 240, 286, C.orange, 5, 'center');
      this.rect(161, 294, 158, 3, '#112630');
      this.rect(162, 294, 156 * (boss.hp / boss.maxHp), 2, C.orange);
    }
  }

  private floorCard(game: Game): void {
    const c = this.c;
    const alpha = Math.min(1, game.transition * 2, Math.max(0, (3.3 - game.transition) * 3));
    c.globalAlpha = alpha;
    this.rect(90, 111, 300, 55, '#162d35e8');
    this.rect(90, 111, 2, 55, C.lime);
    this.text(
      `STOP ${String(game.floor + 1).padStart(2, '0')} / 04`,
      240,
      119,
      C.lime,
      6,
      'center',
    );
    this.text(FLOORS[game.floor].name, 240, 131, C.cream, 15, 'center');
    this.text(FLOORS[game.floor].subtitle, 240, 152, '#abc2a4', 5, 'center');
    if (game.floor > 0)
      this.text('+22 HEALTH  ·  CATCH YOUR BREATH', 240, 175, C.lime, 6, 'center');
    c.globalAlpha = 1;
  }
}
