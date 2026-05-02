import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoryEnum = pgEnum("category", [
  "work",
  "side-projects",
  "family",
  "finance",
  "personal",
  "health",
  "other",
]);

export const thoughtsTable = pgTable("thoughts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  category: categoryEnum("category").notNull().default("other"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertThought = z.infer<typeof insertThoughtSchema>;
export type Thought = typeof thoughtsTable.$inferSelect;
