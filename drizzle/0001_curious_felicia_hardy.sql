CREATE TABLE `job_hub_application_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`payload` text NOT NULL,
	`recorded_at` text NOT NULL,
	`applied_at` text NOT NULL
);
