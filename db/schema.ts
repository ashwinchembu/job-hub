import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const jobHubState = sqliteTable("job_hub_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobHubApplicationActions = sqliteTable("job_hub_application_actions", {
  id: text("id").primaryKey(),
  operation: text("operation").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  payload: text("payload").notNull(),
  recordedAt: text("recorded_at").notNull(),
  appliedAt: text("applied_at").notNull(),
});

export const jobHubDiscoveryEvents = sqliteTable("job_hub_discovery_events", {
  id: text("id").primaryKey(),
  operation: text("operation").notNull(),
  source: text("source").notNull(),
  payload: text("payload").notNull(),
  recordedAt: text("recorded_at").notNull(),
  appliedAt: text("applied_at").notNull(),
}, (table) => [
  index("idx_job_hub_discovery_events_source_recorded").on(table.source, table.recordedAt),
]);

export const jobHubDiscoveryLeads = sqliteTable("job_hub_discovery_leads", {
  id: text("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull(),
  source: text("source").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull(),
  sourceUrl: text("source_url").notNull(),
  officialUrl: text("official_url").notNull(),
  payload: text("payload").notNull(),
  discoveredAt: text("discovered_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_job_hub_discovery_leads_dedupe").on(table.dedupeKey),
  index("idx_job_hub_discovery_leads_status_updated").on(table.status, table.updatedAt),
]);
