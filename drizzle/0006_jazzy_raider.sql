CREATE TABLE `listing_items` (
	`listing_id` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`listing_id`, `item_id`),
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `listing_items_item` ON `listing_items` (`item_id`);--> statement-breakpoint
ALTER TABLE `listings` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `quantity` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
INSERT INTO listing_items(listing_id,item_id) SELECT id,item_id FROM listings;
