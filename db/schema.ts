import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobHubState = sqliteTable("job_hub_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
