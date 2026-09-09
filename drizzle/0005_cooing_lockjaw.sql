CREATE TABLE `achievements` (
	`account_id` text NOT NULL,
	`hero` text DEFAULT 'account' NOT NULL,
	`achievement` text NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `hero`, `achievement`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clan_bank_tabs` (
	`clan_id` text NOT NULL,
	`tab` integer NOT NULL,
	`name` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`clan_id`, `tab`),
	FOREIGN KEY (`clan_id`) REFERENCES `clans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hero_hotbar` (
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`slot` integer NOT NULL,
	`catalog_id` text NOT NULL,
	PRIMARY KEY(`account_id`, `hero`, `slot`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mail` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`claimed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mail_owner` ON `mail` (`account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `economy_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `potion_cooldowns` (
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`until` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `hero`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `professions` (
	`account_id` text NOT NULL,
	`profession` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `profession`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`account_id` text NOT NULL,
	`recipe` text NOT NULL,
	PRIMARY KEY(`account_id`, `recipe`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skins` (
	`account_id` text NOT NULL,
	`skin` text NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `skin`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weekly_claims` (
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`week` integer NOT NULL,
	`level` integer NOT NULL,
	`item_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `hero`, `week`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `hero_progress` ADD `skin` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `hero_progress` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `quality` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `location` text DEFAULT 'inventory' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `bank_clan` text;--> statement-breakpoint
ALTER TABLE `items` ADD `bank_tab` integer;--> statement-breakpoint
ALTER TABLE `reward_events` ADD `kind` text DEFAULT '' NOT NULL;