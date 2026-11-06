-- Marketplace read-sync: settlements cursor/state on integration_states
ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "settlements_cursor" text;
ALTER TABLE "integration_states" ADD COLUMN IF NOT EXISTS "last_settlements_sync_at" timestamp with time zone;
