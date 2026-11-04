import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, NO_INPUT, ROOM } from '../src/game.ts';
import type { Actor, Controls, EnemyKind } from '../src/game.ts';

const advance = (game: Game, seconds: number, input: Controls = NO_INPUT) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) game.update(1 / 60, input);
};
const play = () => {
  const game = new Game(42);
  game.start();
  advance(game, 2.9);
  game.drainEvents();
  return game;
};
const foe = (
  game: Game,
  kind: EnemyKind = 'punk',
  x = game.hero.x + 24,
  y = game.hero.y,
): Actor => ({
  ...game.hero,
  id: 100,
  kind,
  x,
  y,
  hp: 100,
  maxHp: 100,
  invulnerable: 0,
  cooldown: 100,
  state: 'idle',
  attack: null,
});

test('a run starts on stop one and schedules its guests deterministically', () => {
  const a = play(),
    b = play();
  assert.equal(a.mode, 'playing');
  assert.equal(a.remaining, 3);
  assert.deepEqual(a.enemies, b.enemies);
  assert.equal(a.hero.hp, 100);
});
test('movement is normalized, bounded, and supports depth', () => {
  const game = play();
  game.enemies = [];
  const before = { x: game.hero.x, y: game.hero.y };
  advance(game, 0.2, { ...NO_INPUT, x: 1, y: -1 });
  assert.ok(game.hero.x > before.x && game.hero.y < before.y);
  assert.ok(game.hero.x - before.x < 76 * 0.2);
  advance(game, 10, { ...NO_INPUT, x: 1, y: 1 });
  assert.ok(game.hero.x <= ROOM.right && game.hero.y <= ROOM.front);
});
test('punches deal damage in front and need depth alignment', () => {
  const game = play(),
    front = foe(game),
    back = { ...foe(game), id: 101, x: game.hero.x - 30 },
    far = { ...foe(game), id: 102, y: game.hero.y - 40 };
  game.enemies = [front, back, far];
  game.hero.face = 1;
  advance(game, 0.17, { ...NO_INPUT, punch: true });
  assert.equal(front.hp, 88);
  assert.equal(back.hp, 100);
  assert.equal(far.hp, 100);
  assert.equal(game.combo, 1);
  assert.ok(game.score > 0);
});
test('a held punch progresses through jab, cross, and uppercut', () => {
  const game = play();
  const enemy = foe(game);
  game.enemies = [enemy];
  const kinds: string[] = [];
  for (let i = 0; i < 65; i++) {
    enemy.x = game.hero.x + 24;
    enemy.y = game.hero.y;
    enemy.vx = 0;
    enemy.vy = 0;
    game.update(1 / 60, { ...NO_INPUT, punch: true });
    kinds.push(
      ...game
        .drainEvents()
        .filter((e) => e.type === 'punch')
        .map((e) => e.kind!),
    );
  }
  assert.deepEqual(kinds.slice(0, 3), ['jab', 'cross', 'uppercut']);
  assert.ok(enemy.hp <= 52);
  assert.ok(game.bestCombo >= 3);
});
test('a kick sweeps several enemies and the burst hits behind the player', () => {
  const game = play();
  game.enemies = [foe(game), { ...foe(game), id: 101, y: game.hero.y - 18 }];
  advance(game, 0.3, { ...NO_INPUT, kick: true });
  assert.ok(game.enemies.every((e) => e.hp === 82));
  game.hero.attack = null;
  game.hero.state = 'idle';
  game.enemies = [{ ...foe(game), x: game.hero.x - 40 }];
  advance(game, 0.3, { ...NO_INPUT, burst: true });
  assert.equal(game.burst, 0);
  assert.equal(game.enemies[0].hp, 64);
});
test('dodging provides invulnerability and has a cooldown', () => {
  const game = play();
  game.enemies = [];
  advance(game, 1 / 60, { ...NO_INPUT, dodge: true, x: 1 });
  assert.equal(game.hero.state, 'dodge');
  assert.ok(game.hero.invulnerable > 0);
  assert.ok(game.dodgeCooldown > 0);
  const x = game.hero.x;
  advance(game, 0.2);
  assert.ok(game.hero.x > x + 20);
});
test('wall slams award a defeat when collision damage finishes an enemy', () => {
  const game = play();
  const enemy = foe(game, 'punk', ROOM.right - 1);
  enemy.hp = 8;
  enemy.state = 'hurt';
  enemy.timer = 1;
  enemy.vx = 200;
  game.enemies = [enemy];
  advance(game, 0.05);
  assert.equal(enemy.hp, 0);
  assert.equal(game.kills, 1);
  assert.ok(game.drainEvents().some((e) => e.type === 'wall'));
});
test('clearing each stop restores health and eventually wins the run', () => {
  const game = play();
  for (let floor = 0; floor < 4; floor++) {
    // Let all scheduled guests arrive while preventing damage, then clear them.
    game.hero.invulnerable = 100;
    advance(game, 4);
    game.hero.hp = 50;
    for (const enemy of game.enemies) enemy.hp = 0;
    advance(game, 1 / 60);
    if (floor < 3) {
      assert.equal(game.mode, 'transition');
      assert.equal(game.hero.hp, 72);
      advance(game, 3.4);
    }
  }
  assert.equal(game.mode, 'won');
  assert.ok(game.score > 0);
});
test('taking a fatal hit ends the run, and a restart clears its state', () => {
  const game = play();
  game.hero.hp = 1;
  game.hero.invulnerable = 0;
  const enemy = foe(game);
  enemy.face = -1;
  enemy.state = 'attack';
  enemy.attack = { kind: 'enemy', time: 0.09, duration: 0.45, hitAt: 0.1, dealt: false };
  game.enemies = [enemy];
  advance(game, 0.05);
  assert.equal(game.mode, 'lost');
  game.start();
  assert.equal(game.hero.hp, 100);
  assert.equal(game.score, 0);
  assert.equal(game.floor, 0);
  assert.equal(game.burst, 100);
  assert.equal(game.combo, 0);
});

