CREATE TABLE `job_hub_discovery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`source` text NOT NULL,
	`payload` text NOT NULL,
	`recorded_at` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_job_hub_discovery_events_source_recorded` ON `job_hub_discovery_events` (`source`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `job_hub_discovery_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`source` text NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`location` text NOT NULL,
	`status` text NOT NULL,
	`source_url` text NOT NULL,
	`official_url` text NOT NULL,
	`payload` text NOT NULL,
	`discovered_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_job_hub_discovery_leads_dedupe` ON `job_hub_discovery_leads` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_job_hub_discovery_leads_status_updated` ON `job_hub_discovery_leads` (`status`,`updated_at`);