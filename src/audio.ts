import type { GameEvent } from './game.ts';

/** Original sounds and a small adaptive sequencer. No samples or downloads. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextBeat = 0;
  private beat = 0;
  enabled = true;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.48 : 0;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(
        1,
        this.context.sampleRate * 0.25,
        this.context.sampleRate,
      );
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.nextBeat = this.context.currentTime + 0.1;
  }
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(this.enabled ? 0.48 : 0, this.context.currentTime, 0.03);
    return this.enabled;
  }
  private tone(
    frequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'square',
    when?: number,
  ): void {
    if (!this.context || !this.master) return;
    const time = when ?? this.context.currentTime,
      osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }
  private hiss(duration: number, volume: number, frequency: number, when?: number): void {
    if (!this.context || !this.master || !this.noise) return;
    const time = when ?? this.context.currentTime,
      source = this.context.createBufferSource(),
      gain = this.context.createGain(),
      filter = this.context.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(time);
    source.stop(time + duration);
  }
  event(event: GameEvent): void {
    switch (event.type) {
      case 'hit':
        this.tone(
          event.kind === 'armor' ? 720 : 110,
          event.kind === 'armor' ? 240 : 35,
          0.14,
          0.35,
          'triangle',
        );
        this.hiss(0.07, 0.25, 800);
        break;
      case 'damage':
        this.tone(150, 40, 0.22, 0.3, 'sawtooth');
        this.hiss(0.12, 0.22, 500);
        break;
      case 'punch':
        this.hiss(0.08, 0.09, 1200);
        break;
      case 'kick':
        this.hiss(0.15, 0.13, 700);
        break;
      case 'wall':
        this.tone(65, 20, 0.25, 0.4, 'triangle');
        this.hiss(0.13, 0.26, 1500);
        break;
      case 'dodge':
        this.hiss(0.18, 0.12, 2400);
        break;
      case 'kill':
        this.tone(170, 55, 0.2, 0.15, 'square');
        break;
      case 'burst':
        this.tone(60, 500, 0.22, 0.2, 'sawtooth');
        this.tone(200, 25, 0.6, 0.5, 'triangle');
        this.hiss(0.3, 0.4, 300);
        break;
      case 'slam':
        this.tone(90, 20, 0.4, 0.45, 'triangle');
        this.hiss(0.2, 0.3, 500);
        break;
      case 'floor':
      case 'start':
        this.tone(659, 659, 0.4, 0.15, 'sine');
        this.tone(523, 523, 0.65, 0.12, 'sine', (this.context?.currentTime ?? 0) + 0.2);
        break;
      case 'win':
        [261.6, 329.6, 392, 523.2].forEach((note, i) =>
          this.tone(note, note, 0.6, 0.16, 'square', (this.context?.currentTime ?? 0) + i * 0.14),
        );
        break;
      case 'lose':
        this.tone(220, 55, 0.9, 0.2, 'sawtooth');
        break;
    }
  }
  update(active: boolean, floor: number): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (!active || !this.enabled) {
      this.nextBeat = now + 0.1;
      return;
    }
    if (this.nextBeat < now - 0.5) this.nextBeat = now + 0.1;
    while (this.nextBeat < now + 0.1) {
      const t = this.nextBeat,
        step = this.beat % 16;
      const bass = [55, 55, 82.4, 55, 65.4, 65.4, 49, 73.4][Math.floor(step / 2)];
      if (step % 2 === 0) this.tone(bass, bass, 0.18, 0.12, 'triangle', t);
      if (step % 4 === 0 || step === 10) this.tone(110, 35, 0.14, 0.19, 'sine', t);
      if (step % 8 === 4) this.hiss(0.1, 0.1, 1000, t);
      this.hiss(0.025, step % 2 ? 0.025 : 0.04, 7000, t);
      if (floor >= 2 && step % 4 === 2)
        this.tone([220, 261.6, 329.6, 293.7][Math.floor(step / 4)], 110, 0.12, 0.035, 'square', t);
      this.nextBeat += 60 / (112 + floor * 4) / 4;
      this.beat++;
    }
  }
}
