CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"onboarding_document_requirements" jsonb DEFAULT '{"requireLicenseFile":true,"requireLegalRepIdImages":true,"requireAuthorizationFile":true,"requireAgentIdImages":true}'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
