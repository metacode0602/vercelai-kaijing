CREATE TABLE "member_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_roles_org_user_role_uidx" UNIQUE("organization_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission" varchar(64) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_uidx" UNIQUE("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "role_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role_id" text NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_ref_id" text,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_organization_id_code_uidx" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE "web_auth"."member_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_roles_org_user_role_uidx" UNIQUE("organization_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "web_auth"."role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission" varchar(64) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_uidx" UNIQUE("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "web_auth"."role_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role_id" text NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_ref_id" text,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_auth"."roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_organization_id_code_uidx" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."member_roles" ADD CONSTRAINT "member_roles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "web_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."member_roles" ADD CONSTRAINT "member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "web_auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "web_auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."role_scopes" ADD CONSTRAINT "role_scopes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "web_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."role_scopes" ADD CONSTRAINT "role_scopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "web_auth"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_auth"."roles" ADD CONSTRAINT "roles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "web_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_roles_org_user_idx" ON "member_roles" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_roles_role_id_idx" ON "member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_scopes_org_idx" ON "role_scopes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "role_scopes_role_id_idx" ON "role_scopes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_roles_org_user_idx" ON "web_auth"."member_roles" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_roles_role_id_idx" ON "web_auth"."member_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "web_auth"."role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_scopes_org_idx" ON "web_auth"."role_scopes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "role_scopes_role_id_idx" ON "web_auth"."role_scopes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "web_auth"."roles" USING btree ("organization_id");