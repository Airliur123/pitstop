import { relations } from 'drizzle-orm';

import {
  contributionPayloads,
  contributionPhotos,
  contributions,
  moderationReviews,
} from './contributions';
import { auditLogs, placeChangeHistory } from './governance';
import { authAccounts, refreshTokens, roles, userRoles, users } from './identity';
import { geocodingResults, googleFormSubmissions, integrationSources } from './integrations';
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

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles, { relationName: 'userRoleOwner' }),
  assignedRoles: many(userRoles, { relationName: 'userRoleAssigner' }),
  authAccounts: many(authAccounts),
  refreshTokens: many(refreshTokens),
  contributions: many(contributions),
  moderationReviews: many(moderationReviews),
  confirmations: many(placeConfirmations),
  reports: many(placeReports, { relationName: 'reportAuthor' }),
  reviewedReports: many(placeReports, { relationName: 'reportReviewer' }),
  auditLogs: many(auditLogs),
  placeChanges: many(placeChangeHistory),
  verifiedPlaces: many(places),
}));

export const rolesRelations = relations(roles, ({ many }) => ({ users: many(userRoles) }));
export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: 'userRoleOwner',
  }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  assigner: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
    relationName: 'userRoleAssigner',
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}));
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
  replacement: one(refreshTokens, {
    fields: [refreshTokens.replacedByTokenId],
    references: [refreshTokens.id],
    relationName: 'refreshTokenReplacement',
  }),
}));

export const placesRelations = relations(places, ({ many, one }) => ({
  verifier: one(users, { fields: [places.verifiedBy], references: [users.id] }),
  categories: many(placeCategories),
  menus: many(menus),
  facilities: many(placeFacilities),
  operatingHours: many(operatingHours),
  operatingHourExceptions: many(operatingHourExceptions),
  photos: many(placePhotos),
  contributions: many(contributions),
  moderationDuplicates: many(moderationReviews),
  confirmations: many(placeConfirmations),
  reports: many(placeReports),
  geocodingResults: many(geocodingResults),
  changeHistory: many(placeChangeHistory),
}));
export const categoriesRelations = relations(categories, ({ many }) => ({
  places: many(placeCategories),
}));
export const placeCategoriesRelations = relations(placeCategories, ({ one }) => ({
  place: one(places, { fields: [placeCategories.placeId], references: [places.id] }),
  category: one(categories, {
    fields: [placeCategories.categoryId],
    references: [categories.id],
  }),
}));
export const menusRelations = relations(menus, ({ one }) => ({
  place: one(places, { fields: [menus.placeId], references: [places.id] }),
}));
export const facilitiesRelations = relations(facilities, ({ many }) => ({
  places: many(placeFacilities),
}));
export const placeFacilitiesRelations = relations(placeFacilities, ({ one }) => ({
  place: one(places, { fields: [placeFacilities.placeId], references: [places.id] }),
  facility: one(facilities, {
    fields: [placeFacilities.facilityId],
    references: [facilities.id],
  }),
}));
export const operatingHoursRelations = relations(operatingHours, ({ one }) => ({
  place: one(places, { fields: [operatingHours.placeId], references: [places.id] }),
}));
export const operatingHourExceptionsRelations = relations(operatingHourExceptions, ({ one }) => ({
  place: one(places, {
    fields: [operatingHourExceptions.placeId],
    references: [places.id],
  }),
}));
export const placePhotosRelations = relations(placePhotos, ({ one }) => ({
  place: one(places, { fields: [placePhotos.placeId], references: [places.id] }),
}));

export const contributionsRelations = relations(contributions, ({ many, one }) => ({
  submitter: one(users, { fields: [contributions.submittedBy], references: [users.id] }),
  targetPlace: one(places, {
    fields: [contributions.targetPlaceId],
    references: [places.id],
  }),
  revisionOf: one(contributions, {
    fields: [contributions.revisionOfId],
    references: [contributions.id],
    relationName: 'contributionRevision',
  }),
  revisions: many(contributions, { relationName: 'contributionRevision' }),
  payload: one(contributionPayloads),
  photos: many(contributionPhotos),
  reviews: many(moderationReviews),
  geocodingResults: many(geocodingResults),
  googleFormSubmissions: many(googleFormSubmissions),
}));
export const contributionPayloadsRelations = relations(contributionPayloads, ({ one }) => ({
  contribution: one(contributions, {
    fields: [contributionPayloads.contributionId],
    references: [contributions.id],
  }),
}));
export const contributionPhotosRelations = relations(contributionPhotos, ({ one }) => ({
  contribution: one(contributions, {
    fields: [contributionPhotos.contributionId],
    references: [contributions.id],
  }),
}));
export const moderationReviewsRelations = relations(moderationReviews, ({ one }) => ({
  contribution: one(contributions, {
    fields: [moderationReviews.contributionId],
    references: [contributions.id],
  }),
  reviewer: one(users, { fields: [moderationReviews.reviewerId], references: [users.id] }),
  duplicatePlace: one(places, {
    fields: [moderationReviews.duplicatePlaceId],
    references: [places.id],
  }),
}));

export const placeConfirmationsRelations = relations(placeConfirmations, ({ one }) => ({
  place: one(places, { fields: [placeConfirmations.placeId], references: [places.id] }),
  user: one(users, { fields: [placeConfirmations.userId], references: [users.id] }),
}));
export const placeReportsRelations = relations(placeReports, ({ many, one }) => ({
  place: one(places, { fields: [placeReports.placeId], references: [places.id] }),
  reporter: one(users, {
    fields: [placeReports.reportedBy],
    references: [users.id],
    relationName: 'reportAuthor',
  }),
  reviewer: one(users, {
    fields: [placeReports.reviewedBy],
    references: [users.id],
    relationName: 'reportReviewer',
  }),
  evidence: many(reportEvidence),
}));
export const reportEvidenceRelations = relations(reportEvidence, ({ one }) => ({
  report: one(placeReports, { fields: [reportEvidence.reportId], references: [placeReports.id] }),
}));

export const integrationSourcesRelations = relations(integrationSources, ({ many }) => ({
  submissions: many(googleFormSubmissions),
}));
export const googleFormSubmissionsRelations = relations(googleFormSubmissions, ({ one }) => ({
  source: one(integrationSources, {
    fields: [googleFormSubmissions.integrationSourceId],
    references: [integrationSources.id],
  }),
  contribution: one(contributions, {
    fields: [googleFormSubmissions.contributionId],
    references: [contributions.id],
  }),
}));
export const geocodingResultsRelations = relations(geocodingResults, ({ one }) => ({
  contribution: one(contributions, {
    fields: [geocodingResults.contributionId],
    references: [contributions.id],
  }),
  place: one(places, { fields: [geocodingResults.placeId], references: [places.id] }),
}));
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
export const placeChangeHistoryRelations = relations(placeChangeHistory, ({ one }) => ({
  place: one(places, { fields: [placeChangeHistory.placeId], references: [places.id] }),
  actor: one(users, { fields: [placeChangeHistory.changedBy], references: [users.id] }),
}));
