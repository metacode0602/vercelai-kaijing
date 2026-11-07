CREATE TABLE "commerce_freight_rate_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"freight_mode" varchar(16) NOT NULL,
	"carrier_id" text,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"unit_rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"min_charge" numeric(18, 4) DEFAULT '0' NOT NULL,
	"surcharge" numeric(18, 4) DEFAULT '0' NOT NULL,
	"thc" numeric(18, 4) DEFAULT '0' NOT NULL,
	"volumetric_divisor" integer,
	"usable_cbm" numeric(12, 4),
	"unit_rate_per_ton" numeric(18, 4),
	"origin_port" varchar(16),
	"dest_port" varchar(16),
	"effective_from" varchar(10) NOT NULL,
	"effective_to" varchar(10),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ocean_shipment_boxes" ADD COLUMN "carton_spec_code" varchar(64);--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD COLUMN "carrier_id" text;--> statement-breakpoint
ALTER TABLE "commerce_freight_rate_cards" ADD CONSTRAINT "commerce_freight_rate_cards_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_freight_rate_cards" ADD CONSTRAINT "commerce_freight_rate_cards_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_freight_rate_cards_org_code_uidx" ON "commerce_freight_rate_cards" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "commerce_freight_rate_cards_org_mode_idx" ON "commerce_freight_rate_cards" USING btree ("organization_id","freight_mode","status");--> statement-breakpoint
CREATE INDEX "commerce_freight_rate_cards_carrier_idx" ON "commerce_freight_rate_cards" USING btree ("carrier_id");--> statement-breakpoint
ALTER TABLE "ocean_shipments" ADD CONSTRAINT "ocean_shipments_carrier_id_commerce_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."commerce_carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_costs" ADD CONSTRAINT "sku_costs_fx_rate_id_fx_rates_id_fk" FOREIGN KEY ("fx_rate_id") REFERENCES "public"."fx_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ocean_shipments_carrier_idx" ON "ocean_shipments" USING btree ("carrier_id");