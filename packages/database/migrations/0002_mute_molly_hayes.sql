ALTER TABLE `geocoding_results` DROP FOREIGN KEY `geocoding_results_contribution_id_contributions_id_fk`;
--> statement-breakpoint
ALTER TABLE `geocoding_results` DROP FOREIGN KEY `geocoding_results_place_id_places_id_fk`;
--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD CONSTRAINT `geocoding_results_contribution_id_contributions_id_fk` FOREIGN KEY (`contribution_id`) REFERENCES `contributions`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD CONSTRAINT `geocoding_results_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;