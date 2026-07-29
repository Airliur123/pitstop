DELETE legacy
FROM `geocoding_results` legacy
JOIN `geocoding_results` preferred
  ON preferred.`contribution_id` = legacy.`contribution_id`
  AND (
    CASE preferred.`status`
      WHEN 'SUCCEEDED' THEN 4
      WHEN 'LOW_CONFIDENCE' THEN 3
      WHEN 'NOT_FOUND' THEN 2
      WHEN 'FAILED' THEN 1
      ELSE 0
    END >
    CASE legacy.`status`
      WHEN 'SUCCEEDED' THEN 4
      WHEN 'LOW_CONFIDENCE' THEN 3
      WHEN 'NOT_FOUND' THEN 2
      WHEN 'FAILED' THEN 1
      ELSE 0
    END
    OR (
      preferred.`status` = legacy.`status`
      AND COALESCE(preferred.`confidence`, -1) > COALESCE(legacy.`confidence`, -1)
    )
    OR (
      preferred.`status` = legacy.`status`
      AND COALESCE(preferred.`confidence`, -1) = COALESCE(legacy.`confidence`, -1)
      AND preferred.`updated_at` > legacy.`updated_at`
    )
    OR (
      preferred.`status` = legacy.`status`
      AND COALESCE(preferred.`confidence`, -1) = COALESCE(legacy.`confidence`, -1)
      AND preferred.`updated_at` = legacy.`updated_at`
      AND preferred.`id` < legacy.`id`
    )
  )
WHERE legacy.`contribution_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `geocoding_results` ADD CONSTRAINT `uq_geocoding_contribution` UNIQUE(`contribution_id`);
