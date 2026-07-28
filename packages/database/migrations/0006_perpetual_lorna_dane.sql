CREATE INDEX `idx_contributions_submitter_id` ON `contributions` (`submitted_by`,`id`);--> statement-breakpoint
CREATE INDEX `idx_contributions_submitted_at` ON `contributions` (`submitted_at`);