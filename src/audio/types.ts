// Procedural sound effects: every sound is a recipe (pure data) of oscillator and noise
// layers, synthesized at runtime with Web Audio. No audio files.
// A future `soundPack` cosmetic is just another set of recipes.

export type SoundName =
  | 'shot'
  | 'miss'
  | 'unlock'
  | 'explosion'
  | 'breach'
  | 'gameover'
  | 'armor'
  | 'bomb'
  | 'freeze'
  | 'shieldUp'
  | 'emp'
  | 'empReady'
  | 'multiplier'
  | 'wave'
  | 'purchase'
  | 'equip';

/** Attack-then-exponential-release volume envelope. Times in seconds. */
export interface Envelope {
  /** Seconds from silence to `gain`. */
  readonly attack: number;
  /** Total length (attack included) until silence. */
  readonly duration: number;
  /** Peak gain (0..1, before the master volume). */
  readonly gain: number;
  /** Seconds after the sound starts. */
  readonly delay?: number;
}

export interface ToneLayer extends Envelope {
  readonly kind: 'tone';
  readonly wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** Start frequency (Hz). */
  readonly freq: number;
  /** Optional end frequency (Hz): exponential glide over the duration. */
  readonly freqEnd?: number;
}

export interface NoiseLayer extends Envelope {
  readonly kind: 'noise';
  readonly filter: 'lowpass' | 'highpass' | 'bandpass';
  /** Filter cutoff (Hz). */
  readonly cutoff: number;
  /** Optional end cutoff (Hz): exponential sweep over the duration. */
  readonly cutoffEnd?: number;
  /** Filter resonance. */
  readonly q?: number;
}

export type SoundLayer = ToneLayer | NoiseLayer;

export interface SoundRecipe {
  readonly layers: readonly SoundLayer[];
  /** Random pitch variation per play, ± this fraction (keeps repeats from sounding robotic). */
  readonly pitchJitter: number;
  /** Minimum seconds between two plays of this sound. */
  readonly cooldown: number;
}

export type SoundPack = Readonly<Record<SoundName, SoundRecipe>>;

/** What the game needs from the audio side (lets tests and future packs swap it). */
export interface SoundPlayer {
  /** `pitch` multiplies every frequency (1 = as designed). */
  play(name: SoundName, pitch?: number): void;
}
