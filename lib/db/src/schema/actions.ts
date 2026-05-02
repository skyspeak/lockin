import { pgTable, serial, text, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoryEnum } from "./thoughts";

export const actionStatusEnum = pgEnum("action_status", [
  "pending",
  "in-progress",
  "done",
  "dismissed",
]);

export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);

export const actionsTable = pgTable("actions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: categoryEnum("category").notNull().default("other"),
  status: actionStatusEnum("status").notNull().default("pending"),
  priority: priorityEnum("priority").notNull().default("medium"),
  thoughtId: integer("thought_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertActionSchema = createInsertSchema(actionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actionsTable.$inferSelect;
