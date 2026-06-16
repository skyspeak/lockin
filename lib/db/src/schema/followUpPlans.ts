import { pgTable, serial, text, timestamp, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { actionsTable } from "./actions";

export const followUpPlanStatusEnum = pgEnum("follow_up_plan_status", [
  "generating",
  "ready",
  "failed",
]);

export type FollowUpTodo = {
  id: string;
  text: string;
  done: boolean;
};

export const followUpPlansTable = pgTable("follow_up_plans", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id")
    .notNull()
    .references(() => actionsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().default(""),
  status: followUpPlanStatusEnum("status").notNull().default("generating"),
  summary: text("summary"),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  userTodos: jsonb("user_todos").$type<FollowUpTodo[]>().notNull().default([]),
  checkInHint: text("check_in_hint"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFollowUpPlanSchema = createInsertSchema(followUpPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFollowUpPlan = z.infer<typeof insertFollowUpPlanSchema>;
export type FollowUpPlan = typeof followUpPlansTable.$inferSelect;
