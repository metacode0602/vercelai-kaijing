-- Module 13: sync_tasks / sync_job_runs (publish & sync task queue; not live platform API)

CREATE TABLE IF NOT EXISTS "sync_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text,
	"task_no" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"error" text,
	"retries" integer DEFAULT 0 NOT NULL,
	"request_id" text,
	"last_run_at" timestamp with time zone,
	"enqueued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"note" text,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sync_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"sync_task_id" text NOT NULL,
	"run_no" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"request_id" text,
	"http_status" integer,
	"latency_ms" integer,
	"message" text,
	"detail" text,
	"actor" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "sync_tasks" ADD CONSTRAINT "sync_tasks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_tasks" ADD CONSTRAINT "sync_tasks_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_job_runs" ADD CONSTRAINT "sync_job_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_job_runs" ADD CONSTRAINT "sync_job_runs_sync_task_id_sync_tasks_id_fk" FOREIGN KEY ("sync_task_id") REFERENCES "public"."sync_tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "sync_tasks_org_no_uidx" ON "sync_tasks" USING btree ("organization_id","task_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_tasks_org_status_idx" ON "sync_tasks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_tasks_org_type_idx" ON "sync_tasks" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_tasks_shop_idx" ON "sync_tasks" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_tasks_request_idx" ON "sync_tasks" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_job_runs_task_idx" ON "sync_job_runs" USING btree ("sync_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_job_runs_org_idx" ON "sync_job_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_job_runs_request_idx" ON "sync_job_runs" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sync_job_runs_task_run_uidx" ON "sync_job_runs" USING btree ("sync_task_id","run_no");
