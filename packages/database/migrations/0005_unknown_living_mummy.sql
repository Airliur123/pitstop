CREATE TABLE `auth_login_tokens` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`return_to` varchar(255) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`consumed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `auth_login_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_login_tokens_token_hash` UNIQUE(`token_hash`),
	CONSTRAINT `chk_auth_login_tokens_expiry` CHECK(`auth_login_tokens`.`expires_at` > `auth_login_tokens`.`created_at`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` char(26) NOT NULL,
	`user_id` char(26) NOT NULL,
	`session_token_hash` char(64) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_seen_at` timestamp(3),
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_sessions_token_hash` UNIQUE(`session_token_hash`),
	CONSTRAINT `chk_auth_sessions_expiry` CHECK(`auth_sessions`.`expires_at` > `auth_sessions`.`created_at`)
);
--> statement-breakpoint
ALTER TABLE `auth_login_tokens` ADD CONSTRAINT `auth_login_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_auth_login_tokens_user_consumed` ON `auth_login_tokens` (`user_id`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_login_tokens_expires` ON `auth_login_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user_revoked` ON `auth_sessions` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_expires` ON `auth_sessions` (`expires_at`);