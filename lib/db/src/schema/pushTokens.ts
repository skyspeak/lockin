import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const pushTokensTable = pgTable("push_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform").notNull().default("ios"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pushRemindersTable = pgTable(
  "push_reminders",
  {
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    sentOn: text("sent_on").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind, table.sentOn] })],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
