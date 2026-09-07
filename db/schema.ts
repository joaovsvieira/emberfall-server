import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('accounts',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),displayName:text('display_name').notNull(),
 passwordHash:text('password_hash').notNull(),unlockedChapter:integer('unlocked_chapter').notNull().default(1),
 preferredHero:text('preferred_hero').notNull().default('kael'),createdAt:integer('created_at').notNull()
});
export const sessions=sqliteTable('sessions',{
 hash:text('hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),expiresAt:integer('expires_at').notNull()
});
export const completions=sqliteTable('completions',{
 id:text('id').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id),chapter:integer('chapter').notNull(),createdAt:integer('created_at').notNull()
});
