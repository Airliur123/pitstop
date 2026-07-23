import type {
  OpenStatus,
  PublicRecommendation,
  RankingReason,
  RecommendationScore,
} from '@pitstop/contracts';
import type { DatabasePublicPlace } from '@pitstop/database';

import { mapPublicPlace } from '../public-places/public-place.mapper';
import { resolveOpenStatus } from './open-status';

const dayMilliseconds = 86_400_000;

interface RankedCandidate {
  readonly recommendation: PublicRecommendation;
  readonly source: DatabasePublicPlace;
}

export interface RankRecommendationsInput {
  readonly candidates: readonly DatabasePublicPlace[];
  readonly budgetAmount: number | null;
  readonly budgetApplied: boolean;
  readonly radiusMeters: number;
  readonly limit: number;
  readonly now: Date;
}

export function rankRecommendations(
  input: RankRecommendationsInput,
): readonly PublicRecommendation[] {
  const scored = input.candidates
    .map((candidate): RankedCandidate | null => {
      const openStatus = resolveOpenStatus(
        candidate.operatingHours,
        candidate.operatingHourExceptions,
        input.now,
      );
      if (openStatus === 'CLOSED') return null;
      const score = recommendationScore(candidate, openStatus, input);
      return {
        source: candidate,
        recommendation: {
          ...mapPublicPlace(candidate, input.budgetApplied),
          openStatus,
          cheapestQualifyingItem: candidate.cheapestQualifyingItem,
          rankingReason: 'NEAREST_VERIFIED',
          score,
        },
      };
    })
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort(compareRankedCandidates);

  const nearestDistance = Math.min(...scored.map((candidate) => candidate.source.distanceMeters));
  const cheapestAmount = Math.min(
    ...scored.map(
      (candidate) =>
        candidate.source.cheapestQualifyingItem?.priceAmount ?? Number.POSITIVE_INFINITY,
    ),
  );
  return scored.slice(0, input.limit).map(({ recommendation, source }) => ({
    ...recommendation,
    rankingReason: rankingReason(
      source,
      recommendation,
      input.budgetApplied,
      nearestDistance,
      cheapestAmount,
    ),
  }));
}

function recommendationScore(
  candidate: DatabasePublicPlace,
  openStatus: OpenStatus,
  input: RankRecommendationsInput,
): RecommendationScore {
  const budgetFit = budgetFitScore(candidate, input.budgetAmount, input.budgetApplied);
  const distance = clamp(1 - candidate.distanceMeters / input.radiusMeters);
  const open = openStatus === 'OPEN' ? 1 : openStatus === 'CLOSING_SOON' ? 0.55 : 0.35;
  const freshnessAgeDays = Math.max(
    0,
    (input.now.valueOf() - Date.parse(candidate.dataFreshnessAt)) / dayMilliseconds,
  );
  const freshness = clamp(1 - freshnessAgeDays / 90);
  const community = clamp(candidate.communityConfirmationCount / 5);
  return {
    total: round(
      0.35 * budgetFit + 0.3 * distance + 0.2 * open + 0.1 * freshness + 0.05 * community,
    ),
    budgetFit: round(budgetFit),
    distance: round(distance),
    open: round(open),
    freshness: round(freshness),
    community: round(community),
  };
}

function budgetFitScore(
  candidate: DatabasePublicPlace,
  budgetAmount: number | null,
  budgetApplied: boolean,
): number {
  if (!budgetApplied) return 1;
  const price = candidate.cheapestQualifyingItem?.priceAmount;
  if (price === undefined || budgetAmount === null) return 0;
  if (budgetAmount === 0) return price === 0 ? 1 : 0;
  return clamp(1 - price / budgetAmount);
}

function compareRankedCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return (
    right.recommendation.score.total - left.recommendation.score.total ||
    left.source.distanceMeters - right.source.distanceMeters ||
    (left.source.cheapestQualifyingItem?.priceAmount ?? Number.POSITIVE_INFINITY) -
      (right.source.cheapestQualifyingItem?.priceAmount ?? Number.POSITIVE_INFINITY) ||
    Date.parse(right.source.dataFreshnessAt) - Date.parse(left.source.dataFreshnessAt) ||
    left.source.id.localeCompare(right.source.id)
  );
}

function rankingReason(
  source: DatabasePublicPlace,
  recommendation: PublicRecommendation,
  budgetApplied: boolean,
  nearestDistance: number,
  cheapestAmount: number,
): RankingReason {
  if (budgetApplied && source.distanceMeters === nearestDistance) return 'NEAREST_WITHIN_BUDGET';
  if (
    budgetApplied &&
    source.cheapestQualifyingItem?.priceAmount !== undefined &&
    source.cheapestQualifyingItem.priceAmount === cheapestAmount
  ) {
    return 'CHEAPEST_NEARBY';
  }
  if (recommendation.openStatus === 'OPEN' && recommendation.score.freshness >= 0.5) {
    return 'OPEN_AND_FRESH';
  }
  return 'NEAREST_VERIFIED';
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
