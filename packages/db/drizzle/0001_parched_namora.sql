CREATE TABLE "commerce_brands" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" text;--> statement-breakpoint
ALTER TABLE "commerce_brands" ADD CONSTRAINT "commerce_brands_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_brands_org_code_uidx" ON "commerce_brands" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "commerce_brands_org_status_idx" ON "commerce_brands" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "commerce_brands_org_name_idx" ON "commerce_brands" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_commerce_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."commerce_brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_org_brand_idx" ON "products" USING btree ("organization_id","brand_id");