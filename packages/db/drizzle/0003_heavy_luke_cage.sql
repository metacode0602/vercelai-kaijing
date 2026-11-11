CREATE TABLE "commerce_platform_basics" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"region" varchar(64),
	"timezone" varchar(64),
	"default_currency" varchar(16),
	"symbol" varchar(16),
	"decimals" integer,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_ready" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"source_id" text,
	CONSTRAINT "commerce_platform_basics_kind_check" CHECK ("commerce_platform_basics"."kind" in ('platform', 'country', 'currency')),
	CONSTRAINT "commerce_platform_basics_status_check" CHECK ("commerce_platform_basics"."status" in ('active', 'inactive')),
	CONSTRAINT "commerce_platform_basics_decimals_check" CHECK ("commerce_platform_basics"."decimals" is null or ("commerce_platform_basics"."decimals" >= 0 and "commerce_platform_basics"."decimals" <= 4))
);
--> statement-breakpoint
CREATE TABLE "platform_basics_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"region" varchar(64),
	"timezone" varchar(64),
	"default_currency" varchar(16),
	"symbol" varchar(16),
	"decimals" integer,
	"countries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_ready" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_basics_catalog_kind_check" CHECK ("platform_basics_catalog"."kind" in ('platform', 'country', 'currency')),
	CONSTRAINT "platform_basics_catalog_status_check" CHECK ("platform_basics_catalog"."status" in ('active', 'inactive')),
	CONSTRAINT "platform_basics_catalog_decimals_check" CHECK ("platform_basics_catalog"."decimals" is null or ("platform_basics_catalog"."decimals" >= 0 and "platform_basics_catalog"."decimals" <= 4))
);
--> statement-breakpoint
ALTER TABLE "commerce_platform_basics" ADD CONSTRAINT "commerce_platform_basics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_platform_basics" ADD CONSTRAINT "commerce_platform_basics_source_id_platform_basics_catalog_id_f" FOREIGN KEY ("source_id") REFERENCES "public"."platform_basics_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_platform_basics_org_kind_code_uidx" ON "commerce_platform_basics" USING btree ("organization_id","kind","code");--> statement-breakpoint
CREATE INDEX "commerce_platform_basics_org_kind_idx" ON "commerce_platform_basics" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "commerce_platform_basics_org_status_idx" ON "commerce_platform_basics" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_basics_catalog_kind_code_uidx" ON "platform_basics_catalog" USING btree ("kind","code");--> statement-breakpoint
CREATE INDEX "platform_basics_catalog_kind_status_idx" ON "platform_basics_catalog" USING btree ("kind","status");