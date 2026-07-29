export * from './columns';
export * from './contributions';
export * from './enums';
export * from './governance';
export * from './identity';
export * from './integrations';
export * from './places';
export * from './relations';
export * from './reports';

import {
  contributionPayloads,
  contributionPhotos,
  contributions,
  moderationEvents,
  moderationReviews,
} from './contributions';
import { auditLogs, placeChangeHistory } from './governance';
import {
  authAccounts,
  authLoginTokens,
  authSessions,
  refreshTokens,
  roles,
  userRoles,
  users,
} from './identity';
import {
  geocodingResults,
  googleFormSubmissions,
  idempotencyKeys,
  integrationSources,
} from './integrations';
import {
  categories,
  facilities,
  menus,
  operatingHourExceptions,
  operatingHours,
  placeCategories,
  placeFacilities,
  placePhotos,
  places,
} from './places';
import { placeConfirmations, placeReports, reportEvidence } from './reports';

export const databaseSchema = {
  users,
  roles,
  userRoles,
  authAccounts,
  refreshTokens,
  authLoginTokens,
  authSessions,
  places,
  categories,
  placeCategories,
  menus,
  facilities,
  placeFacilities,
  operatingHours,
  operatingHourExceptions,
  placePhotos,
  contributions,
  contributionPayloads,
  contributionPhotos,
  moderationReviews,
  moderationEvents,
  placeConfirmations,
  placeReports,
  reportEvidence,
  integrationSources,
  googleFormSubmissions,
  geocodingResults,
  idempotencyKeys,
  auditLogs,
  placeChangeHistory,
} as const;

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Menu = typeof menus.$inferSelect;
export type NewMenu = typeof menus.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
