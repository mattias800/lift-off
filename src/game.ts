/** The simulation has no DOM, rendering, or audio dependencies. All distances are
 * in logical pixels; y is depth on the elevator floor, not sprite height. */
export type Mode = 'intro' | 'transition' | 'playing' | 'won' | 'lost';
export type EnemyKind = 'punk' | 'heavy' | 'boss';
export type AttackKind = 'jab' | 'cross' | 'uppercut' | 'kick' | 'burst' | 'enemy' | 'slam';
export type ActorState = 'idle' | 'walk' | 'attack' | 'windup' | 'hurt' | 'dodge' | 'down';
export interface Controls {
  x: number;
  y: number;
  punch: boolean;
  kick: boolean;
  dodge: boolean;
  burst: boolean;
}
export const NO_INPUT: Controls = {
  x: 0,
  y: 0,
  punch: false,
  kick: false,
  dodge: false,
  burst: false,
};
export const ROOM = { left: 104, right: 376, back: 188, front: 254 } as const;
export const FLOORS = [
  { name: 'LOBBY', subtitle: 'A WARM WELCOME', enemies: ['punk', 'punk', 'punk'] },
  {
    name: 'SECOND FLOOR',
    subtitle: 'PERSONAL SPACE SOLD SEPARATELY',
    enemies: ['punk', 'heavy', 'punk'],
  },
  {
    name: 'THIRD FLOOR',
    subtitle: 'THINGS ARE GETTING TIGHT',
    enemies: ['heavy', 'punk', 'punk', 'heavy'],
  },
  { name: 'ROOFTOP', subtitle: 'MEET THE BUILDING MANAGER', enemies: ['punk', 'boss', 'punk'] },
] as const;

export interface Attack {
  kind: AttackKind;
  time: number;
  duration: number;
  hitAt: number;
  dealt: boolean;
}
export interface Actor {
  id: number;
  kind: 'hero' | EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  hp: number;
  maxHp: number;
  state: ActorState;
  timer: number;
  invulnerable: number;
  cooldown: number;
  attack: Attack | null;
  age: number;
  walk: number;
  deadTime: number;
  flash: number;
  windup: number;
  attacksMade: number;
  nextAttack: 'enemy' | 'slam';
}
export interface GameEvent {
  type:
    | 'start'
    | 'floor'
    | 'punch'
    | 'kick'
    | 'hit'
    | 'damage'
    | 'kill'
    | 'wall'
    | 'dodge'
    | 'burst'
    | 'slam'
    | 'win'
    | 'lose'
    | 'whiff'
    | 'warning';
  x: number;
  y: number;
  value?: number;
  kind?: string;
  face?: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const duration: Record<AttackKind, number> = {
  jab: 0.27,
  cross: 0.3,
  uppercut: 0.43,
  kick: 0.51,
  burst: 0.7,
  enemy: 0.45,
  slam: 0.75,
};

export class Game {
  mode: Mode = 'intro';
  hero: Actor;
  enemies: Actor[] = [];
  floor = 0;
  time = 0;
  clock = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  comboTimer = 0;
  burst = 100;
  dodgeCooldown = 0;
  transition = 0;
  shake = 0;
  hitStop = 0;
  door = 0;
  kills = 0;
  events: GameEvent[] = [];
  private punchChain = 0;
  private chainTimer = 0;
  private nextId = 1;
  private seed: number;
  private spawns: { kind: EnemyKind; at: number }[] = [];
  private floorTime = 0;

  constructor(seed = Date.now()) {
    this.seed = seed >>> 0 || 1;
    this.hero = this.makeActor('hero', 240, 236);
  }

  private random(): number {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private makeActor(kind: Actor['kind'], x: number, y: number): Actor {
    const hp = { hero: 100, punk: 48, heavy: 90, boss: 320 }[kind];
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      face: -1,
      hp,
      maxHp: hp,
      state: 'idle',
      timer: 0,
      invulnerable: 0,
      cooldown: 0.8 + this.random() * 0.6,
      attack: null,
      age: 0,
      walk: 0,
      deadTime: 0,
      flash: 0,
      windup: 0,
      attacksMade: 0,
      nextAttack: 'enemy',
    };
  }

