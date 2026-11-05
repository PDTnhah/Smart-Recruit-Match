import { Inject, Injectable } from '@nestjs/common';
import {
  type CampaignStatus,
  isLowCompetitionSuggestion,
  type JdCompetition,
  type PreferenceItem,
  type ShortlistCampaign,
  type ShortlistItem,
  type ShortlistJd,
  type ShortlistResponse,
  type ShortlistState,
} from '@srm/shared';
import type { AuthUser } from '../../../common/auth/index.js';
import { DRIZZLE } from '../../../db/tokens.js';
import type { Database } from '../../../db/types.js';
import { CampaignService, type CampaignSettings } from '../../campaign/index.js';
import { JdService, type ShortlistJdCard } from '../../company/index.js';
import { type ActiveCv, CvService, studentIdOf } from '../../student/index.js';
import { jdCompetition } from '../domain/competition.js';
import { PREFERENCE_PHASES } from '../domain/preference-list.js';
import { RULES_VERSION } from '../domain/rules-version.js';
import {
  type ScoredPair,
  type ShortlistKeyRow,
  shortlistJdIds,
  type ShortlistSummary,
  shortlistSummary,
  type ShortlistView,
  shortlistView,
} from '../domain/shortlist-view.js';
import { MatchResultsRepository } from '../infrastructure/match-results.repository.js';
import { MatchRunsRepository } from '../infrastructure/match-runs.repository.js';
import { PreferencesRepository } from '../infrastructure/preferences.repository.js';
import { CompetitionService } from './competition.service.js';

/** A draft is not open yet and a closed campaign is over: neither has a shortlist to show (CONTEXT D47). */
const NO_SHORTLIST: readonly CampaignStatus[] = ['DRAFT', 'CLOSED'];

type JdView = ShortlistView<ShortlistJdCard>;

/**
 * Shortlists of GĐ3 (FR-15, NFR-4, US-3.3 AC-1–AC-4, CONTEXT D47): which JDs a student is suggested
 * and why, read from the stored results only, never from the LLM (AD-2). The same view decides
 * which JDs a preference list may hold, whom Q6 assigns and whom the reminder reaches.
 */
