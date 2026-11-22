// Finds the Daily Challenge bonuses an account earned on closed days: reads its score on each
// day's board (one read per day) and counts who scored more (one aggregate read), then hands
// the result to the account, which pays it in its own reward write. Days go oldest first and
// stop at the first failure, so a day is never skipped.
import { CONFIG } from '../config.ts';
import { dailyBoard } from '../firebase/leaderboard.ts';
import type { Board, RankRow } from '../firebase/types.ts';
import { dailyBonusCoins, daysToSettle, type DailyBonus } from './dailyBonus.ts';
import type { DailyBonusConfig } from './types.ts';

/** The ranking side (Leaderboard). */
export interface BonusBoards {
  own(board: Board, uid: string): Promise<RankRow | null>;
  /** 1 + how many players scored more; null when there is no server. */
  position(board: Board, score: number): Promise<number | null>;
}

/** The account side (FirestoreInventoryRepository). */
export interface BonusAccount {
  /** The account whose users/{uid} was read this session, null until then. */
  readonly readyUid: string | null;
  /** Last closed day already settled (bonus queued, paid, or nothing to pay). */
  readonly dailySettled: number | null;
  /** Records `day` as settled and queues its bonus, if any. */
  settleDaily(day: number, bonus: DailyBonus | null): void;
}

export class DailyBonusCollector {
  private readonly account: BonusAccount;
  private readonly boards: BonusBoards;
  private readonly config: DailyBonusConfig;
  private readonly now: () => number;
  private readonly running = new Set<string>();

  constructor(
    account: BonusAccount,
    boards: BonusBoards,
    config: DailyBonusConfig = CONFIG.dailyBonus,
    now: () => number = Date.now,
  ) {
    this.account = account;
    this.boards = boards;
    this.config = config;
    this.now = now;
  }

  /** Settles the closed days of the current account. Cheap to call often: no reads when done. */
  async collect(): Promise<void> {
    const uid = this.account.readyUid;
    if (uid === null || this.running.has(uid)) return;
    this.running.add(uid);
    try {
      for (const day of daysToSettle(this.now(), this.account.dailySettled, this.config)) {
        const bonus = await this.bonusOf(day, uid);
        if (this.account.readyUid !== uid) return; // signed out or switched meanwhile
        this.account.settleDaily(day, bonus);
      }
    } catch {
      // No network: this day and the later ones wait for the next call.
    } finally {
      this.running.delete(uid);
    }
  }

  private async bonusOf(day: number, uid: string): Promise<DailyBonus | null> {
    const { lang, minScore } = this.config;
    const board = dailyBoard(lang, day);
    const row = await this.boards.own(board, uid);
    if (!row || row.score < minScore) return null;
    const position = await this.boards.position(board, row.score);
    if (position === null) return null;
    const coins = dailyBonusCoins(position, row.score, lang, this.config);
    return coins > 0 ? { day, position, coins } : null;
  }
}
