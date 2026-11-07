CREATE TABLE "cs_inbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"platform" varchar(32) NOT NULL,
	"external_message_id" varchar(128) NOT NULL,
	"external_session_id" varchar(128),
	"customer" varchar(255),
	"customer_external_id" varchar(128),
	"subject" varchar(512),
	"preview" text,
	"body" text,
	"sku" varchar(64),
	"status" varchar(16) DEFAULT 'unread' NOT NULL,
	"received_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cs_inbox_messages" ADD CONSTRAINT "cs_inbox_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cs_inbox_messages" ADD CONSTRAINT "cs_inbox_messages_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_org_idx" ON "cs_inbox_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_org_received_idx" ON "cs_inbox_messages" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_shop_idx" ON "cs_inbox_messages" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_platform_idx" ON "cs_inbox_messages" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_sku_idx" ON "cs_inbox_messages" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "cs_inbox_messages_status_idx" ON "cs_inbox_messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cs_inbox_messages_shop_ext_uidx" ON "cs_inbox_messages" USING btree ("shop_id","external_message_id");