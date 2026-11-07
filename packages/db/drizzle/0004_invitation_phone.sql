-- 组织邀请支持手机号；邮箱改为可空（纯手机邀请）
ALTER TABLE "invitation" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_phone_idx" ON "invitation" USING btree ("phone");--> statement-breakpoint
ALTER TABLE "web_auth"."invitation" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
ALTER TABLE "web_auth"."invitation" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitation_phone_idx" ON "web_auth"."invitation" USING btree ("phone");
