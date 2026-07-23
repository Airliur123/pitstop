ALTER TABLE `place_categories` DROP FOREIGN KEY `place_categories_place_id_places_id_fk`;
--> statement-breakpoint
ALTER TABLE `place_photos` DROP FOREIGN KEY `place_photos_place_id_places_id_fk`;
--> statement-breakpoint
ALTER TABLE `place_categories` ADD CONSTRAINT `place_categories_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE `place_photos` ADD CONSTRAINT `place_photos_place_id_places_id_fk` FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON DELETE restrict ON UPDATE restrict;