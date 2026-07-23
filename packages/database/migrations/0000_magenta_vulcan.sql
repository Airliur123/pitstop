SET time_zone = '+00:00';
--> statement-breakpoint
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
--> statement-breakpoint
SET @@SESSION.default_storage_engine = 'InnoDB';
--> statement-breakpoint
CREATE TABLE `contribution_payloads` (
	`contribution_id` char(26) NOT NULL,
	`schema_version` int unsigned NOT NULL,
	`payload` json NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pk_contribution_payloads` PRIMARY KEY(`contribution_id`),
	CONSTRAINT `chk_contribution_payloads_schema_version` CHECK(`contribution_payloads`.`schema_version` > 0)
);
--> statement-breakpoint
CREATE TABLE `contribution_photos` (
	`id` char(26) NOT NULL,
	`contribution_id` char(26) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `contribution_photos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_contribution_photos_object_key` UNIQUE(`object_key`),
	CONSTRAINT `chk_contribution_photos_file_size` CHECK(`contribution_photos`.`file_size` >= 0)
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` char(26) NOT NULL,
	`submitted_by` char(26),
	`source` enum('APPLICATION','GOOGLE_FORM','ADMIN','CSV_IMPORT') NOT NULL,
	`contribution_status` enum('DRAFT','PENDING','IN_REVIEW','NEEDS_REVISION','APPROVED','REJECTED','MERGED') NOT NULL DEFAULT 'DRAFT',
	`target_place_id` char(26),
	`revision_of_id` char(26),
	`submitted_at` timestamp(3),
	`reviewed_at` timestamp(3),
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `contributions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_contributions_version_positive` CHECK(`contributions`.`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `moderation_reviews` (
	`id` char(26) NOT NULL,
	`contribution_id` char(26) NOT NULL,
	`reviewer_id` char(26) NOT NULL,
	`decision` enum('APPROVE','REJECT','REQUEST_REVISION','MERGE') NOT NULL,
	`reason` varchar(500) NOT NULL,
	`admin_note` text,
	`duplicate_place_id` char(26),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `moderation_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` char(26) NOT NULL,
	`actor_user_id` char(26),
	`actor_role` varchar(40) NOT NULL,
	`action` varchar(120) NOT NULL,
	`target_type` varchar(100) NOT NULL,
	`target_id` char(26) NOT NULL,
	`request_id` varchar(128) NOT NULL,
	`previous_value` json,
	`new_value` json,
	`reason` text,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place_change_history` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`changed_by` char(26),
	`source_type` varchar(80) NOT NULL,
	`source_id` char(26),
	`change_type` varchar(100) NOT NULL,
	`previous_value` json,
	`new_value` json,
	`reason` text,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `place_change_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`provider` enum('PASSWORD','GOOGLE') NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_accounts_provider_account` UNIQUE(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`token_family_id` char(26) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	`replaced_by_token_id` char(26),
	`user_agent` varchar(512),
	`ip_hash` char(64),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_refresh_tokens_token_hash` UNIQUE(`token_hash`),
	CONSTRAINT `chk_refresh_tokens_expiry` CHECK(`refresh_tokens`.`expires_at` > `refresh_tokens`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` char(26) NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_roles_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` char(26) NOT NULL,
	`role_id` char(26) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`assigned_by` char(26),
	CONSTRAINT `pk_user_roles` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(26) NOT NULL,
	`email` varchar(320) NOT NULL,
	`normalized_email` varchar(320) NOT NULL,
	`active_normalized_email` varchar(320) GENERATED ALWAYS AS ((CASE WHEN deleted_at IS NULL THEN normalized_email ELSE NULL END)) STORED,
	`display_name` varchar(160) NOT NULL,
	`password_hash` varchar(255),
	`status` enum('ACTIVE','SUSPENDED','DISABLED') NOT NULL DEFAULT 'ACTIVE',
	`email_verified_at` timestamp(3),
	`last_login_at` timestamp(3),
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`deleted_at` timestamp(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_active_normalized_email` UNIQUE(`active_normalized_email`),
	CONSTRAINT `chk_users_normalized_email` CHECK(`users`.`normalized_email` = LOWER(TRIM(`users`.`email`))),
	CONSTRAINT `chk_users_version_positive` CHECK(`users`.`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `geocoding_results` (
	`id` char(26) NOT NULL,
	`contribution_id` char(26),
	`place_id` char(26),
	`provider` varchar(80) NOT NULL,
	`query_text` varchar(1000) NOT NULL,
	`result_location` point SRID 4326,
	`formatted_address` varchar(500),
	`confidence` decimal(5,4),
	`raw_response` json NOT NULL,
	`is_admin_verified` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `geocoding_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_geocoding_subject` CHECK((`geocoding_results`.`contribution_id` IS NOT NULL) <> (`geocoding_results`.`place_id` IS NOT NULL)),
	CONSTRAINT `chk_geocoding_confidence` CHECK(`geocoding_results`.`confidence` IS NULL OR (`geocoding_results`.`confidence` >= 0 AND `geocoding_results`.`confidence` <= 1))
);
--> statement-breakpoint
CREATE TABLE `google_form_submissions` (
	`id` char(26) NOT NULL,
	`integration_source_id` char(26) NOT NULL,
	`external_submission_id` varchar(255) NOT NULL,
	`payload` json NOT NULL,
	`signature_version` int unsigned NOT NULL,
	`received_at` timestamp(3) NOT NULL,
	`processed_at` timestamp(3),
	`processing_status` enum('RECEIVED','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'RECEIVED',
	`contribution_id` char(26),
	`failure_reason` text,
	CONSTRAINT `google_form_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_google_form_source_external` UNIQUE(`integration_source_id`,`external_submission_id`),
	CONSTRAINT `chk_google_form_signature_version` CHECK(`google_form_submissions`.`signature_version` > 0)
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` char(26) NOT NULL,
	`scope` varchar(120) NOT NULL,
	`idempotency_key` varchar(255) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`response_status` int unsigned,
	`response_body` json,
	`locked_until` timestamp(3),
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_idempotency_scope_key` UNIQUE(`scope`,`idempotency_key`),
	CONSTRAINT `chk_idempotency_response_status` CHECK(`idempotency_keys`.`response_status` IS NULL OR `idempotency_keys`.`response_status` BETWEEN 100 AND 599),
	CONSTRAINT `chk_idempotency_expiry` CHECK(`idempotency_keys`.`expires_at` > `idempotency_keys`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `integration_sources` (
	`id` char(26) NOT NULL,
	`code` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `integration_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_integration_sources_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` char(26) NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`is_primary` boolean NOT NULL DEFAULT false,
	`sort_order` int unsigned NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_categories_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `facilities` (
	`id` char(26) NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `facilities_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_facilities_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `menus` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` text,
	`price_amount` int NOT NULL,
	`is_main_item` boolean NOT NULL DEFAULT false,
	`is_available` boolean NOT NULL DEFAULT true,
	`sort_order` int unsigned NOT NULL DEFAULT 0,
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`deleted_at` timestamp(3),
	CONSTRAINT `menus_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_menus_price_nonnegative` CHECK(`menus`.`price_amount` >= 0),
	CONSTRAINT `chk_menus_version_positive` CHECK(`menus`.`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `operating_hour_exceptions` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`exception_date` date NOT NULL,
	`sequence` int unsigned NOT NULL DEFAULT 0,
	`is_closed` boolean NOT NULL DEFAULT false,
	`opens_at` time,
	`closes_at` time,
	`note` varchar(500),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `operating_hour_exceptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_operating_exceptions_place_date_sequence` UNIQUE(`place_id`,`exception_date`,`sequence`),
	CONSTRAINT `chk_operating_exceptions_sequence` CHECK(`operating_hour_exceptions`.`sequence` >= 0),
	CONSTRAINT `chk_operating_exceptions_mode` CHECK((`operating_hour_exceptions`.`is_closed` = 1 AND `operating_hour_exceptions`.`opens_at` IS NULL AND `operating_hour_exceptions`.`closes_at` IS NULL) OR (`operating_hour_exceptions`.`is_closed` = 0 AND `operating_hour_exceptions`.`opens_at` IS NOT NULL AND `operating_hour_exceptions`.`closes_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `operating_hours` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`day_of_week` int unsigned NOT NULL,
	`sequence` int unsigned NOT NULL DEFAULT 0,
	`opens_at` time,
	`closes_at` time,
	`is_24_hours` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `operating_hours_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_operating_hours_place_day_sequence` UNIQUE(`place_id`,`day_of_week`,`sequence`),
	CONSTRAINT `chk_operating_hours_day` CHECK(`operating_hours`.`day_of_week` BETWEEN 0 AND 6),
	CONSTRAINT `chk_operating_hours_sequence` CHECK(`operating_hours`.`sequence` >= 0),
	CONSTRAINT `chk_operating_hours_mode` CHECK((`operating_hours`.`is_24_hours` = 1 AND `operating_hours`.`opens_at` IS NULL AND `operating_hours`.`closes_at` IS NULL) OR (`operating_hours`.`is_24_hours` = 0 AND `operating_hours`.`opens_at` IS NOT NULL AND `operating_hours`.`closes_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `place_categories` (
	`place_id` char(26) NOT NULL,
	`category_id` char(26) NOT NULL,
	`is_primary` boolean NOT NULL DEFAULT false,
	`primary_place_id` char(26) GENERATED ALWAYS AS ((CASE WHEN is_primary = 1 THEN place_id ELSE NULL END)) STORED,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `pk_place_categories` PRIMARY KEY(`place_id`,`category_id`),
	CONSTRAINT `uq_place_categories_one_primary` UNIQUE(`primary_place_id`)
);
--> statement-breakpoint
CREATE TABLE `place_facilities` (
	`place_id` char(26) NOT NULL,
	`facility_id` char(26) NOT NULL,
	`facility_status` enum('AVAILABLE','NOT_AVAILABLE','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
	`confirmed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `pk_place_facilities` PRIMARY KEY(`place_id`,`facility_id`)
);
--> statement-breakpoint
CREATE TABLE `place_photos` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` int NOT NULL,
	`width` int,
	`height` int,
	`sort_order` int unsigned NOT NULL DEFAULT 0,
	`is_primary` boolean NOT NULL DEFAULT false,
	`primary_place_id` char(26) GENERATED ALWAYS AS ((CASE WHEN is_primary = 1 AND deleted_at IS NULL THEN place_id ELSE NULL END)) STORED,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`deleted_at` timestamp(3),
	CONSTRAINT `place_photos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_place_photos_object_key` UNIQUE(`object_key`),
	CONSTRAINT `uq_place_photos_one_primary` UNIQUE(`primary_place_id`),
	CONSTRAINT `chk_place_photos_file_size` CHECK(`place_photos`.`file_size` >= 0),
	CONSTRAINT `chk_place_photos_width` CHECK(`place_photos`.`width` IS NULL OR `place_photos`.`width` > 0),
	CONSTRAINT `chk_place_photos_height` CHECK(`place_photos`.`height` IS NULL OR `place_photos`.`height` > 0)
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` char(26) NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`description` text,
	`address` varchar(500) NOT NULL,
	`landmark` varchar(255),
	`district` varchar(120) NOT NULL,
	`city` varchar(120) NOT NULL,
	`province` varchar(120) NOT NULL,
	`postal_code` varchar(12),
	`location` point NOT NULL SRID 4326,
	`place_status` enum('DRAFT','PENDING','ACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`verification_status` enum('UNVERIFIED','ADMIN_VERIFIED','COMMUNITY_CONFIRMED','STALE') NOT NULL DEFAULT 'UNVERIFIED',
	`verified_at` timestamp(3),
	`verified_by` char(26),
	`data_freshness_at` timestamp(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`deleted_at` timestamp(3),
	CONSTRAINT `places_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_places_slug` UNIQUE(`slug`),
	CONSTRAINT `chk_places_version_positive` CHECK(`places`.`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `place_confirmations` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`confirmation_type` enum('STILL_VALID','PRICE_ACCURATE','FACILITIES_ACCURATE') NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `place_confirmations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_place_confirmations_user_place` UNIQUE(`user_id`,`place_id`)
);
--> statement-breakpoint
CREATE TABLE `place_reports` (
	`id` char(26) NOT NULL,
	`place_id` char(26) NOT NULL,
	`reported_by` char(26) NOT NULL,
	`report_type` enum('PRICE_CHANGED','HOURS_CHANGED','LOCATION_INCORRECT','FACILITY_CHANGED','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED','OTHER') NOT NULL,
	`description` varchar(1000) NOT NULL,
	`proposed_value` json,
	`report_status` enum('PENDING','IN_REVIEW','APPLIED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`reviewed_by` char(26),
	`reviewed_at` timestamp(3),
	`version` int unsigned NOT NULL DEFAULT 1,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	CONSTRAINT `place_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `chk_place_reports_version_positive` CHECK(`place_reports`.`version` > 0)
);
--> statement-breakpoint
CREATE TABLE `report_evidence` (
	`id` char(26) NOT NULL,
	`report_id` char(26) NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `report_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_report_evidence_object_key` UNIQUE(`object_key`),
	CONSTRAINT `chk_report_evidence_file_size` CHECK(`report_evidence`.`file_size` >= 0)
);
--> statement-breakpoint
ALTER TABLE `contribution_payloads` ADD CONSTRAINT `contribution_payloads_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `contribution_photos` ADD CONSTRAINT `contribution_photos_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_target_place_id_places_id_fk` FOREIGN KEY (`target_place_id`) REFERENCES `places`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `fk_contributions_revision_of` FOREIGN KEY (`revision_of_id`) REFERENCES `contributions`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `moderation_reviews` ADD CONSTRAINT `moderation_reviews_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `moderation_reviews` ADD CONSTRAINT `moderation_reviews_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `moderation_reviews` ADD CONSTRAINT `moderation_reviews_duplicate_place_id_places_id_fk` FOREIGN KEY (`duplicate_place_id`) REFERENCES `places`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD CONSTRAINT `place_change_history_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_change_history` ADD CONSTRAINT `place_change_history_changed_by_users_id_fk` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `auth_accounts` ADD CONSTRAINT `auth_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `fk_refresh_tokens_replaced_by` FOREIGN KEY (`replaced_by_token_id`) REFERENCES `refresh_tokens`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_assigned_by_users_id_fk` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD CONSTRAINT `geocoding_results_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD CONSTRAINT `geocoding_results_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD CONSTRAINT `fk_google_form_integration_source` FOREIGN KEY (`integration_source_id`) REFERENCES `integration_sources`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ADD CONSTRAINT `google_form_submissions_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `menus` ADD CONSTRAINT `menus_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `operating_hour_exceptions` ADD CONSTRAINT `operating_hour_exceptions_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `operating_hours` ADD CONSTRAINT `operating_hours_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_facilities` ADD CONSTRAINT `place_facilities_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_facilities` ADD CONSTRAINT `place_facilities_facility_id_facilities_id_fk` FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_photos` ADD CONSTRAINT `place_photos_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `places` ADD CONSTRAINT `places_verified_by_users_id_fk` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD CONSTRAINT `place_confirmations_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_confirmations` ADD CONSTRAINT `place_confirmations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_reports` ADD CONSTRAINT `place_reports_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_reports` ADD CONSTRAINT `place_reports_reported_by_users_id_fk` FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `place_reports` ADD CONSTRAINT `place_reports_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `report_evidence` ADD CONSTRAINT `report_evidence_report_id_place_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `place_reports`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_contribution_photos_contribution` ON `contribution_photos` (`contribution_id`);--> statement-breakpoint
CREATE INDEX `idx_contributions_status_created` ON `contributions` (`contribution_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contributions_submitter` ON `contributions` (`submitted_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contributions_target` ON `contributions` (`target_place_id`);--> statement-breakpoint
CREATE INDEX `idx_moderation_reviews_contribution_created` ON `moderation_reviews` (`contribution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_moderation_reviews_reviewer` ON `moderation_reviews` (`reviewer_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_target_created` ON `audit_logs` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor_created` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_request` ON `audit_logs` (`request_id`);--> statement-breakpoint
CREATE INDEX `idx_place_history_place_created` ON `place_change_history` (`place_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_place_history_source` ON `place_change_history` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_auth_accounts_user` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user_family_revoked` ON `refresh_tokens` (`user_id`,`token_family_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_expires` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_users_status_deleted` ON `users` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_geocoding_contribution` ON `geocoding_results` (`contribution_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_geocoding_place` ON `geocoding_results` (`place_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_google_form_status_received` ON `google_form_submissions` (`processing_status`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_idempotency_expires` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_categories_sort_order` ON `categories` (`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_menus_place_main_available_price` ON `menus` (`place_id`,`is_main_item`,`is_available`,`price_amount`);--> statement-breakpoint
CREATE INDEX `idx_operating_hours_place_day` ON `operating_hours` (`place_id`,`day_of_week`);--> statement-breakpoint
CREATE INDEX `idx_place_categories_category` ON `place_categories` (`category_id`,`place_id`);--> statement-breakpoint
CREATE INDEX `idx_place_facilities_status` ON `place_facilities` (`facility_id`,`facility_status`);--> statement-breakpoint
CREATE INDEX `idx_place_photos_place_sort` ON `place_photos` (`place_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_places_status_verification` ON `places` (`place_status`,`verification_status`);--> statement-breakpoint
CREATE INDEX `idx_places_deleted_at` ON `places` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_places_data_freshness` ON `places` (`data_freshness_at`);--> statement-breakpoint
CREATE INDEX `idx_places_district_city` ON `places` (`district`,`city`);--> statement-breakpoint
CREATE INDEX `idx_place_confirmations_place_type` ON `place_confirmations` (`place_id`,`confirmation_type`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_status_created` ON `place_reports` (`report_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_place_reports_place` ON `place_reports` (`place_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_report_evidence_report` ON `report_evidence` (`report_id`);--> statement-breakpoint
CREATE SPATIAL INDEX `idx_places_location` ON `places` (`location`);--> statement-breakpoint
ALTER TABLE `contribution_payloads` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `contribution_photos` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `contributions` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `moderation_reviews` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `audit_logs` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_change_history` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `auth_accounts` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `roles` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `user_roles` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `users` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `geocoding_results` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `google_form_submissions` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `idempotency_keys` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `integration_sources` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `categories` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `facilities` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `menus` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `operating_hour_exceptions` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `operating_hours` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_categories` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_facilities` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_photos` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `places` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_confirmations` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `place_reports` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;--> statement-breakpoint
ALTER TABLE `report_evidence` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
