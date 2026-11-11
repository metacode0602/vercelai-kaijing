CREATE TABLE "shop_binding_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" varchar(32) NOT NULL,
	"external_shop_id" text NOT NULL,
	"challenger_shop_id" text NOT NULL,
	"challenger_organization_id" text NOT NULL,
	"occupant_shop_id" text NOT NULL,
	"occupant_organization_id" text NOT NULL,
	"initiator_user_id" text,
	"status" varchar(64) DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"appeal_deadline_at" timestamp with time zone,
	"appeal_content" text,
	"appealed_at" timestamp with time zone,
	"appealed_by_user_id" text,
	"appeal_reviewed_by_user_id" text,
	"appeal_reviewed_at" timestamp with time zone,
	"appeal_review_reason" text,
	"released_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_binding_conflicts_status_check" CHECK ("shop_binding_conflicts"."status" in ('pending', 'upheld', 'transfer_approved_pending_appeal', 'appealed_pending_review', 'released_pending_reauth', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "shop_binding_conflicts" ADD CONSTRAINT "shop_binding_conflicts_challenger_shop_id_shops_id_fk" FOREIGN KEY ("challenger_shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_binding_conflicts" ADD CONSTRAINT "shop_binding_conflicts_challenger_organization_id_organization_id_fk" FOREIGN KEY ("challenger_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_binding_conflicts" ADD CONSTRAINT "shop_binding_conflicts_occupant_shop_id_shops_id_fk" FOREIGN KEY ("occupant_shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_binding_conflicts" ADD CONSTRAINT "shop_binding_conflicts_occupant_organization_id_organization_id_fk" FOREIGN KEY ("occupant_organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_status_created_idx" ON "shop_binding_conflicts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_platform_ext_idx" ON "shop_binding_conflicts" USING btree ("platform","external_shop_id");--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_challenger_org_idx" ON "shop_binding_conflicts" USING btree ("challenger_organization_id");--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_occupant_org_idx" ON "shop_binding_conflicts" USING btree ("occupant_organization_id");--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_challenger_shop_idx" ON "shop_binding_conflicts" USING btree ("challenger_shop_id");--> statement-breakpoint
CREATE INDEX "shop_binding_conflicts_occupant_shop_idx" ON "shop_binding_conflicts" USING btree ("occupant_shop_id");
