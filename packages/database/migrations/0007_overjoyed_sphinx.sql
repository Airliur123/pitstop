CREATE TABLE `moderation_events` (
	`id` char(26) NOT NULL,
	`contribution_id` char(26) NOT NULL,
	`actor_admin_id` char(26) NOT NULL,
	`previous_status` enum('DRAFT','PENDING','IN_REVIEW','NEEDS_REVISION','APPROVED','REJECTED','MERGED') NOT NULL,
	`next_status` enum('DRAFT','PENDING','IN_REVIEW','NEEDS_REVISION','APPROVED','REJECTED','MERGED') NOT NULL,
	`action` enum('CLAIM','RECLAIM','NEEDS_REVISION','REJECT','APPROVE','MERGE') NOT NULL,
	`reason` varchar(500),
	`contribution_version` int unsigned NOT NULL,
	`merged_place_id` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `moderation_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_moderation_events_version_positive` CHECK(`moderation_events`.`contribution_version` > 0)
);
--> statement-breakpoint
ALTER TABLE `contribution_payloads` ADD `place_name_normalized` varchar(180) GENERATED ALWAYS AS (LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.placeName'))))) STORED;--> statement-breakpoint
ALTER TABLE `contribution_payloads` ADD `address_normalized` varchar(500) GENERATED ALWAYS AS (LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.address'))))) STORED;--> statement-breakpoint
ALTER TABLE `contribution_payloads` ADD `category_code` varchar(40) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(payload, '$.category'))) STORED;--> statement-breakpoint
ALTER TABLE `contributions` ADD `reviewed_by` char(26);--> statement-breakpoint
ALTER TABLE `contributions` ADD `review_claimed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `contributions` ADD `decision_reason` varchar(500);--> statement-breakpoint
ALTER TABLE `contributions` ADD `approved_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `contributions` ADD `merged_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `contributions` ADD `merged_place_id` char(26);--> statement-breakpoint
ALTER TABLE `contributions` ADD `verified_location` point SRID 4326;--> statement-breakpoint
ALTER TABLE `contributions` ADD `verified_district` varchar(120);--> statement-breakpoint
ALTER TABLE `contributions` ADD `verified_city` varchar(120);--> statement-breakpoint
ALTER TABLE `contributions` ADD `verified_province` varchar(120);--> statement-breakpoint
ALTER TABLE `contributions` ADD `verified_postal_code` varchar(12);--> statement-breakpoint
ALTER TABLE `moderation_events` ADD CONSTRAINT `moderation_events_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `moderation_events` ADD CONSTRAINT `moderation_events_actor_admin_id_users_id_fk` FOREIGN KEY (`actor_admin_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `moderation_events` ADD CONSTRAINT `moderation_events_merged_place_id_places_id_fk` FOREIGN KEY (`merged_place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_moderation_events_contribution_created` ON `moderation_events` (`contribution_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_moderation_events_actor_created` ON `moderation_events` (`actor_admin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_moderation_events_recent` ON `moderation_events` (`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_merged_place_id_places_id_fk` FOREIGN KEY (`merged_place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_contribution_payloads_category` ON `contribution_payloads` (`category_code`,`contribution_id`);--> statement-breakpoint
CREATE INDEX `idx_contribution_payloads_place_name` ON `contribution_payloads` (`place_name_normalized`,`contribution_id`);--> statement-breakpoint
CREATE INDEX `idx_contributions_queue` ON `contributions` (`contribution_status`,`submitted_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_contributions_reviewer_status` ON `contributions` (`reviewed_by`,`contribution_status`);--> statement-breakpoint
CREATE INDEX `idx_contributions_merged_place` ON `contributions` (`merged_place_id`);