@Injectable()
export class ShortlistService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly campaigns: CampaignService,
    private readonly cvs: CvService,
    private readonly jds: JdService,
    private readonly results: MatchResultsRepository,
    private readonly runs: MatchRunsRepository,
    private readonly preferences: PreferencesRepository,
    private readonly competition: CompetitionService,
  ) {}

  /**
   * The caller's shortlist in the campaign of their newest active CV (AC-1–AC-4). The student comes
   * from the token (AGENTS › Invariant 7), so nothing of another student can be asked for.
   */
  async forStudent(user: AuthUser): Promise<ShortlistResponse> {
    const studentId = studentIdOf(user);
    const found = await this.currentCampaignOf(studentId);
    if (!found) return emptyResponse('NO_CONFIRMED_CV', null, []);
    const { campaign, cv } = found;
    const preferences = await this.preferences.listOf(campaign.id, studentId);
    const header = this.headerOf(campaign);
    if (cv.status !== 'CONFIRMED') return emptyResponse('NO_CONFIRMED_CV', header, preferences);

    const [view, running] = await Promise.all([this.viewOf(campaign, cv), this.runs.hasRunning(campaign.id)]);
    const ranks = new Map(preferences.map((preference) => [preference.jdId, preference.rank]));
    const counts = await this.competition.counts(
      campaign,
      view.shortlist.map((pair) => pair.jdId),
    );
    const thresholds = campaign.config.competition_thresholds;
    // AC-4: no result for the CV yet is "still scoring", not an empty shortlist.
    const scoring = running || (!view.judged && view.pending > 0);
    return {
      state: scoring ? 'SCORING' : 'READY',
      campaign: header,
      items: view.shortlist.map((pair) =>
        itemOf(pair, ranks.get(pair.jdId) ?? null, jdCompetition(counts.get(pair.jdId) ?? 0, pair.jd.quota, thresholds)),
      ),
      ineligible: view.ineligible.map(({ jd, reasons }) => ({ jd: cardOf(jd), reasons })),
      belowThresholdCount: view.belowThreshold,
      notScoredCount: view.notScored,
      pendingCount: view.pending,
      preferences,
    };
  }

  /**
   * BR-04: the JDs the student may choose in the campaign, best first; none without an active
   * confirmed CV there.
   */
  async jdIdsFor(studentId: number, campaign: CampaignSettings): Promise<number[]> {
    const cv = (await this.cvs.activeCvsOf(studentId)).find(
      (active) => active.campaignId === campaign.id && active.status === 'CONFIRMED',
    );
    return cv ? shortlistJdIds(await this.viewOf(campaign, cv)) : [];
  }

  /**
   * The shortlist of every student with an active confirmed CV in the campaign, by student id (Q6,
   * reminder): the lean rows only, the same buckets and order as the student's own view.
   */
  async summariesByStudent(campaign: CampaignSettings): Promise<Map<number, ShortlistSummary>> {
    const pinnedPrompt = await this.results.pinnedPrompt(this.db, campaign.id);
    const [cvs, jds, rows] = await Promise.all([
      this.cvs.listConfirmedKeys(campaign.id),
      this.jds.listShortlistCards(campaign.id),
      this.results.listShortlistKeys(campaign.id, RULES_VERSION, pinnedPrompt),
    ]);
    const rowsByCv = new Map<number, ShortlistKeyRow[]>();
    for (const row of rows) {
      const own = rowsByCv.get(row.cvId);
      if (own) own.push(row);
      else rowsByCv.set(row.cvId, [row]);
    }
    const byStudent = new Map<number, ShortlistSummary>();
    for (const cv of cvs) {
      byStudent.set(
        cv.studentId,
        shortlistSummary({ cv, jds, rows: rowsByCv.get(cv.cvId) ?? [], pinnedPrompt, thetaCv: campaign.config.theta_cv }),
      );
    }
    return byStudent;
  }

  /** Whether a matching run of the campaign is still waiting for results (AC-4, Q6). */
  async isScoring(campaignId: number): Promise<boolean> {
    return this.runs.hasRunning(campaignId);
  }

  private async viewOf(campaign: CampaignSettings, cv: ActiveCv): Promise<JdView> {
    const pinnedPrompt = await this.results.pinnedPrompt(this.db, campaign.id);
    const [jds, rows] = await Promise.all([
      this.jds.listShortlistCards(campaign.id),
      this.results.listForShortlist(campaign.id, RULES_VERSION, pinnedPrompt, [cv.cvId]),
    ]);
    return shortlistView({ cv, jds, rows, pinnedPrompt, thetaCv: campaign.config.theta_cv });
  }

  /** The campaign of the student's newest active CV that is neither a draft nor closed (CONTEXT D47). */
  private async currentCampaignOf(studentId: number): Promise<{ campaign: CampaignSettings; cv: ActiveCv } | null> {
    for (const cv of await this.cvs.activeCvsOf(studentId)) {
      const campaign = await this.campaigns.getSettings(cv.campaignId);
      if (!NO_SHORTLIST.includes(campaign.status)) return { campaign, cv };
    }
    return null;
  }

  private headerOf(campaign: CampaignSettings): ShortlistCampaign {
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      preferenceEnd: campaign.phaseDeadlines.preference_end ?? null,
      nNv: campaign.config.n_nv,
      requireFullPreferences: campaign.config.require_full_preferences,
      editable: this.campaigns.isPhaseOpen(campaign, PREFERENCE_PHASES),
    };
  }
}

function emptyResponse(
  state: ShortlistState,
  campaign: ShortlistCampaign | null,
  preferences: PreferenceItem[],
): ShortlistResponse {
  return {
    state,
    campaign,
    items: [],
    ineligible: [],
    belowThresholdCount: 0,
    notScoredCount: 0,
    pendingCount: 0,
    preferences,
  };
}

function cardOf(jd: ShortlistJdCard): ShortlistJd {
  return {
    id: jd.jdId,
    title: jd.title,
    companyName: jd.companyName,
    positionGroup: jd.positionGroup,
    location: jd.location,
    workMode: jd.workMode,
  };
}

/**
 * AC-1, AC-16, AC-17: everything the stored result says about the pair, as the student sees it;
 * with the JD's competition level and the "Phù hợp – ít cạnh tranh" label (US-3.4 AC-4, CONTEXT D48).
 */
function itemOf(pair: ScoredPair<ShortlistJdCard>, preferenceRank: number | null, competition: JdCompetition): ShortlistItem {
  const { criteria, assessment } = pair;
  const project = assessment.project_relevance;
  // A quote the check did not find in the CV is flagged, as is one the check missed (CONTEXT D46).
  const matched = new Map(assessment.evidence_check.map((check) => [check.quote, check.matched]));
  return {
    jd: cardOf(pair.jd),
    sCv: pair.scvX100 / 100,
    breakdown: pair.breakdown,
    skills: { must_have: criteria.must_have, nice_to_have: criteria.nice_to_have },
    zones: criteria.zones,
    language: criteria.language,
    education: criteria.education,
    project: {
      score: project.score_0_4,
      reason: project.reason,
      quotes: project.evidence.map((quote) => ({ quote, matched: matched.get(quote) ?? false })),
    },
    gaps: criteria.gaps,
    strengths: assessment.strengths,
    suggestions: assessment.suggestions,
    summary: assessment.summary,
    preferenceRank,
    competition,
    lowCompetitionSuggestion: isLowCompetitionSuggestion(competition),
  };
}
