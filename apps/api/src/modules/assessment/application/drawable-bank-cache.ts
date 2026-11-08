import { Injectable } from '@nestjs/common';
import type { ExamBlueprint } from '@srm/shared';
import type { DrawCandidate } from '../domain/draw-exam.js';
import { QuestionBankService } from './question-bank.service.js';

/** What a draw needs of a locked bank version: no content, no answer key. */
export interface CachedBank {
  bankId: number;
  version: number;
  blueprint: ExamBlueprint;
  candidates: DrawCandidate[];
}

/** Bank versions kept; a campaign has one bank per JD, and a retirement adds a version. */
const MAX_ENTRIES = 50;

/**
 * Drawable questions of each locked bank version, kept in the process (US-4.3 performance budget,
 * CONTEXT D51): 200 students starting together read the bank once, since a read under way is shared
 * as well. A `(bankId, version)` never changes, so an entry is never stale; the start transaction
 * still checks the version it drew from. A failed read is not kept.
 */
@Injectable()
export class DrawableBankCache {
  private readonly entries = new Map<string, Promise<CachedBank>>();

  constructor(private readonly banks: QuestionBankService) {}

  /**
   * The bank at `version` if cached, else its current version, read and kept. 409 BANK_NOT_LOCKED
   * for a bank that is not locked.
   */
  get(bankId: number, version: number): Promise<CachedBank> {
    const key = keyOf(bankId, version);
    const cached = this.entries.get(key);
    if (cached) return cached;
    const loading = this.load(bankId);
    this.remember(key, loading);
    loading.then(
      (loaded) => {
        // The bank moved on since the caller read its version: keep the read under its own.
        if (loaded.version === version) return;
        this.forget(key, loading);
        this.remember(keyOf(bankId, loaded.version), loading);
      },
      () => this.forget(key, loading),
    );
    return loading;
  }

  private async load(bankId: number): Promise<CachedBank> {
    const drawable = await this.banks.getDrawableQuestions(bankId);
    return {
      bankId,
      version: drawable.version,
      blueprint: drawable.blueprint,
      candidates: drawable.questions.map((question) => ({
        id: question.id,
        type: question.type,
        skill: question.skill,
        difficulty: question.difficulty,
        optionCount: question.content.options?.length ?? 0,
      })),
    };
  }

  private remember(key: string, entry: Promise<CachedBank>): void {
    this.entries.set(key, entry);
    // Maps iterate in insertion order: drop the oldest entries.
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= MAX_ENTRIES) break;
      this.entries.delete(oldest);
    }
  }

  private forget(key: string, entry: Promise<CachedBank>): void {
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }
}

const keyOf = (bankId: number, version: number) => `${bankId}:${version}`;