  start(): void {
    this.mode = 'transition';
    this.floor = 0;
    this.time = 0;
    this.clock = 0;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.burst = 100;
    this.dodgeCooldown = 0;
    this.kills = 0;
    this.enemies = [];
    this.hero = this.makeActor('hero', 240, 238);
    this.hero.face = 1;
    this.transition = 2.8;
    this.shake = 0;
    this.hitStop = 0;
    this.door = 0;
    this.spawns = [];
    this.punchChain = 0;
    this.chainTimer = 0;
    this.events = [
      { type: 'start', x: 240, y: 220 },
      { type: 'floor', x: 240, y: 150, value: 1 },
    ];
  }

  drainEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  private emit(
    type: GameEvent['type'],
    actor: Pick<Actor, 'x' | 'y'> = this.hero,
    extra: Partial<GameEvent> = {},
  ): void {
    this.events.push({ type, x: actor.x, y: actor.y, ...extra });
  }

  update(dt: number, input: Controls = NO_INPUT): void {
    dt = clamp(dt, 0, 0.05);
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 18);
    if (this.mode === 'intro') return;
    if (this.mode === 'won' || this.mode === 'lost') {
      // Let defeated sprites settle during the short delay before the results.
      for (const actor of [this.hero, ...this.enemies]) {
        if (actor.hp <= 0) this.updateActor(actor, dt);
      }
      return;
    }
    this.time += dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    if (this.mode === 'transition') {
      this.transition -= dt;
      this.hero.age += dt;
      this.door =
        this.transition < 1.1 ? Math.min(1, this.door + dt * 2) : Math.max(0, this.door - dt * 2);
      if (this.transition <= 0) {
        this.mode = 'playing';
        this.floorTime = 0;
        this.spawns = FLOORS[this.floor].enemies.map((kind, i) => ({ kind, at: i * 1.05 }));
      }
      return;
    }
    this.floorTime += dt;
    this.door =
      this.spawns.length > 0 ? Math.min(1, this.door + dt * 3) : Math.max(0, this.door - dt);
    while (this.spawns.length && this.spawns[0].at <= this.floorTime) {
      const spawn = this.spawns.shift()!;
      const enemy = this.makeActor(spawn.kind, 215 + this.random() * 50, ROOM.back + 1);
      enemy.invulnerable = 0.3;
      this.enemies.push(enemy);
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.chainTimer -= dt;
    if (this.chainTimer <= 0) this.punchChain = 0;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.updateActor(this.hero, dt);
    for (const enemy of this.enemies) this.updateActor(enemy, dt);
    this.enemies = this.enemies.filter((e) => e.deadTime < 1.2);
    if (this.hero.hp <= 0) return;
    this.playerInput(input, dt);
    for (const enemy of this.enemies) if (enemy.hp > 0) this.enemyAI(enemy, dt);
    this.separateEnemies(dt);
    if (
      this.mode === 'playing' &&
      this.spawns.length === 0 &&
      this.enemies.every((e) => e.hp <= 0)
    ) {
      this.score += 500 + Math.round(this.hero.hp * 5);
      if (this.floor === FLOORS.length - 1) {
        this.mode = 'won';
        this.hero.attack = null;
        this.hero.state = 'idle';
        this.emit('win');
      } else {
        this.floor++;
        this.mode = 'transition';
        this.transition = 3.3;
        this.hero.hp = Math.min(100, this.hero.hp + 22);
        this.hero.attack = null;
        this.hero.state = 'idle';
        this.combo = 0;
        this.comboTimer = 0;
        this.hero.vx = 0;
        this.hero.vy = 0;
        this.enemies = [];
        this.door = 1;
        this.emit('floor', this.hero, { value: this.floor + 1 });
      }
    }
  }

