// Boss rules (pure): which waves end with one, its phrase, speed and bonus.
// The phrase comes from its own random stream, so bosses never change the word sequence of
// a seed (Daily Challenge), and the N-th boss of a seed is always the same.
import { CONFIG } from '../config.ts';
import { createRng, shuffled } from '../utils/rng.ts';
import { BOSS_TIERS, type BossPhrases, type BossTier } from '../words/types.ts';
import type { Boss } from './entities/Boss.ts';
import type { BossConfig, SpawnedBoss, SpawnParams, WaveConfig } from './types.ts';
import { waveParams } from './waves.ts';

/** Which boss closes `wave`: 1 for the first one, 0 when the wave has none. */
export function bossNumber(wave: number, config: BossConfig = CONFIG.boss): number {
  return wave > 0 && wave % config.everyWaves === 0 ? wave / config.everyWaves : 0;
}

/** Phrases grow with each boss: small, medium, then large for good. */
export function bossTier(number: number): BossTier {
  return BOSS_TIERS[Math.min(number, BOSS_TIERS.length) - 1] ?? 'small';
}

/** The phrase of the N-th boss of a match, never repeating one until the tier runs out. */
export function bossPhrase(seed: number | string, number: number, phrases: BossPhrases): string {
  const tier = bossTier(number);
  const order = shuffled(createRng(`${seed}:boss:${tier}`), phrases[tier]);
  // How many bosses of this tier came before this one.
  const nth = number - 1 - BOSS_TIERS.indexOf(tier);
  const phrase = order[nth % order.length];
  if (phrase === undefined) throw new Error(`boss: no ${tier} phrases`);
  return phrase;
}

/**
 * Descent speed: the whole field in `fallSeconds` on Normal at wave-1 speed, faster with the
 * wave and the difficulty exactly like the words are. `difficultySpeed` = the preset's `speed`.
 */
export function bossSpeed(
  wave: number,
  difficultySpeed: number,
  config: BossConfig = CONFIG.boss,
  spawn: SpawnParams = CONFIG.spawn,
  waves: WaveConfig = CONFIG.waves,
): number {
  return (waveParams(wave, spawn, waves).speedMultiplier * difficultySpeed) / config.fallSeconds;
}

/** Points for defeating the N-th boss (on top of the points of its words). */
export function bossBonus(number: number, config: BossConfig = CONFIG.boss): number {
  return Math.min(config.maxBonus, config.firstBonus + config.bonusStep * Math.max(0, number - 1));
}

export function createBoss(spawned: SpawnedBoss, config: BossConfig = CONFIG.boss): Boss {
  return {
    number: spawned.number,
    words: spawned.phrase.split(' '),
    speed: spawned.speed,
    y: 0,
    prevY: 0,
    alert: config.alertSeconds,
    index: 0,
    typed: 0,
    flawed: false,
  };
}
