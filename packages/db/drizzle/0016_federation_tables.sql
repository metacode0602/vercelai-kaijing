CREATE TABLE "federation_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"jwks_uri" text NOT NULL,
	"claims_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_scopes" text[] NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_org_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"external_org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"den_issuer" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"jit_enabled" boolean DEFAULT false NOT NULL,
	"role_mapping_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"external_org_id" text NOT NULL,
	"external_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email" varchar(320),
	"email_verified" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "federation_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"scopes" text[] NOT NULL,
	"consented_by" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_token_exchange" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"subject_jti" text NOT NULL,
	"actor_jti" text,
	"client_id" text NOT NULL,
	"user_id" text,
	"scopes" text[] NOT NULL,
	"result" varchar(16) NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"event" varchar(64) NOT NULL,
	"actor" text,
	"subject" text,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "federation_org_binding" ADD CONSTRAINT "federation_org_binding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_org_binding" ADD CONSTRAINT "federation_org_binding_provider_id_federation_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."federation_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_org_binding" ADD CONSTRAINT "federation_org_binding_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_identity" ADD CONSTRAINT "federation_identity_provider_id_federation_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."federation_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_identity" ADD CONSTRAINT "federation_identity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_identity" ADD CONSTRAINT "federation_identity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_consent" ADD CONSTRAINT "federation_consent_provider_id_federation_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."federation_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_consent" ADD CONSTRAINT "federation_consent_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_consent" ADD CONSTRAINT "federation_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_consent" ADD CONSTRAINT "federation_consent_consented_by_users_id_fk" FOREIGN KEY ("consented_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_token_exchange" ADD CONSTRAINT "oauth_token_exchange_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_token_exchange" ADD CONSTRAINT "oauth_token_exchange_provider_id_federation_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."federation_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_token_exchange" ADD CONSTRAINT "oauth_token_exchange_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_token_exchange" ADD CONSTRAINT "oauth_token_exchange_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_audit" ADD CONSTRAINT "federation_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_audit" ADD CONSTRAINT "federation_audit_provider_id_federation_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."federation_provider"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_provider_issuer_uidx" ON "federation_provider" USING btree ("issuer");
--> statement-breakpoint
CREATE INDEX "federation_provider_status_idx" ON "federation_provider" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_org_binding_provider_external_org_uidx" ON "federation_org_binding" USING btree ("provider_id","external_org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_org_binding_provider_org_uidx" ON "federation_org_binding" USING btree ("provider_id","organization_id");
--> statement-breakpoint
CREATE INDEX "federation_org_binding_organization_idx" ON "federation_org_binding" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "federation_org_binding_client_idx" ON "federation_org_binding" USING btree ("client_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_identity_provider_external_user_uidx" ON "federation_identity" USING btree ("provider_id","external_org_id","external_user_id");
--> statement-breakpoint
CREATE INDEX "federation_identity_organization_idx" ON "federation_identity" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "federation_identity_user_idx" ON "federation_identity" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_consent_provider_org_client_uidx" ON "federation_consent" USING btree ("provider_id","organization_id","client_id");
--> statement-breakpoint
CREATE INDEX "federation_consent_organization_idx" ON "federation_consent" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_token_exchange_subject_jti_uidx" ON "oauth_token_exchange" USING btree ("subject_jti");
--> statement-breakpoint
CREATE INDEX "oauth_token_exchange_organization_idx" ON "oauth_token_exchange" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "oauth_token_exchange_provider_created_idx" ON "oauth_token_exchange" USING btree ("provider_id","created_at");
--> statement-breakpoint
CREATE INDEX "federation_audit_organization_created_idx" ON "federation_audit" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "federation_audit_provider_created_idx" ON "federation_audit" USING btree ("provider_id","created_at");