  private updateActor(a: Actor, dt: number): void {
    a.age += dt;
    a.timer = Math.max(0, a.timer - dt);
    a.invulnerable = Math.max(0, a.invulnerable - dt);
    a.cooldown = Math.max(0, a.cooldown - dt);
    a.flash = Math.max(0, a.flash - dt);
    if (a.hp <= 0) {
      a.deadTime += dt;
      a.state = 'down';
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    const friction = a.state === 'dodge' ? 2 : 10;
    a.vx *= Math.exp(-friction * dt);
    a.vy *= Math.exp(-friction * dt);
    const wall = a.x < ROOM.left || a.x > ROOM.right;
    if (wall && Math.abs(a.vx) > 70 && a.hp > 0 && a.state === 'hurt') {
      const wallDamage = Math.min(10, a.hp);
      a.hp -= wallDamage;
      a.vx *= -0.22;
      a.flash = 0.1;
      this.shake = 3;
      this.emit('wall', a, { value: wallDamage });
      if (a.hp <= 0) this.defeat(a);
    }
    a.x = clamp(a.x, ROOM.left, ROOM.right);
    a.y = clamp(a.y, ROOM.back, ROOM.front);
    if (a.attack && a.hp > 0) {
      a.attack.time += dt;
      if (!a.attack.dealt && a.attack.time >= a.attack.hitAt) {
        a.attack.dealt = true;
        this.resolveAttack(a);
      }
      if (a.attack && a.attack.time >= a.attack.duration) {
        a.attack = null;
        a.state = 'idle';
      }
    }
    if ((a.state === 'hurt' || a.state === 'dodge') && a.timer <= 0 && a.hp > 0) a.state = 'idle';
  }

  private playerInput(input: Controls, dt: number): void {
    const p = this.hero;
    if (p.state === 'hurt' || p.state === 'dodge') return;
    if (!p.attack) {
      if (input.burst && this.burst >= 100) {
        this.burst = 0;
        this.beginAttack(p, 'burst');
        p.invulnerable = 0.85;
        this.emit('burst');
      } else if (input.dodge && this.dodgeCooldown <= 0) {
        let dx = input.x;
        let dy = input.y;
        if (!dx && !dy) dx = p.face;
        const length = Math.hypot(dx, dy);
        p.vx = (dx / length) * 220;
        p.vy = (dy / length) * 140;
        p.state = 'dodge';
        p.timer = 0.3;
        p.invulnerable = 0.4;
        this.dodgeCooldown = 0.65;
        this.emit('dodge');
        return;
      } else if (input.kick) {
        this.faceTarget();
        this.beginAttack(p, 'kick');
      } else if (input.punch) {
        this.faceTarget();
        this.beginAttack(p, (['jab', 'cross', 'uppercut'] as const)[this.punchChain % 3]);
        this.punchChain++;
        this.chainTimer = 0.95;
      }
    }
    const moving = Math.hypot(input.x, input.y) > 0;
    if (moving) {
      const length = Math.max(1, Math.hypot(input.x, input.y));
      const speed = p.attack ? 15 : 76;
      p.x = clamp(p.x + (input.x / length) * speed * dt, ROOM.left, ROOM.right);
      p.y = clamp(p.y + (input.y / length) * speed * 0.65 * dt, ROOM.back, ROOM.front);
      if (!p.attack && input.x) p.face = Math.sign(input.x);
      p.walk += dt * 12;
    }
    if (!p.attack) p.state = moving ? 'walk' : 'idle';
  }

  private faceTarget(): void {
    const targets = this.enemies.filter((e) => e.hp > 0 && Math.abs(e.y - this.hero.y) < 22);
    targets.sort((a, b) => Math.abs(a.x - this.hero.x) - Math.abs(b.x - this.hero.x));
    if (targets[0] && Math.abs(targets[0].x - this.hero.x) < 70)
      this.hero.face = targets[0].x >= this.hero.x ? 1 : -1;
  }

  private beginAttack(a: Actor, kind: AttackKind): void {
    a.state = 'attack';
    a.attack = {
      kind,
      time: 0,
      duration: duration[kind],
      hitAt:
        kind === 'slam'
          ? 0.23
          : kind === 'burst'
            ? 0.22
            : kind === 'kick'
              ? 0.19
              : kind === 'uppercut'
                ? 0.17
                : 0.1,
      dealt: false,
    };
    if (a.kind === 'hero' && kind !== 'burst')
      this.emit(kind === 'kick' ? 'kick' : 'punch', a, { kind, face: a.face });
  }

  private enemyAI(e: Actor, dt: number): void {
    if (e.state === 'hurt' || e.state === 'down' || e.attack) return;
    const p = this.hero;
    if (e.state === 'windup') {
      if (e.timer <= 0) {
        this.beginAttack(e, e.nextAttack);
        e.attacksMade++;
        e.cooldown = e.kind === 'boss' ? 0.95 : 1.4 + this.random() * 0.7;
      }
      return;
    }
    e.face = p.x >= e.x ? 1 : -1;
    const dx = p.x - e.x,
      dy = p.y - e.y;
    const range = e.kind === 'boss' ? 38 : e.kind === 'heavy' ? 34 : 30;
    const attackers = this.enemies.filter(
      (other) => other.state === 'windup' || other.attack,
    ).length;
    const slam = e.kind === 'boss' && e.attacksMade % 2 === 1;
    if (
      Math.abs(dx) < (slam ? 70 : range) &&
      Math.abs(dy) < (slam ? 40 : 12) &&
      e.cooldown <= 0 &&
      attackers < 2
    ) {
      e.nextAttack = slam ? 'slam' : 'enemy';
      e.state = 'windup';
      e.windup = slam ? 0.9 : e.kind === 'boss' ? 0.55 : e.kind === 'heavy' ? 0.78 : 0.6;
      if (e.kind === 'boss' && e.hp < e.maxHp / 2) e.windup *= 0.8;
      e.timer = e.windup;
      this.emit('warning', e);
      return;
    }
    const side = e.id % 2 ? 1 : -1;
    const targetX = clamp(p.x + side * (range - 8), ROOM.left + 5, ROOM.right - 5);
    const targetY = clamp(p.y + Math.sin(e.id * 3 + this.clock) * 6, ROOM.back + 5, ROOM.front - 5);
    const tx = targetX - e.x,
      ty = targetY - e.y;
    const length = Math.hypot(tx, ty);
    const speed = e.kind === 'boss' ? (e.hp < e.maxHp / 2 ? 48 : 38) : e.kind === 'heavy' ? 24 : 37;
    if (length > 4) {
      e.x = clamp(e.x + (tx / length) * speed * dt, ROOM.left, ROOM.right);
      e.y = clamp(e.y + (ty / length) * speed * dt * 0.85, ROOM.back, ROOM.front);
      e.walk += dt * 9;
      e.state = 'walk';
    } else e.state = 'idle';
  }

  private separateEnemies(dt: number): void {
    const alive = this.enemies.filter((e) => e.hp > 0);
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i],
          b = alive[j],
          dx = a.x - b.x,
          dy = a.y - b.y;
        if (Math.abs(dx) < 15 && Math.abs(dy) < 9) {
          const push = (dx > 0 ? 1 : -1) * dt * 18;
          if (!a.attack && a.state !== 'windup') a.x = clamp(a.x + push, ROOM.left, ROOM.right);
          if (!b.attack && b.state !== 'windup') b.x = clamp(b.x - push, ROOM.left, ROOM.right);
        }
      }
  }

