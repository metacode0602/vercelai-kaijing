CREATE TABLE "web_auth"."user_site_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"summary" text NOT NULL,
	"content" text NOT NULL,
	"category" varchar(32),
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_auth"."user_site_message" ADD CONSTRAINT "user_site_message_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "web_auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_user_site_message_user_created_idx" ON "web_auth"."user_site_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "web_user_site_message_user_read_idx" ON "web_auth"."user_site_message" USING btree ("user_id","read");