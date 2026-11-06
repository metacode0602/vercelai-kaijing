CREATE TABLE IF NOT EXISTS "tenant_onboarding_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"applicant_user_id" text NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"company_name" text NOT NULL,
	"registration_no" varchar(64),
	"country_code" varchar(8) NOT NULL,
	"handler_type" varchar(16) DEFAULT 'legal_rep' NOT NULL,
	"legal_representative" text,
	"legal_rep_id_no" varchar(64),
	"legal_rep_id_front_key" text,
	"legal_rep_id_back_key" text,
	"authorization_file_key" text,
	"agent_name" text,
	"agent_id_no" varchar(64),
	"agent_id_front_key" text,
	"agent_id_back_key" text,
	"contact_name" text NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"contact_email" text,
	"license_file_key" text,
	"license_file_name" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tenant_onboarding_applications" ADD CONSTRAINT "tenant_onboarding_applications_organization_id_organization_id_" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_onboarding_applications_org_uidx" ON "tenant_onboarding_applications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_onboarding_applications_status_idx" ON "tenant_onboarding_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_onboarding_applications_subject_uidx" ON "tenant_onboarding_applications" USING btree ("country_code","registration_no") WHERE "tenant_onboarding_applications"."status" in ('submitted', 'approved');