  private resolveAttack(attacker: Actor): void {
    const kind = attacker.attack!.kind;
    if (kind === 'slam') {
      this.emit('slam', attacker);
      this.shake = 5;
    }
    const targets = attacker.kind === 'hero' ? this.enemies : [this.hero];
    let hits = 0;
    for (const target of targets) {
      if (target.hp <= 0 || target.invulnerable > 0) continue;
      const dx = target.x - attacker.x,
        dy = target.y - attacker.y;
      const range =
        kind === 'slam'
          ? 72
          : kind === 'burst'
            ? 95
            : kind === 'kick'
              ? 57
              : kind === 'uppercut'
                ? 42
                : attacker.kind === 'boss'
                  ? 48
                  : 37;
      const inRange =
        kind === 'burst' || kind === 'slam'
          ? Math.hypot(dx, dy * 1.3) < range
          : dx * attacker.face > -10 &&
            dx * attacker.face < range &&
            Math.abs(dy) < (kind === 'kick' ? 23 : 15);
      if (!inRange) continue;
      hits++;
      const damage =
        attacker.kind !== 'hero'
          ? kind === 'slam'
            ? 18
            : ({ punk: 7, heavy: 11, boss: 14 } as const)[attacker.kind]
          : ({ jab: 12, cross: 14, uppercut: 22, kick: 18, burst: 36, enemy: 0, slam: 0 } as const)[
              kind
            ];
      this.hit(target, attacker, damage, kind);
    }
    if (!hits && attacker.kind === 'hero' && kind !== 'burst') this.emit('whiff');
  }

