CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender` text NOT NULL,
	`recipient` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_global` ON `chat_messages` (`recipient`,`id`);--> statement-breakpoint
CREATE INDEX `chat_private` ON `chat_messages` (`sender`,`recipient`,`id`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`a` text NOT NULL,
	`b` text NOT NULL,
	`requester` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`a`, `b`),
	FOREIGN KEY (`a`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`b`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `friends_b` ON `friendships` (`b`,`status`);--> statement-breakpoint
CREATE TABLE `hero_progress` (
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `hero`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`catalog_id` text NOT NULL,
	`slot` text NOT NULL,
	`equipped` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_owner` ON `items` (`account_id`,`hero`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipped_slot` ON `items` (`account_id`,`hero`,`slot`) WHERE "items"."equipped"=1;--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`seller` text NOT NULL,
	`price` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_listing` ON `listings` (`item_id`) WHERE "listings"."status"='active';--> statement-breakpoint
CREATE INDEX `listings_active` ON `listings` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `match_players` (
	`match_id` text NOT NULL,
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`name` text NOT NULL,
	`kills` integer DEFAULT 0 NOT NULL,
	`outcome` text NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`item_id` text,
	PRIMARY KEY(`match_id`, `account_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `player_history` ON `match_players` (`account_id`,`match_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`chapter` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`outcome` text NOT NULL,
	`week` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `match_rank` ON `matches` (`week`,`mode`,`chapter`,`outcome`,`duration_ms`);--> statement-breakpoint
CREATE TABLE `presence` (
	`account_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`account_id`, `session_hash`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_hash`) REFERENCES `sessions`(`hash`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `presence_seen` ON `presence` (`last_seen`);--> statement-breakpoint
CREATE TABLE `reward_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`buyer` text NOT NULL,
	`hero` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`buyer`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_listing_id_unique` ON `sales` (`listing_id`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `gold` integer DEFAULT 0 NOT NULL;
