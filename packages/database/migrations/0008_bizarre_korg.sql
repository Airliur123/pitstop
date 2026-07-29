CREATE TABLE `duplicate_place_hints` (
	`id` char(26) NOT NULL,
	`contribution_id` char(26) NOT NULL,
	`google_form_submission_id` char(26) NOT NULL,
	`candidate_place_id` char(26) NOT NULL,
	`distance_meters` int unsigned NOT NULL,
	`matched_signals` json NOT NULL,
	`hint_score` decimal(5,4) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `duplicate_place_hints_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_duplicate_hint_contribution_place` UNIQUE(`contribution_id`,`candidate_place_id`),
	CONSTRAINT `chk_duplicate_hint_distance` CHECK(`duplicate_place_hints`.`distance_meters` >= 0),
	CONSTRAINT `chk_duplicate_hint_score` CHECK(`duplicate_place_hints`.`hint_score` >= 0 AND `duplicate_place_hints`.`hint_score` <= 1)
);
--> statement-breakpoint
ALTER TABLE `geocoding_results` RENAME COLUMN `formatted_address` TO `normalized_address`;--> statement-breakpoint
ALTER TABLE `google_form_submissions` DROP CONSTRAINT `chk_google_form_signature_version`;--> statement-breakpoint
ALTER TABLE `google_form_submissions` RENAME COLUMN `signature_version` TO `payload_schema_version`;--> statement-breakpoint
ALTER TABLE `geocoding_results` MODIFY COLUMN `raw_response` json;--> statement-breakpoint
ALTER TABLE `google_form_submissions` MODIFY COLUMN `processing_status` enum('RECEIVED','QUEUED','PROCESSING','PROCESSED','FAILED','COMPLETED','RETRYABLE_FAILURE','DEAD_LETTER','REJECTED_INVALID') NOT NULL DEFAULT 'RECEIVED';--> statement-breakpoint
UPDATE `google_form_submissions` SET `processing_status` = CASE
	WHEN `processing_status` = 'PROCESSED' THEN 'COMPLETED'
	WHEN `processing_status` = 'FAILED' THEN 'RETRYABLE_FAILURE'
	ELSE `processing_status`
END;--> statement-breakpoint
ALTER TABLE `google_form_submissions` MODIFY COLUMN `processing_status` enum('RECEIVED','QUEUED','PROCESSING','COMPLETED','RETRYABLE_FAILURE','DEAD_LETTER','REJECTED_INVALID') NOT NULL DEFAULT 'RECEIVED';--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD `status` enum('SUCCEEDED','LOW_CONFIDENCE','NOT_FOUND','FAILED') DEFAULT 'FAILED' NOT NULL;--> statement-breakpoint
ALTER TABLE `geocoding_results` ALTER COLUMN `status` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `request_hash` char(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ALTER COLUMN `request_hash` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `accepted_key_id` varchar(64) DEFAULT 'migration-unconfigured' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ALTER COLUMN `accepted_key_id` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `correlation_id` varchar(128) DEFAULT 'migration-legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ALTER COLUMN `correlation_id` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `submitted_at` timestamp(3);--> statement-breakpoint
UPDATE `google_form_submissions` SET `submitted_at` = `received_at` WHERE `submitted_at` IS NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` MODIFY COLUMN `submitted_at` timestamp(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `queued_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `attempt_count` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `last_error_class` varchar(80);--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `last_error_code` varchar(120);--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `geocoding_status` enum('PENDING','PROCESSING','SUCCEEDED','LOW_CONFIDENCE','FAILED','SKIPPED') DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `duplicate_detection_status` enum('PENDING','PROCESSING','SUCCEEDED','LOW_CONFIDENCE','FAILED','SKIPPED') DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `created_at` timestamp(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD `updated_at` timestamp(3) DEFAULT CURRENT_TIMESTAMP(3) NOT NULL ON UPDATE CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `integration_sources` ADD `current_key_id` varchar(64) DEFAULT 'migration-unconfigured' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_sources` ALTER COLUMN `current_key_id` DROP DEFAULT;--> statement-breakpoint
ALTER TABLE `integration_sources` ADD `previous_key_id` varchar(64);--> statement-breakpoint
ALTER TABLE `integration_sources` ADD `replay_window_seconds` int unsigned DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_sources` ADD `rate_limit_window_seconds` int unsigned DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_sources` ADD `rate_limit_maximum` int unsigned DEFAULT 120 NOT NULL;--> statement-breakpoint
UPDATE `integration_sources` SET `code` = 'google-form-main' WHERE `code` = 'GOOGLE_FORM';--> statement-breakpoint
ALTER TABLE `duplicate_place_hints` ADD CONSTRAINT `fk_duplicate_hint_contribution` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `duplicate_place_hints` ADD CONSTRAINT `fk_duplicate_hint_submission` FOREIGN KEY (`google_form_submission_id`) REFERENCES `google_form_submissions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `duplicate_place_hints` ADD CONSTRAINT `fk_duplicate_hint_candidate` FOREIGN KEY (`candidate_place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_duplicate_hint_submission` ON `duplicate_place_hints` (`google_form_submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_duplicate_hint_candidate` ON `duplicate_place_hints` (`candidate_place_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD CONSTRAINT `chk_google_form_payload_schema_version` CHECK (`google_form_submissions`.`payload_schema_version` > 0);--> statement-breakpoint
ALTER TABLE `integration_sources` ADD CONSTRAINT `chk_integration_source_replay_window` CHECK (`integration_sources`.`replay_window_seconds` > 0);--> statement-breakpoint
ALTER TABLE `integration_sources` ADD CONSTRAINT `chk_integration_source_rate_window` CHECK (`integration_sources`.`rate_limit_window_seconds` > 0);--> statement-breakpoint
ALTER TABLE `integration_sources` ADD CONSTRAINT `chk_integration_source_rate_maximum` CHECK (`integration_sources`.`rate_limit_maximum` > 0);--> statement-breakpoint
CREATE INDEX `idx_google_form_contribution` ON `google_form_submissions` (`contribution_id`);--> statement-breakpoint
ALTER TABLE `geocoding_results` DROP COLUMN `query_text`;--> statement-breakpoint
ALTER TABLE `google_form_submissions` DROP COLUMN `failure_reason`;
