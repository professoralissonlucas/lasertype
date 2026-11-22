// Test helper (never imported by the game): a simulated player who types at a given speed,
// makes mistakes and takes a moment to read each new word, playing the real rules at the
// real fixed timestep. Used to check the balance, not the rendering.
import { CONFIG } from '../../config.ts';
import { MODES } from '../../modes/index.ts';
import type { ModeId } from '../../modes/types.ts';
import { createRng, type Rng } from '../../utils/rng.ts';
import { getBossPhrases, getWordList } from '../../words/index.ts';
import type { Language } from '../../words/types.ts';
import { bossSpeed } from '../boss.ts';
import { isEmpReady } from '../combo.ts';
import { applyDifficulty } from '../difficulty.ts';
import { Spawner } from '../spawner.ts';
import { activateEmp, createMatchState, lockedWord, spawnBoss, stepMatch, typeChar, type MatchState } from '../state.ts';
import type { GameDifficulty, GameEvent, WordSource } from '../types.ts';

const DT = 1 / CONFIG.updatesPerSecond;
/** Never a letter of any word. */
const WRONG_KEY = '0';

export interface Skill {
  readonly wpm: number;
  /** Share of wrong keys. */
  readonly errorRate: number;
  /** Seconds to read each new word before its first letter. */
  readonly reaction: number;
}

export class Typist {
  private readonly skill: Skill;
  private readonly rng: Rng;
  private target = '';
  private nextKey = 0;

  constructor(skill: Skill, seed: string) {
    this.skill = skill;
    this.rng = createRng(`typist:${seed}`);
  }

  /** Presses a key when it is time to (call once per update, after \`stepMatch\`). */
  step(state: MatchState, events: GameEvent[]): void {
    const { boss } = state;
    // The lowest word is the most urgent; the EMP is for emergencies (never spent on a boss).
    const lowest = state.words.reduce<MatchState['words'][number] | null>((low, w) => (low && low.y >= w.y ? low : w), null);
    if (lowest && isEmpReady(state.combo.charge) && state.words.length >= 4 && lowest.y > 0.75) activateEmp(state, events);
    const word = lockedWord(state) ?? lowest;

    let id = '';
    let char: string | undefined;
    if (boss) {
      if (boss.alert > 0) return;
      id = `boss${boss.number}:${boss.index}`;
      char = boss.words[boss.index]?.[boss.typed];
    } else if (word) {
      id = String(word.id);
      char = word.text[word.typed];
    }
    if (char === undefined || state.elapsed < this.nextKey) return;
    if (id !== this.target) {
      this.target = id;
      this.nextKey = state.elapsed + this.skill.reaction;
      return;
    }
    const right = this.rng.next() >= this.skill.errorRate;
    typeChar(state, right ? char : WRONG_KEY, { requireAccents: false }, events);
    this.nextKey = state.elapsed + (60 / (this.skill.wpm * 5)) * this.rng.range(0.8, 1.2);
  }
}

export interface BossOutcome {
  readonly number: number;
  readonly defeated: boolean;
  /** How far down it was (1 = the perimeter). */
  readonly y: number;
  /** Seconds it was typed (the alert excluded). */
  readonly seconds: number;
}

export interface MatchOutcome {
  readonly state: MatchState;
  readonly bosses: readonly BossOutcome[];
  /** Shield when each wave was announced (index = wave). */
  readonly shieldAt: readonly number[];
}

export interface MatchSetup {
  readonly difficulty: GameDifficulty;
  readonly lang: Language;
  readonly seed: string;
  readonly skill: Skill;
  readonly mode?: ModeId;
  /** Without it, the match as it was before bosses existed. */
  readonly bosses?: boolean;
  /** Stops when this wave is announced. */
  readonly untilWave: number;
}

/** Plays a match until it ends or \`untilWave\` is announced. */
export function playMatch(setup: MatchSetup): MatchOutcome {
  const preset = CONFIG.difficulty[setup.difficulty];
  const mode = MODES[setup.mode ?? 'survival'];
  const state = createMatchState({ mode, difficulty: setup.difficulty });
  const source = new Spawner(setup.seed, getWordList(setup.lang), {
    spawn: applyDifficulty(CONFIG.spawn, preset),
    waves: CONFIG.waves,
    specials: CONFIG.specials,
    waveBreak: mode.waveBreak,
    ...(setup.bosses !== false && {
      boss: { config: CONFIG.boss, phrases: getBossPhrases(setup.lang), difficultySpeed: preset.speed },
    }),
  });
  const shieldAt: number[] = [];
  const bosses = run(state, source, new Typist(setup.skill, setup.seed), () => {
    shieldAt[state.wave] ??= state.shield;
    return state.wave >= setup.untilWave;
  });
  return { state, bosses, shieldAt };
}

/** One boss alone, with the speed it has at \`wave\`. */
export function fightBoss(wave: number, difficulty: GameDifficulty, phrase: string, skill: Skill, seed: string): BossOutcome {
  const state = createMatchState({ difficulty });
  state.wave = wave;
  const number = wave / CONFIG.boss.everyWaves;
  spawnBoss(state, { kind: 'boss', number, phrase, speed: bossSpeed(wave, CONFIG.difficulty[difficulty].speed) }, []);
  const idle: WordSource = { wave, update: () => null };
  const [outcome] = run(state, idle, new Typist(skill, seed), () => state.boss === null);
  if (!outcome) throw new Error('the boss never ended');
  return outcome;
}

function run(state: MatchState, source: WordSource, typist: Typist, done: () => boolean): BossOutcome[] {
  const outcomes: BossOutcome[] = [];
  let entered = 0;
  while (state.status === 'playing' && !done() && state.elapsed < CONFIG.ranking.maxDuration) {
    const events: GameEvent[] = [];
    stepMatch(state, DT, source, events);
    typist.step(state, events);
    for (const event of events) {
      if (event.type === 'bossEnter') entered = state.elapsed;
      if (event.type !== 'bossDefeated' && event.type !== 'bossBreach') continue;
      outcomes.push({
        number: event.boss.number,
        defeated: event.type === 'bossDefeated',
        y: event.boss.y,
        seconds: state.elapsed - entered,
      });
    }
  }
  return outcomes;
}
