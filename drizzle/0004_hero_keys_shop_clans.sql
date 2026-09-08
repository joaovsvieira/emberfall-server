CREATE TABLE `clan_members` (
	`account_id` text PRIMARY KEY NOT NULL,
	`clan_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clan_id`) REFERENCES `clans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clan_roster` ON `clan_members` (`clan_id`);--> statement-breakpoint
CREATE TABLE `clan_requests` (
	`clan_id` text NOT NULL,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`clan_id`, `account_id`, `kind`),
	FOREIGN KEY (`clan_id`) REFERENCES `clans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clans_name_key_unique` ON `clans` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `clans_owner_unique` ON `clans` (`owner`);--> statement-breakpoint
CREATE TABLE `mythic_keys` (
	`account_id` text NOT NULL,
	`hero` text NOT NULL,
	`chapter` integer NOT NULL,
	`week` integer NOT NULL,
	`level` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`run_id` text,
	`resolved` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`account_id`, `hero`, `chapter`, `week`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `key_run` ON `mythic_keys` (`run_id`);--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text,
	`amount_cents` integer NOT NULL,
	`coins` integer NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`granted` integer DEFAULT 0 NOT NULL,
	`live` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_orders_provider_id_unique` ON `payment_orders` (`provider_id`);--> statement-breakpoint
CREATE INDEX `payment_owner` ON `payment_orders` (`account_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `gems` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `clan_id` text;--> statement-breakpoint
ALTER TABLE `hero_progress` ADD `unlocked_chapter` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `mythic_level` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Attribute historical victories to their actual heroes.
INSERT INTO hero_progress(account_id,hero,unlocked_chapter)
SELECT p.account_id,p.hero,MIN(3,MAX(m.chapter)+1) FROM match_players p JOIN matches m ON m.id=p.match_id WHERE m.mode IN ('solo','coop') AND p.outcome='won' GROUP BY p.account_id,p.hero
ON CONFLICT(account_id,hero) DO UPDATE SET unlocked_chapter=MAX(unlocked_chapter,excluded.unlocked_chapter);
--> statement-breakpoint
-- Before match history existed only the preferred hero inherits the legacy unlock.
INSERT INTO hero_progress(account_id,hero,unlocked_chapter)
SELECT a.id,a.preferred_hero,a.unlocked_chapter FROM accounts a WHERE a.unlocked_chapter>1 AND NOT EXISTS(SELECT 1 FROM match_players p JOIN matches m ON m.id=p.match_id WHERE p.account_id=a.id AND p.outcome='won' AND m.mode IN ('solo','coop'))
ON CONFLICT(account_id,hero) DO UPDATE SET unlocked_chapter=MAX(unlocked_chapter,excluded.unlocked_chapter);
