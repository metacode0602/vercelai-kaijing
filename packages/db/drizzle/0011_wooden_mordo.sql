CREATE TABLE "shop_aftersale_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"inventory_release_mode" varchar(16) DEFAULT 'manual' NOT NULL,
	"refund_mode" varchar(16) DEFAULT 'manual' NOT NULL,
	"refund_wait_days" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_states" ADD COLUMN "last_reverse_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_release_mode" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_release_status" varchar(24) DEFAULT 'pending_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "inventory_released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_mode" varchar(16) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_wait_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_decision" varchar(24) DEFAULT 'pending_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reverse_orders" ADD COLUMN "refund_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_aftersale_policies" ADD CONSTRAINT "shop_aftersale_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_aftersale_policies" ADD CONSTRAINT "shop_aftersale_policies_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_aftersale_policies_org_idx" ON "shop_aftersale_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_aftersale_policies_shop_uidx" ON "shop_aftersale_policies" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "reverse_orders_refund_due_idx" ON "reverse_orders" USING btree ("refund_decision","refund_due_at");