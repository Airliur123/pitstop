ALTER TABLE `place_reports` MODIFY COLUMN `report_type` enum('PRICE_CHANGED','HOURS_CHANGED','LOCATION_INCORRECT','CATEGORY_INCORRECT','FACILITY_CHANGED','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED','DUPLICATE_PLACE','OTHER') NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `actor_type` enum('USER','ADMIN','SYSTEM','INTEGRATION') DEFAULT 'SYSTEM' NOT NULL;--> statement-breakpoint
UPDATE `audit_logs`
SET `actor_type` = CASE
  WHEN `actor_role` = 'ADMIN' THEN 'ADMIN'
  WHEN `actor_role` = 'USER' THEN 'USER'
  WHEN `actor_role` = 'INTEGRATION' THEN 'INTEGRATION'
  ELSE 'SYSTEM'
END;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `previous_status` varchar(80);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `next_status` varchar(80);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD `previous_version` int unsigned;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD `next_version` int unsigned;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD `changed_fields` json;--> statement-breakpoint
UPDATE `place_change_history` history
LEFT JOIN `places` place ON place.`id` = history.`place_id`
SET history.`next_version` = COALESCE(place.`version`, 1),
    history.`previous_version` = CASE
      WHEN history.`change_type` LIKE '%CREATED%' OR COALESCE(place.`version`, 1) <= 1 THEN NULL
      ELSE place.`version` - 1
    END,
    history.`changed_fields` = COALESCE(JSON_KEYS(history.`new_value`), JSON_ARRAY());--> statement-breakpoint
ALTER TABLE `place_change_history` MODIFY COLUMN `next_version` int unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `place_change_history` MODIFY COLUMN `changed_fields` json NOT NULL;--> statement-breakpoint
ALTER TABLE `places` ADD `community_confirmed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `places` ADD `community_confirmation_count` int unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD `observed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD `expires_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD `note` varchar(300);--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD `place_version` int unsigned;--> statement-breakpoint
UPDATE `place_confirmations` confirmation
JOIN `places` place ON place.`id` = confirmation.`place_id`
SET confirmation.`observed_at` = confirmation.`created_at`,
    confirmation.`expires_at` = DATE_ADD(confirmation.`created_at`, INTERVAL 90 DAY),
    confirmation.`place_version` = place.`version`;--> statement-breakpoint
ALTER TABLE `place_confirmations` MODIFY COLUMN `observed_at` timestamp(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `place_confirmations` MODIFY COLUMN `expires_at` timestamp(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `place_confirmations` MODIFY COLUMN `place_version` int unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `place_reports` ADD `evidence_url` varchar(1000);--> statement-breakpoint
ALTER TABLE `place_reports` ADD `evidence_reference` varchar(500);--> statement-breakpoint
ALTER TABLE `place_reports` ADD `submitted_place_version` int unsigned;--> statement-breakpoint
ALTER TABLE `place_reports` ADD `review_claimed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `place_reports` ADD `resolution` varchar(500);--> statement-breakpoint
ALTER TABLE `place_reports` ADD `applied_change_summary` json;--> statement-breakpoint
UPDATE `place_reports` report
JOIN `places` place ON place.`id` = report.`place_id`
SET report.`submitted_place_version` = place.`version`;--> statement-breakpoint
ALTER TABLE `place_reports` MODIFY COLUMN `submitted_place_version` int unsigned NOT NULL;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD CONSTRAINT `chk_place_history_version_transition` CHECK (`place_change_history`.`previous_version` IS NULL OR `place_change_history`.`next_version` > `place_change_history`.`previous_version`);--> statement-breakpoint
ALTER TABLE `places` ADD CONSTRAINT `chk_places_community_confirmation_count` CHECK (`places`.`community_confirmation_count` >= 0);--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD CONSTRAINT `chk_place_confirmations_place_version` CHECK (`place_confirmations`.`place_version` > 0);--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD CONSTRAINT `chk_place_confirmations_expiry` CHECK (`place_confirmations`.`expires_at` > `place_confirmations`.`observed_at`);--> statement-breakpoint
ALTER TABLE `place_reports` ADD CONSTRAINT `chk_place_reports_submitted_place_version` CHECK (`place_reports`.`submitted_place_version` > 0);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_place_confirmations_place_expiry` ON `place_confirmations` (`place_id`,`expires_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_place_confirmations_user_created` ON `place_confirmations` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_queue` ON `place_reports` (`report_status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_type_status` ON `place_reports` (`report_type`,`report_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_place_status` ON `place_reports` (`place_id`,`report_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_reporter_created` ON `place_reports` (`reported_by`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_reviewer_status` ON `place_reports` (`reviewed_by`,`report_status`);--> statement-breakpoint
CREATE TRIGGER `audit_logs_prevent_update`
BEFORE UPDATE ON `audit_logs`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';--> statement-breakpoint
CREATE TRIGGER `audit_logs_prevent_delete`
BEFORE DELETE ON `audit_logs`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';--> statement-breakpoint
CREATE TRIGGER `place_change_history_prevent_update`
BEFORE UPDATE ON `place_change_history`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'place_change_history is append-only';--> statement-breakpoint
CREATE TRIGGER `place_change_history_prevent_delete`
BEFORE DELETE ON `place_change_history`
FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'place_change_history is append-only';
