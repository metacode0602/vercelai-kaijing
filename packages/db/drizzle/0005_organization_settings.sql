CREATE TABLE "organization_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_shop_id" text,
	"timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
	"display_currency" varchar(16) DEFAULT 'USD' NOT NULL,
	"table_density" varchar(16) DEFAULT 'comfortable' NOT NULL,
	"dingtalk_enabled" boolean DEFAULT false NOT NULL,
	"dingtalk_webhook_encrypted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_settings_density_check" CHECK ("organization_settings"."table_density" in ('comfortable', 'compact'))
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_default_shop_id_shops_id_fk" FOREIGN KEY ("default_shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;
