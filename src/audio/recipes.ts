// Default sound pack: synthesized at runtime, no audio files.
import type { SoundPack } from './types.ts';

export const DEFAULT_SOUNDS: SoundPack = {
  // Laser zap: fast downward chirp with a thin octave on top.
  shot: {
    pitchJitter: 0.03,
    cooldown: 0.015,
    layers: [
      { kind: 'tone', wave: 'square', freq: 1320, freqEnd: 520, attack: 0.002, duration: 0.07, gain: 0.07 },
      { kind: 'tone', wave: 'sine', freq: 2640, freqEnd: 1040, attack: 0.002, duration: 0.05, gain: 0.03 },
    ],
  },

  // Wrong key: short low buzz from two slightly detuned squares.
  miss: {
    pitchJitter: 0,
    cooldown: 0.05,
    layers: [
      { kind: 'tone', wave: 'square', freq: 140, freqEnd: 110, attack: 0.004, duration: 0.14, gain: 0.08 },
      { kind: 'tone', wave: 'square', freq: 147, freqEnd: 116, attack: 0.004, duration: 0.14, gain: 0.06 },
    ],
  },

  // Target released: soft descending blip.
  unlock: {
    pitchJitter: 0,
    cooldown: 0.05,
    layers: [{ kind: 'tone', wave: 'sine', freq: 660, freqEnd: 330, attack: 0.003, duration: 0.08, gain: 0.07 }],
  },

  // Word destroyed: noise burst closing down, a sub thump and a bright crack.
  explosion: {
    pitchJitter: 0.08,
    cooldown: 0.03,
    layers: [
      { kind: 'noise', filter: 'lowpass', cutoff: 2400, cutoffEnd: 180, q: 0.8, attack: 0.003, duration: 0.45, gain: 0.4 },
      { kind: 'tone', wave: 'sine', freq: 140, freqEnd: 42, attack: 0.003, duration: 0.3, gain: 0.32 },
      { kind: 'noise', filter: 'highpass', cutoff: 3000, attack: 0.001, duration: 0.06, gain: 0.1 },
    ],
  },

  // Shield hit: heavy low rumble plus a two-beep warning.
  breach: {
    pitchJitter: 0,
    cooldown: 0.1,
    layers: [
      { kind: 'tone', wave: 'sawtooth', freq: 90, freqEnd: 45, attack: 0.005, duration: 0.55, gain: 0.22 },
      { kind: 'noise', filter: 'lowpass', cutoff: 900, cutoffEnd: 120, q: 1, attack: 0.005, duration: 0.5, gain: 0.32 },
      { kind: 'tone', wave: 'square', freq: 660, attack: 0.002, duration: 0.09, gain: 0.05 },
      { kind: 'tone', wave: 'square', freq: 520, attack: 0.002, duration: 0.09, gain: 0.05, delay: 0.11 },
    ],
  },

  // Armor plate broken: metallic clank (resonant noise + bright tick).
  armor: {
    pitchJitter: 0.05,
    cooldown: 0.03,
    layers: [
      { kind: 'tone', wave: 'square', freq: 1800, freqEnd: 900, attack: 0.001, duration: 0.05, gain: 0.05 },
      { kind: 'noise', filter: 'bandpass', cutoff: 2500, q: 6, attack: 0.001, duration: 0.12, gain: 0.2 },
      { kind: 'tone', wave: 'triangle', freq: 600, attack: 0.002, duration: 0.15, gain: 0.08 },
    ],
  },

  // Bomb word: deeper, longer blast than a normal explosion.
  bomb: {
    pitchJitter: 0.05,
    cooldown: 0.05,
    layers: [
      { kind: 'noise', filter: 'lowpass', cutoff: 1800, cutoffEnd: 80, q: 0.7, attack: 0.004, duration: 0.7, gain: 0.45 },
      { kind: 'tone', wave: 'sine', freq: 90, freqEnd: 30, attack: 0.004, duration: 0.5, gain: 0.4 },
    ],
  },

  // Ice word: glassy shimmer sliding down.
  freeze: {
    pitchJitter: 0,
    cooldown: 0.1,
    layers: [
      { kind: 'tone', wave: 'sine', freq: 2400, freqEnd: 1200, attack: 0.005, duration: 0.35, gain: 0.06 },
      { kind: 'tone', wave: 'triangle', freq: 3200, freqEnd: 1600, attack: 0.005, duration: 0.3, gain: 0.04, delay: 0.05 },
      { kind: 'noise', filter: 'highpass', cutoff: 5000, attack: 0.01, duration: 0.3, gain: 0.05 },
    ],
  },

  // Shield word: rising major arpeggio.
  shieldUp: {
    pitchJitter: 0,
    cooldown: 0.2,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 523, attack: 0.005, duration: 0.12, gain: 0.1 },
      { kind: 'tone', wave: 'triangle', freq: 659, attack: 0.005, duration: 0.12, gain: 0.1, delay: 0.08 },
      { kind: 'tone', wave: 'triangle', freq: 784, attack: 0.005, duration: 0.25, gain: 0.12, delay: 0.16 },
    ],
  },

  // EMP: rising filtered whoosh over a falling sub and a zap.
  emp: {
    pitchJitter: 0,
    cooldown: 0.3,
    layers: [
      { kind: 'noise', filter: 'bandpass', cutoff: 200, cutoffEnd: 4000, q: 2, attack: 0.01, duration: 0.6, gain: 0.35 },
      { kind: 'tone', wave: 'sine', freq: 120, freqEnd: 40, attack: 0.005, duration: 0.7, gain: 0.35 },
      { kind: 'tone', wave: 'square', freq: 880, freqEnd: 110, attack: 0.002, duration: 0.4, gain: 0.05 },
    ],
  },

  // EMP charge full: two bright notes.
  empReady: {
    pitchJitter: 0,
    cooldown: 0.5,
    layers: [
      { kind: 'tone', wave: 'sine', freq: 880, attack: 0.005, duration: 0.1, gain: 0.08 },
      { kind: 'tone', wave: 'sine', freq: 1320, attack: 0.005, duration: 0.2, gain: 0.08, delay: 0.1 },
    ],
  },

  // New combo multiplier tier: quick upward blip.
  multiplier: {
    pitchJitter: 0,
    cooldown: 0.1,
    layers: [
      { kind: 'tone', wave: 'square', freq: 660, freqEnd: 990, attack: 0.003, duration: 0.09, gain: 0.05 },
      { kind: 'tone', wave: 'sine', freq: 1320, attack: 0.003, duration: 0.12, gain: 0.05, delay: 0.06 },
    ],
  },

  // New wave: two-note chime.
  wave: {
    pitchJitter: 0,
    cooldown: 0.5,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 392, attack: 0.01, duration: 0.18, gain: 0.1 },
      { kind: 'tone', wave: 'triangle', freq: 523, attack: 0.01, duration: 0.3, gain: 0.12, delay: 0.15 },
    ],
  },

  // Game over: three falling notes over a low tone.
  gameover: {
    pitchJitter: 0,
    cooldown: 1,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 440, attack: 0.01, duration: 0.22, gain: 0.15 },
      { kind: 'tone', wave: 'triangle', freq: 330, attack: 0.01, duration: 0.22, gain: 0.15, delay: 0.2 },
      { kind: 'tone', wave: 'triangle', freq: 220, attack: 0.01, duration: 0.55, gain: 0.17, delay: 0.4 },
      { kind: 'tone', wave: 'sine', freq: 110, attack: 0.02, duration: 0.65, gain: 0.12, delay: 0.4 },
    ],
  },
};