test('boss armor resists jabs, but an uppercut breaks the windup', () => {
  const game = play(),
    boss = foe(game, 'boss');
  boss.state = 'windup';
  boss.timer = 0.8;
  boss.windup = 0.8;
  game.enemies = [boss];
  advance(game, 0.17, { ...NO_INPUT, punch: true });
  assert.equal(boss.state, 'windup');
  assert.equal(boss.hp, 92);
  advance(game, 0.2);
  game.hero.attack = { kind: 'uppercut', time: 0.16, duration: 0.43, hitAt: 0.17, dealt: false };
  advance(game, 0.1);
  assert.equal(boss.state, 'hurt');
  assert.equal(boss.hp, 70);
});

test('a normal-input player can win all four stops without modifying the simulation', () => {
  const game = new Game(2026);
  game.start();
  for (let frame = 0; frame < 180 * 60 && game.mode !== 'won' && game.mode !== 'lost'; frame++) {
    const p = game.hero,
      alive = game.enemies.filter((e) => e.hp > 0);
    alive.sort(
      (a, b) => Math.hypot(a.x - p.x, (a.y - p.y) * 2) - Math.hypot(b.x - p.x, (b.y - p.y) * 2),
    );
    const target = alive[0];
    const dx = target ? target.x - p.x : 0,
      dy = target ? target.y - p.y : 0;
    game.update(1 / 60, {
      x: Math.abs(dx) > 27 ? Math.sign(dx) : 0,
      y: Math.abs(dy) > 5 ? Math.sign(dy) : 0,
      punch: true,
      kick: false,
      dodge: false,
      burst: !!target && Math.abs(dx) < 75 && Math.abs(dy) < 30,
    });
    game.drainEvents();
  }
  assert.equal(
    game.mode,
    'won',
    `ended ${game.mode} on stop ${game.floor + 1}, HP ${game.hero.hp}`,
  );
  assert.equal(game.kills, 13);
  assert.ok(game.bestCombo >= 3);
  assert.ok(game.score > 10000);
});
