-- Module 16: carton specs master (independent of ocean_shipment_boxes)
CREATE TABLE IF NOT EXISTS "commerce_carton_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"applicable_pack" text DEFAULT '单件' NOT NULL,
	"length_cm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"width_cm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"height_cm" numeric(12, 2) DEFAULT '0' NOT NULL,
	"gross_weight_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"units_per_carton" integer DEFAULT 1 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "commerce_carton_specs" ADD CONSTRAINT "commerce_carton_specs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commerce_carton_specs_org_code_uidx" ON "commerce_carton_specs" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_carton_specs_org_status_idx" ON "commerce_carton_specs" USING btree ("organization_id","status");
