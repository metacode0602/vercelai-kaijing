CREATE TABLE "marketplace_app_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"region" varchar(16) DEFAULT '' NOT NULL,
	"app_key" varchar(128) NOT NULL,
	"app_secret_encrypted" text NOT NULL,
	"callback_key" varchar(64),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_app_credentials" ADD CONSTRAINT "marketplace_app_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_app_credentials_org_platform_region_uidx" ON "marketplace_app_credentials" USING btree ("organization_id","platform","region");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_app_credentials_callback_key_uidx" ON "marketplace_app_credentials" USING btree ("callback_key");--> statement-breakpoint
CREATE INDEX "marketplace_app_credentials_org_platform_idx" ON "marketplace_app_credentials" USING btree ("organization_id","platform");--> statement-breakpoint
CREATE INDEX "marketplace_app_credentials_platform_app_key_idx" ON "marketplace_app_credentials" USING btree ("platform","app_key");