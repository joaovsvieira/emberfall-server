ALTER TABLE `reward_events` ADD `round_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reward_events` ADD `applied` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `item_id` text REFERENCES items(id);--> statement-breakpoint
ALTER TABLE `sales` ADD `seller` text REFERENCES accounts(id);--> statement-breakpoint
ALTER TABLE `sales` ADD `price` integer;--> statement-breakpoint
ALTER TABLE `sales` ADD `applied` integer DEFAULT 0 NOT NULL;