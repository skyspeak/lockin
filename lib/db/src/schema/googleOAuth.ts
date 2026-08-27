import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const googleOAuthTable = pgTable("google_oauth", {
  id: text("id").primaryKey(),
  email: text("email"),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