  private hit(target: Actor, source: Actor, damage: number, kind: AttackKind): void {
    // Large enemies commit to their telegraphed strikes. Finishers and bursts
    // break their armor, so blindly holding jab isn't always the safest answer.
    const armored =
      (target.kind === 'boss' || target.kind === 'heavy') &&
      (target.state === 'windup' || target.state === 'attack') &&
      (kind === 'jab' || kind === 'cross' || (kind === 'kick' && target.kind === 'boss'));
    if (armored) damage = Math.ceil(damage * 0.6);
    target.hp = Math.max(0, target.hp - damage);
    target.flash = 0.13;
    if (!armored) {
      target.state = 'hurt';
      target.timer = kind === 'uppercut' || kind === 'burst' ? 0.6 : 0.32;
      target.attack = null;
    }
    const direction =
      kind === 'burst' || kind === 'slam' ? (target.x >= source.x ? 1 : -1) : source.face;
    const power = kind === 'uppercut' ? 230 : kind === 'kick' ? 180 : kind === 'burst' ? 310 : 65;
    target.vx = direction * power * (armored ? 0.12 : target.kind === 'boss' ? 0.65 : 1);
    target.vy = (target.y - source.y) * 2;
    this.shake = kind === 'burst' ? 6 : kind === 'uppercut' ? 4 : 2.3;
    this.hitStop = kind === 'burst' ? 0.08 : 0.045;
    if (target.kind === 'hero') {
      target.invulnerable = 0.85;
      this.combo = 0;
      this.comboTimer = 0;
      this.burst = Math.min(100, this.burst + 9);
      this.emit('damage', target, { value: damage, face: direction });
    } else {
      target.invulnerable = 0.13;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.comboTimer = 2.5;
      this.score += damage * 10 + this.combo * 5;
      if (kind !== 'burst') this.burst = Math.min(100, this.burst + 8);
      this.emit('hit', target, { value: damage, kind: armored ? 'armor' : kind, face: direction });
    }
    if (target.hp <= 0) this.defeat(target);
  }

  private defeat(a: Actor): void {
    a.state = 'down';
    a.attack = null;
    if (a.kind === 'hero') {
      this.mode = 'lost';
      this.emit('lose');
    } else {
      this.kills++;
      this.score += a.kind === 'boss' ? 2000 : a.kind === 'heavy' ? 450 : 250;
      this.emit('kill', a, { kind: a.kind });
    }
  }

  get remaining(): number {
    return this.spawns.length + this.enemies.filter((e) => e.hp > 0).length;
  }
}
