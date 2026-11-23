// Web Audio synthesizer for the procedural sound recipes.
import { createRng } from '../utils/rng.ts';
import { createNoiseSamples, planSound, SoundThrottle } from './plan.ts';
import { DEFAULT_SOUNDS } from './recipes.ts';
import type { Envelope, NoiseLayer, SoundName, SoundPack, SoundPlayer, ToneLayer } from './types.ts';

/** Exponential ramps cannot reach 0; this is "silent". */
const SILENCE = 0.0001;
/** Small scheduling headroom so the first sample is never in the past. */
const LOOKAHEAD = 0.005;
const NOISE_SECONDS = 1;
/** A finger only counts as a gesture when it lifts (a mouse already counts when it presses). */
const GESTURES = ['keydown', 'pointerdown', 'pointerup'] as const;

export class AudioEngine implements SoundPlayer {
  private ctx: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private target: Window | null = null;
  private readonly rng = createRng('sfx');
  private readonly throttle = new SoundThrottle<SoundName>();
  private readonly sounds: SoundPack;
  private volume: number;

  constructor(volume: number, sounds: SoundPack = DEFAULT_SOUNDS) {
    this.volume = volume;
    this.sounds = sounds;
  }

  /** Browsers only allow audio after a user gesture: unlock on key or pointer presses. */
  attach(target: Window): void {
    this.detach();
    this.target = target;
    for (const type of GESTURES) target.addEventListener(type, this.unlock, { capture: true });
  }

  detach(): void {
    for (const type of GESTURES) this.target?.removeEventListener(type, this.unlock, { capture: true });
    this.target = null;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.output && this.ctx) this.output.gain.setValueAtTime(volume, this.ctx.currentTime);
  }

  /** Creates the context on the first gesture and resumes it if the browser suspended it. */
  private readonly unlock = (): void => {
    // Only real activation gestures may start audio (modifier keys like Shift are not one).
    // Creating the context earlier would leave it suspended and every later resume() would warn.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
      } catch {
        return; // No Web Audio: the game stays silent.
      }
      const ctx = this.ctx;
      // Master volume → compressor (keeps overlapping explosions from clipping) → speakers.
      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(ctx.destination);
      this.output = ctx.createGain();
      this.output.gain.value = this.volume;
      this.output.connect(compressor);

      const length = Math.round(ctx.sampleRate * NOISE_SECONDS);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      this.noise.copyToChannel(createNoiseSamples(length, this.rng), 0);
    }
    // Also 'interrupted' on iOS (a phone call, another app's sound).
    if (this.ctx.state !== 'running') void this.ctx.resume();
  };

  play(name: SoundName, pitch = 1): void {
    const { ctx, output } = this;
    if (!ctx || !output || this.volume <= 0) return;
    const recipe = this.sounds[name];
    if (!this.throttle.allow(name, recipe.cooldown, ctx.currentTime)) return;

    const start = ctx.currentTime + LOOKAHEAD;
    for (const layer of planSound(recipe, pitch, this.rng)) {
      if (layer.kind === 'tone') this.playTone(ctx, output, layer, start);
      else this.playNoise(ctx, output, layer, start);
    }
  }

  private envelope(ctx: AudioContext, layer: Envelope, start: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(SILENCE, start);
    gain.gain.linearRampToValueAtTime(layer.gain, start + layer.attack);
    gain.gain.exponentialRampToValueAtTime(SILENCE, start + layer.duration);
    return gain;
  }

  private playTone(ctx: AudioContext, output: AudioNode, layer: ToneLayer, at: number): void {
    const start = at + (layer.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    osc.frequency.setValueAtTime(layer.freq, start);
    if (layer.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(layer.freqEnd, start + layer.duration);
    }
    const gain = this.envelope(ctx, layer, start);
    osc.connect(gain).connect(output);
    osc.onended = () => gain.disconnect();
    osc.start(start);
    osc.stop(start + layer.duration + 0.02);
  }

  private playNoise(ctx: AudioContext, output: AudioNode, layer: NoiseLayer, at: number): void {
    if (!this.noise) return;
    const start = at + (layer.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.Q.value = layer.q ?? 1;
    filter.frequency.setValueAtTime(layer.cutoff, start);
    if (layer.cutoffEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(layer.cutoffEnd, start + layer.duration);
    }

    const gain = this.envelope(ctx, layer, start);
    source.connect(filter).connect(gain).connect(output);
    source.onended = () => {
      filter.disconnect();
      gain.disconnect();
    };
    // Start somewhere random in the buffer so consecutive bursts are not identical.
    source.start(start, this.rng.range(0, NOISE_SECONDS * 0.9));
    source.stop(start + layer.duration + 0.02);
  }
}
