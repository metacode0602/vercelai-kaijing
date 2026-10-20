CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"scope_type" varchar(16),
	"scope_id" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" jsonb,
	"entry_approved" boolean DEFAULT false NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"org_type" varchar(16) DEFAULT 'tenant' NOT NULL,
	"parent_merchant_org_id" text,
	"supplier_type" varchar(16),
	"supplier_tier" varchar(16),
	"supplier_status" varchar(16),
	"commission_rate" integer,
	"merchant_tier" varchar(16),
	"merchant_status" varchar(16),
	"merchant_commission_rate" integer,
	"enterprise_verification_status" varchar(16) DEFAULT 'unverified' NOT NULL,
	"identity_status" varchar(32) DEFAULT 'unverified' NOT NULL,
	"capsule_namespace_ready" boolean DEFAULT false NOT NULL,
	"capsule_sync_status" varchar(20) DEFAULT 'pending',
	"capsule_synced_at" timestamp,
	"capsule_sync_error" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"phone_number" text,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"role" varchar(256) DEFAULT 'user',
	"must_change_password" boolean DEFAULT false NOT NULL,
	"provisioned_by" text,
	"provisioned_at" timestamp with time zone,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "user_invitation_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"max_usage" integer,
	CONSTRAINT "user_invitation_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_invitation_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"inviter_id" text NOT NULL,
	"invitee_id" text NOT NULL,
	"invitation_code_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"reward_granted" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "user_site_message" (
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
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_task" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"gpu_card_type" varchar(128),
	"gpu_count" integer,
	"image_id" varchar(256),
	"command" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"backend_task_id" varchar(256),
	"progress" integer DEFAULT 0 NOT NULL,
	"message" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(32) NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"icon_url" varchar(512),
	"image_ref" varchar(512) NOT NULL,
	"source_type" varchar(32) DEFAULT 'docker_hub' NOT NULL,
	"min_gpu" varchar(64),
	"min_gpu_count" integer DEFAULT 1,
	"min_memory_gb" integer,
	"min_disk_gb" integer DEFAULT 60,
	"default_port" integer DEFAULT 8080,
	"default_command" text,
	"default_env_vars" jsonb,
	"health_check_path" varchar(256),
	"docs_url" varchar(1024),
	"source_url" varchar(1024),
	"deploy_type" varchar(16) DEFAULT 'instance' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"tier" varchar(16) DEFAULT 'community' NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_template_version" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version_tag" varchar(64) NOT NULL,
	"changelog" text,
	"image_ref" varchar(512) NOT NULL,
	"gpu_recommendations" jsonb,
	"command" text,
	"env_vars" jsonb,
	"is_latest" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_image" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"description" text,
	"category" varchar(64) NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"icon_url" varchar(512),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"recommended_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_image_version" (
	"id" text PRIMARY KEY NOT NULL,
	"base_image_id" text NOT NULL,
	"version_tag" varchar(255) NOT NULL,
	"display_label" varchar(255) NOT NULL,
	"full_image_ref" varchar(512) NOT NULL,
	"cuda_version" varchar(32),
	"os_version" varchar(64),
	"python_version" varchar(32),
	"size_bytes" integer,
	"digest_sha256" varchar(128),
	"requires_gpu" boolean DEFAULT true NOT NULL,
	"min_gpu_memory" integer,
	"is_latest" boolean DEFAULT false NOT NULL,
	"release_date" date,
	"deprecation_date" date,
	"deprecation_message" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_vm_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"os_type" varchar(16) DEFAULT 'linux' NOT NULL,
	"os_version" varchar(128),
	"network_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"security_group_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ssh_public_key" text,
	"internal_ip" varchar(45),
	"public_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compute_base" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" varchar(64) NOT NULL,
	"tenant_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_mode" varchar(32) NOT NULL,
	"commitment" varchar(32) DEFAULT 'on_demand' NOT NULL,
	"name" varchar(255),
	"status" varchar(32) DEFAULT 'creating' NOT NULL,
	"region" varchar(128),
	"idc_name" varchar(128),
	"resource_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image" varchar(512),
	"payment_order_id" text,
	"order_amount" numeric(15, 4),
	"balance_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"coupon_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compute_task_event" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"previous_status" varchar(32),
	"new_status" varchar(32),
	"description" text,
	"detail" jsonb,
	"triggered_by" varchar(64),
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_image" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"tag_name" varchar(255) NOT NULL,
	"image_ref" varchar(512) NOT NULL,
	"digest" varchar(256),
	"size_bytes" integer,
	"source" varchar(32) NOT NULL,
	"source_task_id" text,
	"external_ref" varchar(1024),
	"status" varchar(16) DEFAULT 'ready' NOT NULL,
	"scan_status" varchar(32),
	"scan_summary" jsonb,
	"description" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"recommended_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_save_job" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"source_task_id" text NOT NULL,
	"tag_name" varchar(255) NOT NULL,
	"image_ref" varchar(512) NOT NULL,
	"status" varchar(16) DEFAULT 'committing' NOT NULL,
	"digest" varchar(256),
	"size_bytes" integer,
	"node_id" varchar(255),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preload_node_task" (
	"id" text PRIMARY KEY NOT NULL,
	"preload_task_id" text NOT NULL,
	"node_name" varchar(256) NOT NULL,
	"node_ip" varchar(45),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"digest_after" varchar(128),
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "preload_task" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"image_ref" varchar(512) NOT NULL,
	"full_image_ref" varchar(512) NOT NULL,
	"image_digest" varchar(128),
	"registry_credential_id" text,
	"region_id" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer,
	"downloaded_bytes" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" varchar(64) NOT NULL,
	"registry_host" varchar(512) NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_enc" text NOT NULL,
	"credential_type" varchar(16) NOT NULL,
	"scope" varchar(32) DEFAULT 'push_pull' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serverless_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"compute_base_id" text NOT NULL,
	"service_name" varchar(255),
	"fault_tolerance" varchar(32) DEFAULT 'non_interruptible' NOT NULL,
	"min_replicas" integer DEFAULT 1 NOT NULL,
	"max_replicas" integer DEFAULT 1 NOT NULL,
	"target_port" integer,
	"command" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"public_url" varchar(512),
	"internal_endpoint" varchar(512),
	"endpoint_url" varchar(512),
	"sky_serve_id" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"tenant_id" text,
	"activity_type_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"ref_domain" varchar(64),
	"ref_id" text,
	"idempotency_key" varchar(128),
	"actor_user_id" text,
	"title_snapshot" varchar(255),
	"summary_snapshot" text,
	"payload" jsonb,
	"visibility" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "account_manager_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"user_staff_id" text NOT NULL,
	"role_type" varchar(32) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_type_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"type_code" varchar(64) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"category" varchar(32),
	"is_platform_projection" boolean DEFAULT true NOT NULL,
	"sort_order" integer
);
--> statement-breakpoint
CREATE TABLE "balance_snapshot_job_item" (
	"id" text PRIMARY KEY NOT NULL,
	"job_run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"granularity" varchar(8) NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "balance_snapshot_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(32) NOT NULL,
	"granularity" varchar(8) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(32) NOT NULL,
	"tenant_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "billing_sync_job_item" (
	"id" text PRIMARY KEY NOT NULL,
	"job_run_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(32) NOT NULL,
	"summary" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "billing_sync_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(32) NOT NULL,
	"sync_end_date" date NOT NULL,
	"safety_days" integer NOT NULL,
	"project_count" integer DEFAULT 0 NOT NULL,
	"tenant_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"name" varchar(255) NOT NULL,
	"platform_tenant_id" varchar(128),
	"merchant_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(32) NOT NULL,
	"phone" varchar(32),
	"overdue_at" timestamp with time zone,
	"credit_limit" numeric(20, 4),
	"balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"type" varchar(32) DEFAULT 'external' NOT NULL,
	"internal_effective_from" date,
	"internal_effective_to" date,
	"platform_registered_at" timestamp with time zone,
	"billing_sync_cursor_end_date" date,
	"billing_sync_last_started_at" timestamp with time zone,
	"billing_sync_last_finished_at" timestamp with time zone,
	"billing_sync_last_status" varchar(32),
	"billing_sync_last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_line" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_workday" (
	"calendar_date" date NOT NULL,
	"region_code" varchar(16) NOT NULL,
	"is_workday" boolean NOT NULL,
	CONSTRAINT "calendar_workday_calendar_date_region_code_pk" PRIMARY KEY("calendar_date","region_code")
);
--> statement-breakpoint
CREATE TABLE "compute_task" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(32) NOT NULL,
	"resource_type" varchar(64),
	"gpu_count" integer,
	"cpu_count" integer,
	"memory_gb" integer,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"cost" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE "consumption_record" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text,
	"merchant_id" text,
	"project_id" text,
	"product_line" varchar(64) NOT NULL,
	"resource_name" varchar(255),
	"amount" numeric(15, 4) NOT NULL,
	"duration" numeric,
	"unit" varchar(32),
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumption_usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"product_line" varchar(64),
	"unit" varchar(32),
	"amount" numeric(15, 4),
	"voucher_amount" numeric(15, 4),
	"balance_amount" numeric(15, 4),
	"total_card_hours" numeric(15, 4),
	"balance_card_hours" numeric(15, 4),
	"voucher_card_hours" numeric(15, 4) DEFAULT '0',
	"gpu_seconds" numeric
);
--> statement-breakpoint
CREATE TABLE "contract" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_no" varchar(64),
	"customer_id" text,
	"tenant_id" text,
	"project_id" text,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"paid_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"signed_at" timestamp with time zone,
	"signer_name" varchar(128),
	"terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"tenant_id" text,
	"contract_no" varchar(64),
	"contract_url" varchar(1024),
	"signed_on" date,
	"amount_summary" varchar(255),
	"external_crm_id" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "conversion_record" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"conversion_date" date NOT NULL,
	"trigger_type" varchar(64) NOT NULL,
	"candidate_signed_on" date,
	"candidate_scale_met_on" date,
	"candidate_recharge_ge_threshold_at" timestamp with time zone,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_relation_id" bigint,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"project_id" text,
	"template_id" text,
	"platform_template_id" bigint,
	"code" varchar(64),
	"name" varchar(255) NOT NULL,
	"type" varchar(32) DEFAULT 'cash' NOT NULL,
	"value" numeric(15, 4) DEFAULT '0' NOT NULL,
	"surplus_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"min_amount" numeric(15, 4),
	"status" varchar(32) NOT NULL,
	"remark" text,
	"validity_day" integer,
	"issued_at" timestamp with time zone NOT NULL,
	"expired_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"admin_nickname" varchar(128),
	"admin_phone" varchar(32),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"primary_tenant_id" text,
	"business_line_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"stage" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"start_date" date,
	"end_date" date,
	"monthly_budget" numeric(15, 4),
	"last_month_recharge" numeric(15, 4) DEFAULT '0' NOT NULL,
	"this_month_recharge" numeric(15, 4) DEFAULT '0' NOT NULL,
	"last_month_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"this_month_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance" numeric(15, 4),
	"revenue_department" varchar(32),
	"opportunity_source" varchar(32),
	"deal_closed_month" varchar(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"customer_code" varchar(64),
	"short_name" varchar(255),
	"cert_code" varchar(64),
	"type" varchar(8) NOT NULL,
	"status" varchar(32) NOT NULL,
	"contact_person" varchar(128),
	"contact_phone" varchar(32),
	"contact_email" varchar(255),
	"industry" varchar(128),
	"address" text,
	"sales_manager_id" text,
	"lifecycle_phase" varchar(64),
	"expected_scale" jsonb,
	"observed_scale_summary" jsonb,
	"test_started_on" date,
	"test_completed_on" date,
	"conversion_date" date,
	"conversion_trigger" varchar(128),
	"identity_verified" boolean DEFAULT false NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"identity_verification_type" varchar(16),
	"platform_registered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"wechat_id" varchar(128),
	"title" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_template" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_template_id" bigint NOT NULL,
	"title" varchar(255) NOT NULL,
	"support_products" text,
	"support_product_lines" text,
	"total_amount" numeric(15, 4),
	"face_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"rule" text,
	"status" varchar(32) NOT NULL,
	"validity_day" integer,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"remark" text,
	"mark" varchar(128),
	"platform_created_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"account_activity_id" text NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_document" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"project_id" text,
	"uploaded_by" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"version_no" integer DEFAULT 1 NOT NULL,
	"storage_uri" varchar(1024) NOT NULL,
	"visibility" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_up_task" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"project_id" text,
	"assignee_id" text,
	"source_account_activity_id" text,
	"title" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"due_on" date,
	"completed_at" timestamp with time zone,
	"completion_note" text
);
--> statement-breakpoint
CREATE TABLE "lifecycle_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"milestone_type" varchar(64) NOT NULL,
	"milestone_date" date NOT NULL,
	"filled_by" text,
	"filled_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "milestone_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"lifecycle_milestone_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_uri" varchar(1024) NOT NULL,
	"file_hash" varchar(128),
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_tenant_blacklist" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_blacklist_id" integer NOT NULL,
	"blacklist_type" varchar(32) NOT NULL,
	"platform_tenant_id" varchar(128) NOT NULL,
	"status" varchar(16) NOT NULL,
	"platform_tenant_name" varchar(255),
	"remark" text,
	"merchant_id" integer,
	"platform_created_at" timestamp with time zone,
	"platform_updated_at" timestamp with time zone,
	"local_tenant_id" text,
	"last_synced_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"author_name" varchar(128),
	"author_staff_id" text,
	"author_role" varchar(32),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_activity_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint,
	"mime_type" varchar(128),
	"storage_uri" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_conversion_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"reason" varchar(32) NOT NULL,
	"signed_on" date NOT NULL,
	"conversion_date" date NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_opportunity_source_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"opportunity_source" varchar(32) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "project_revenue_department_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"department" varchar(32) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "project_staff_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_staff_id" text NOT NULL,
	"role_type" varchar(32) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "project_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tag_assignment" (
	"project_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tag_assignment_project_id_tag_id_pk" PRIMARY KEY("project_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "project_tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"binding_role" varchar(64),
	"binding_label" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recharge" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"project_id" text,
	"amount" numeric(15, 4) NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"transaction_id" varchar(128),
	"refund_id" varchar(128),
	"refund_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"source" varchar(16) DEFAULT 'platform_sync' NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recharge_order" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"status" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"paid_at" timestamp with time zone,
	"external_trade_no" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "tenant_balance_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text,
	"granularity" varchar(8) NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_date" date NOT NULL,
	"balance" numeric(20, 4) NOT NULL,
	"credit_limit" numeric(20, 4),
	"source" varchar(32) DEFAULT 'platform_sync' NOT NULL,
	"platform_tenant_id" varchar(128),
	"platform_coin_raw" numeric(20, 4),
	"captured_at" timestamp with time zone NOT NULL,
	"job_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_bill" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text,
	"merchant_id" text NOT NULL,
	"project_id" text,
	"bill_month" varchar(7) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"status" varchar(32) NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"platform_period_start" timestamp with time zone,
	"platform_period_end" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_bill_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"platform_period_start" timestamp with time zone NOT NULL,
	"platform_period_end" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_bill_daily_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"daily_bill_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"product_line" varchar(64) NOT NULL,
	"resource_name" varchar(255) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_bill_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"product_line" varchar(64),
	"resource_name" varchar(255),
	"usage" numeric,
	"unit" varchar(32),
	"unit_price" numeric(15, 4),
	"price_source" varchar(8),
	"sales_price_id" text,
	"amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_blacklist_sync_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(32) NOT NULL,
	"data_start_time" text DEFAULT '' NOT NULL,
	"data_end_time" text NOT NULL,
	"safety_days" integer NOT NULL,
	"full_sync" boolean DEFAULT false NOT NULL,
	"platform_count" integer DEFAULT 0 NOT NULL,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"upserted_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "tenant_blacklist_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_pull_end_date" date,
	"default_safety_days" integer DEFAULT 2 NOT NULL,
	"last_job_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_consumption_daily_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"tenant_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"product_line" varchar(64) NOT NULL,
	"data_center_id" text,
	"data_center_code" varchar(64) NOT NULL,
	"data_center_name" varchar(255) NOT NULL,
	"gpu_card_type_id" text,
	"gpu_card_type_code" varchar(64) NOT NULL,
	"gpu_card_type_name" varchar(128),
	"platform_task_id" varchar(64),
	"task_name" varchar(255),
	"total_amount" numeric(15, 4) NOT NULL,
	"voucher_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_card_hours" numeric(15, 4),
	"voucher_card_hours" numeric(15, 4) DEFAULT '0',
	"balance_card_hours" numeric(15, 4),
	"source" varchar(32) DEFAULT 'platform_sync' NOT NULL,
	"platform_idempotency_key" varchar(256) NOT NULL,
	"unit_price" numeric(15, 4),
	"price_source" varchar(8),
	"sales_price_id" text,
	"pricing_resolve_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"wechat_id" varchar(128),
	"title" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_region_gpu_consumption_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text,
	"customer_id" text,
	"project_id" text,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"region_code" varchar(64) NOT NULL,
	"gpu_model" varchar(128) NOT NULL,
	"product_line" varchar(64) DEFAULT 'elastic_deployment' NOT NULL,
	"data_center_id" text,
	"gpu_card_type_id" text,
	"base_value" numeric(15, 4) DEFAULT '0',
	"total_consumption" numeric(15, 4) NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_consumption" numeric(15, 4) NOT NULL,
	"total_card_hours" numeric(15, 4) NOT NULL,
	"voucher_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_card_hours" numeric(15, 4) NOT NULL,
	"source" varchar(32) DEFAULT 'platform_sync' NOT NULL,
	"platform_idempotency_key" varchar(256) NOT NULL,
	"raw_json" jsonb,
	"tenant_name" varchar(255),
	"customer_full_name" varchar(255),
	"project_name" varchar(255),
	"account_manager_staff_id" text,
	"account_manager_name" varchar(128),
	"enrichment_binding_source" varchar(32) DEFAULT 'none' NOT NULL,
	"project_enrichment_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_incentive_type" varchar(32) DEFAULT 'new_customer' NOT NULL,
	"customer_incentive_label" varchar(16) DEFAULT '新客' NOT NULL,
	"incentive_start_date" date,
	"data_center_code" varchar(64),
	"data_center_name" varchar(255),
	"gpu_card_type_code" varchar(64),
	"gpu_card_type_name" varchar(128),
	"pricing_mode" varchar(32),
	"list_price_per_hour" numeric(15, 4),
	"unit_price_per_hour" numeric(15, 4),
	"revenue_share_percent" numeric(7, 4),
	"platform_card_list_price_id" text,
	"supplier_unit_cost_id" text,
	"supplier_pricing_record_id" text,
	"pricing_resolve_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_region_gpu_consumption_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text,
	"customer_id" text,
	"project_id" text,
	"usage_month" varchar(7) NOT NULL,
	"region_code" varchar(64) NOT NULL,
	"gpu_model" varchar(128) NOT NULL,
	"product_line" varchar(64) DEFAULT 'elastic_deployment' NOT NULL,
	"data_center_id" text,
	"gpu_card_type_id" text,
	"base_value" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"source" varchar(32) DEFAULT 'manual_import' NOT NULL,
	"tenant_name" varchar(255),
	"customer_full_name" varchar(255),
	"project_name" varchar(255),
	"account_manager_staff_id" text,
	"account_manager_name" varchar(128),
	"enrichment_binding_source" varchar(32) DEFAULT 'none' NOT NULL,
	"project_enrichment_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_incentive_type" varchar(32) DEFAULT 'new_customer' NOT NULL,
	"customer_incentive_label" varchar(16) DEFAULT '新客' NOT NULL,
	"incentive_start_date" date,
	"data_center_code" varchar(64),
	"data_center_name" varchar(255),
	"gpu_card_type_code" varchar(64),
	"gpu_card_type_name" varchar(128),
	"pricing_mode" varchar(32),
	"list_price_per_hour" numeric(15, 4),
	"unit_price_per_hour" numeric(15, 4),
	"revenue_share_percent" numeric(7, 4),
	"platform_card_list_price_id" text,
	"supplier_unit_cost_id" text,
	"supplier_pricing_record_id" text,
	"pricing_resolve_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_voucher_issue" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"tenant_id" text,
	"operator_id" text,
	"issued_at" timestamp with time zone NOT NULL,
	"issue_status" varchar(32) NOT NULL,
	"coupon_id" text,
	"coupon_config" jsonb,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "user_staff" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_no" varchar(64),
	"display_name" varchar(128) NOT NULL,
	"mobile" varchar(32) NOT NULL,
	"email" varchar(255),
	"status" varchar(32) NOT NULL,
	"department" varchar(128),
	"position" varchar(128),
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default_pre_sales" boolean DEFAULT false NOT NULL,
	"is_default_account_manager" boolean DEFAULT false NOT NULL,
	"is_default_delivery_manager" boolean DEFAULT false NOT NULL,
	"is_default_project_manager" boolean DEFAULT false NOT NULL,
	"auth_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period" (
	"id" text PRIMARY KEY NOT NULL,
	"period_code" varchar(32) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"total_income" numeric(15, 4),
	"enterprise_income" numeric(15, 4),
	"personal_income" numeric(15, 4),
	"income_total" numeric(15, 4),
	"total_cost" numeric(15, 4),
	"project_cost" numeric(15, 4),
	"internal_user_cost" numeric(15, 4),
	"total_gross_profit" numeric(15, 4),
	"supplementary" numeric(15, 4),
	"balance_income" numeric(15, 4),
	"baremetal_income" numeric(15, 4),
	"last_computed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"ignore_list_price_windows" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_agg_customer_consumption" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"customer_type" varchar(8) NOT NULL,
	"tenant_id" text,
	"customer_id" text,
	"customer_full_name" varchar(255),
	"project_id" text,
	"project_name" varchar(255),
	"allocation_percent" numeric(7, 4),
	"total_consumption" numeric(15, 4) NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_consumption" numeric(15, 4) NOT NULL,
	"source_raw_ids" jsonb NOT NULL,
	"row_count_by_type" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"window_id" text,
	"file_type" varchar(32) NOT NULL,
	"file_name" varchar(512) NOT NULL,
	"storage_path" varchar(1024) DEFAULT '' NOT NULL,
	"error_report_path" varchar(1024),
	"file_sha256" varchar(64) NOT NULL,
	"file_size_bytes" integer,
	"parse_status" varchar(16) DEFAULT 'ok' NOT NULL,
	"parse_error_count" integer DEFAULT 0 NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_operation_log" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"operation" varchar(32) NOT NULL,
	"purge_scope" varchar(32),
	"actor_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_personal_income_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"summary_kind" varchar(32) NOT NULL,
	"balance_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"bare_metal_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_consumption" numeric(15, 4) NOT NULL,
	"matched_tenant_count" integer DEFAULT 0 NOT NULL,
	"tenant_bill_batch_id" text,
	"baremetal_batch_id" text,
	"rule_version" varchar(32),
	"last_computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_personal_income_tenant_line" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"platform_tenant_id" varchar(128) NOT NULL,
	"segment" varchar(32) NOT NULL,
	"customer_type_label" varchar(16),
	"customer_name" varchar(255),
	"balance_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"bare_metal_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_consumption" numeric(15, 4) NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"rule_version" varchar(32),
	"last_computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_raw_baremetal_order" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"order_id" varchar(128) NOT NULL,
	"order_no" varchar(128),
	"tenant_platform_id" varchar(128) NOT NULL,
	"idc_name" varchar(128),
	"device_model" varchar(128),
	"pay_status" varchar(32) NOT NULL,
	"device_status" varchar(32),
	"purchase_qty_text" varchar(128),
	"device_qty" integer,
	"order_amount" numeric(15, 4),
	"refund_amount" numeric(15, 4) DEFAULT '0',
	"final_amount" numeric(15, 4) NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_raw_customer_consumption" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"product_type" varchar(128),
	"tenant_type" varchar(32),
	"customer_type" varchar(8) NOT NULL,
	"project_name_excel" varchar(255),
	"total_consumption" numeric(15, 4) NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_consumption" numeric(15, 4) NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_raw_tenant_bill" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"bill_line_type" varchar(64),
	"tenant_type_label" varchar(32),
	"customer_type_label" varchar(16),
	"customer_name" varchar(255),
	"total_consumption" numeric(15, 4) NOT NULL,
	"voucher_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_consumption" numeric(15, 4) NOT NULL,
	"total_card_hours" numeric(15, 4),
	"voucher_card_hours" numeric(15, 4) DEFAULT '0',
	"balance_card_hours" numeric(15, 4) NOT NULL,
	"gpu_model" varchar(128) NOT NULL,
	"region_code" varchar(64) NOT NULL,
	"raw_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_reconciliation_report" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"report_json" jsonb NOT NULL,
	"rule_version" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_tenant_bill_window" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_period_tenant_project_enrichment" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"staff_id" text,
	"account_manager_name" varchar(128),
	"source" varchar(32) NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_tenant_cost_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"allocation_percent" numeric(7, 4) NOT NULL,
	"preset_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_request_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"invoice_no" varchar(64) NOT NULL,
	"invoice_code" varchar(64),
	"invoice_type" varchar(32) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"tax_amount" numeric(15, 4) NOT NULL,
	"amount_without_tax" numeric(15, 4) NOT NULL,
	"tax_rate" numeric(5, 4) NOT NULL,
	"issuer_name" varchar(128),
	"issuer_tax_no" varchar(64),
	"issued_at" timestamp with time zone NOT NULL,
	"pdf_url" varchar(1024),
	"pdf_storage_key" varchar(512),
	"file_mime_type" varchar(128),
	"file_size" integer,
	"file_original_name" varchar(255),
	"void_status" varchar(32) DEFAULT 'normal' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"red_flush_invoice_id" text,
	"external_invoice_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_invoice_no_unique" UNIQUE("invoice_no")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"line_order" integer NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"spec" varchar(128),
	"unit" varchar(32),
	"quantity" numeric(15, 4),
	"unit_price" numeric(15, 4),
	"amount" numeric(15, 4) NOT NULL,
	"tax_rate" numeric(5, 4),
	"tax_amount" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE "invoice_request" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"bill_monthly_id" text NOT NULL,
	"invoice_title_id" text NOT NULL,
	"invoice_type" varchar(32) NOT NULL,
	"request_amount" numeric(15, 4) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_remark" text,
	"rejection_reason" text,
	"supplier_remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_title" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"invoice_type" varchar(32) NOT NULL,
	"company_name" varchar(255),
	"tax_no" varchar(64),
	"registered_address" text,
	"registered_phone" varchar(32),
	"bank_name" varchar(255),
	"bank_account" varchar(64),
	"individual_name" varchar(128),
	"individual_id_no" varchar(32),
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_base_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"project_id" text,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text,
	"product_line" varchar(64) NOT NULL,
	"region_code" varchar(64) NOT NULL,
	"gpu_card_type_id" text,
	"gpu_card_type_name" varchar(128),
	"data_center_id" text,
	"customer_full_name" varchar(255),
	"account_manager_staff_id" text,
	"account_manager_name" varchar(128),
	"opportunity_source" varchar(32),
	"opportunity_source_label" varchar(32),
	"customer_incentive_type" varchar(32),
	"customer_incentive_label" varchar(16),
	"balance_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"confirmed_revenue_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"pc_sold_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"pc_gifted_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"pc_gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"sp_sold_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"sp_gifted_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"sp_gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"pc_supplier_unit_cost_id" text,
	"sp_platform_card_list_price_id" text,
	"sp_sell_price_per_hour" numeric(15, 4),
	"remark" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_commission_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32) NOT NULL,
	"account_manager_staff_id" text,
	"account_manager_name" varchar(128) NOT NULL,
	"opportunity_source" varchar(32) NOT NULL,
	"opportunity_source_label" varchar(32),
	"customer_incentive_label" varchar(16) NOT NULL,
	"gross_profit_sum" numeric(15, 4) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(7, 4) NOT NULL,
	"commission_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_commission_project_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32) NOT NULL,
	"project_id" text NOT NULL,
	"project_name" varchar(255),
	"recipient_role" varchar(32) NOT NULL,
	"recipient_dept" varchar(16),
	"account_manager_staff_id" text,
	"account_manager_name" varchar(128),
	"opportunity_source" varchar(32),
	"customer_incentive_label" varchar(16) NOT NULL,
	"gross_profit_base" numeric(15, 4) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(7, 4) NOT NULL,
	"commission_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_dept_contribution_weight" (
	"id" text PRIMARY KEY NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32),
	"recipient_dept" varchar(16) NOT NULL,
	"customer_incentive_label" varchar(16) NOT NULL,
	"staff_id" text NOT NULL,
	"weight_percent" numeric(7, 4) NOT NULL,
	"effective_from" date,
	"note" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_dept_distribution_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"dept_pool_line_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32) NOT NULL,
	"recipient_dept" varchar(16) NOT NULL,
	"customer_incentive_label" varchar(16) NOT NULL,
	"staff_id" text NOT NULL,
	"staff_name" varchar(128) NOT NULL,
	"weight_percent" numeric(7, 4) NOT NULL,
	"commission_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"source_pool_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_dept_pool_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32) NOT NULL,
	"recipient_dept" varchar(16) NOT NULL,
	"customer_incentive_label" varchar(16) NOT NULL,
	"gross_profit_base_sum" numeric(15, 4) DEFAULT '0' NOT NULL,
	"commission_pool_sum" numeric(15, 4) DEFAULT '0' NOT NULL,
	"project_count" integer DEFAULT 0 NOT NULL,
	"pool_scope_note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_dept_pool_project_line" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"dept_pool_line_id" text NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cost_branch" varchar(32) NOT NULL,
	"recipient_dept" varchar(16) NOT NULL,
	"customer_incentive_label" varchar(16) NOT NULL,
	"project_id" text NOT NULL,
	"project_name" varchar(255),
	"opportunity_source" varchar(32),
	"opportunity_source_label" varchar(32),
	"account_manager_name" varchar(128),
	"gross_profit_base" numeric(15, 4) DEFAULT '0' NOT NULL,
	"commission_pool_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_cost_run" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"billing_period_code" varchar(32) NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"status" varchar(16) NOT NULL,
	"base_line_count" integer DEFAULT 0 NOT NULL,
	"commission_project_line_count" integer DEFAULT 0 NOT NULL,
	"commission_am_line_count" integer DEFAULT 0 NOT NULL,
	"dept_pool_line_count" integer DEFAULT 0 NOT NULL,
	"dept_pool_project_line_count" integer DEFAULT 0 NOT NULL,
	"dept_distribution_line_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"dept_distribution_status" varchar(16) DEFAULT 'not_applicable' NOT NULL,
	"error_summary" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"triggered_by" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"confirmed_cost_branch" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_income_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"customer_type" varchar(8) NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_name" varchar(255) NOT NULL,
	"customer_id" text,
	"customer_full_name" varchar(255),
	"project_id" text,
	"project_name" varchar(255),
	"supplementary_consumption" numeric(15, 4),
	"balance_consumption" numeric(15, 4),
	"bare_metal_consumption" numeric(15, 4),
	"bare_metal_balance_consumption" numeric(15, 4),
	"total_consumption" numeric(15, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_monthly_cost_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"billing_period_id" text NOT NULL,
	"settlement_month" varchar(7) NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_name" varchar(255) NOT NULL,
	"project_id" text,
	"project_name" varchar(255),
	"customer_id" text,
	"customer_full_name" varchar(255),
	"account_manager" varchar(128),
	"opportunity_source" varchar(64),
	"balance_consumption" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"confirmed_revenue_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"sold_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"gifted_duration_cost_excl_tax" numeric(15, 4) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplementary_consumption_history" (
	"id" text PRIMARY KEY NOT NULL,
	"income_id" text NOT NULL,
	"previous_value" numeric(15, 4),
	"new_value" numeric(15, 4) NOT NULL,
	"type" varchar(32) NOT NULL,
	"remark" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_project_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"allocation_percent" numeric(7, 4) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"remark" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"organization_id" varchar(64) NOT NULL,
	"type" varchar(16) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"available_before" numeric(15, 4) NOT NULL,
	"available_after" numeric(15, 4) NOT NULL,
	"reserved_before" numeric(15, 4) NOT NULL,
	"reserved_after" numeric(15, 4) NOT NULL,
	"balance_before" numeric(15, 4) NOT NULL,
	"balance_after" numeric(15, 4) NOT NULL,
	"voucher_available_before" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_available_after" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_reserved_before" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_reserved_after" numeric(15, 4) DEFAULT '0' NOT NULL,
	"ref_type" varchar(32),
	"ref_id" text,
	"idempotency_key" varchar(128),
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_no" varchar(64) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"bank_branch" varchar(255),
	"bank_code" varchar(32),
	"merchant_id" text,
	"account_type" varchar(16) DEFAULT 'enterprise' NOT NULL,
	"remark" text,
	"min_amount" numeric(15, 4) DEFAULT '0',
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transfer_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_order_id" text NOT NULL,
	"remitter_name" varchar(255) NOT NULL,
	"remitter_account" varchar(64),
	"transfer_amount" numeric(15, 4) NOT NULL,
	"transfer_time" timestamp with time zone,
	"voucher_image_url" varchar(1024),
	"voucher_image_key" varchar(255),
	"bank_serial_no" varchar(128),
	"remark" text,
	"reviewer_id" text,
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"organization_id" varchar(64),
	"user_id" varchar(64),
	"status" varchar(16) NOT NULL,
	"original_value" numeric(15, 4),
	"remaining_value" numeric(15, 4),
	"granted_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_coupon_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"type" varchar(16) NOT NULL,
	"face_value" numeric(15, 4),
	"discount_percent" numeric(7, 4),
	"applicable_resources" text,
	"cost_bearer" varchar(16) NOT NULL,
	"budget_limit" numeric(15, 4),
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_coupon_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"task_instance_id" text NOT NULL,
	"original_cost" numeric(15, 4) NOT NULL,
	"coupon_deduction" numeric(15, 4) NOT NULL,
	"actual_payment" numeric(15, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_verification_application" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"real_name" varchar(128),
	"id_number_cipher" text,
	"id_number_mask" varchar(32),
	"mobile" varchar(32),
	"mobile_verified" boolean DEFAULT false NOT NULL,
	"company_name" varchar(255),
	"uscc" varchar(32),
	"legal_person_name" varchar(128),
	"applicant_role" varchar(16),
	"authorized_person_name" varchar(128),
	"new_company_name" varchar(255),
	"rename_reason" text,
	"review_comment" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"bound_customer_id" text,
	"submitted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_verification_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_cost_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_usage_id" text NOT NULL,
	"bearer" varchar(16) NOT NULL,
	"idc_provider_id" varchar(64),
	"amount" numeric(15, 4) NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_channel_config" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" varchar(16) NOT NULL,
	"channel_name" varchar(64) NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"merchant_id" varchar(64) NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_v3_key_enc" text,
	"public_key_enc" text,
	"private_key_enc" text,
	"certificate_enc" text,
	"notify_url" varchar(512) NOT NULL,
	"return_url" varchar(512),
	"is_active" boolean DEFAULT true NOT NULL,
	"config_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_channel_config_channel_unique" UNIQUE("channel")
);
--> statement-breakpoint
CREATE TABLE "payment_order" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"tenant_id" text,
	"merchant_id" text,
	"scene" varchar(16) NOT NULL,
	"scene_order_id" text,
	"amount" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"payment_method" varchar(16) NOT NULL,
	"channel_order_no" varchar(128),
	"channel_status" varchar(32),
	"channel_response" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"expired_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"ip_address" varchar(45),
	"user_agent" text,
	CONSTRAINT "payment_order_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "payment_order_single_payer" CHECK (num_nonnulls("payment_order"."tenant_id", "payment_order"."merchant_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliation" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_date" date NOT NULL,
	"channel" varchar(16) NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"platform_count" integer DEFAULT 0 NOT NULL,
	"platform_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"diff_count" integer DEFAULT 0 NOT NULL,
	"diff_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"detail_json" text,
	"reconciled_by" text,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_refund" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_order_id" text NOT NULL,
	"refund_order_no" varchar(64) NOT NULL,
	"tenant_id" text NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"channel_refund_no" varchar(128),
	"channel_response" text,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"refund_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refund_refund_order_no_unique" UNIQUE("refund_order_no")
);
--> statement-breakpoint
CREATE TABLE "task_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" varchar(64),
	"workspace_id" text,
	"name" varchar(255),
	"task_type" varchar(16) NOT NULL,
	"serve_mode" varchar(16),
	"resource_spec" text,
	"image" varchar(512),
	"command" text,
	"env_vars" text,
	"min_replicas" integer,
	"max_replicas" integer,
	"target_port" integer,
	"status" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text,
	"organization_id" varchar(64),
	"sky_job_id" varchar(256),
	"sky_serve_id" varchar(256),
	"instance_type" varchar(16) NOT NULL,
	"status" varchar(32) NOT NULL,
	"idc_name" varchar(128),
	"node_name" varchar(128),
	"cluster_name" varchar(128),
	"resource_spec" text,
	"scheduled_at" timestamp with time zone,
	"billing_started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"internal_endpoint" varchar(512),
	"public_url" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_balance" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"organization_id" varchar(64) NOT NULL,
	"available_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"reserved_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_available_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_reserved_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_profiles" (
	"organization_id" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(16) NOT NULL,
	"quota" text NOT NULL,
	"default_idc_tag" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" varchar(64) PRIMARY KEY NOT NULL,
	"default_org_id" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "platform_card_list_price" (
	"id" text PRIMARY KEY NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"sell_price" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"effective_from" timestamp(0) NOT NULL,
	"effective_to" timestamp(0),
	"status" varchar(32) NOT NULL,
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_card_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"price_record_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"previous_sell_price" numeric(15, 4),
	"new_sell_price" numeric(15, 4) NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by_staff_id" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "platform_card_price_record" (
	"id" text PRIMARY KEY NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"sell_price" numeric(15, 4) NOT NULL,
	"platform_card_list_price_id" text,
	"effective_from" timestamp(0) NOT NULL,
	"updated_by_staff_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_datacenter_sell_price" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"sell_price" numeric(15, 4) NOT NULL,
	"platform_card_list_price_id" text,
	"inherit_platform_price" boolean DEFAULT false NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"effective_from" timestamp(0) NOT NULL,
	"effective_to" timestamp(0),
	"source" varchar(64),
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_datacenter_sell_price_history" (
	"id" text PRIMARY KEY NOT NULL,
	"sell_price_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"previous_sell_price" numeric(15, 4),
	"new_sell_price" numeric(15, 4) NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by_staff_id" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "merchant" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"platform_merchant_id" integer,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"company_full_name" varchar(512) NOT NULL,
	"unified_social_credit_code" varchar(18),
	"merchant_mark" varchar(128),
	"access_mode" varchar(16) DEFAULT 'oem' NOT NULL,
	"type" varchar(32) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" varchar(32) NOT NULL,
	"contact_user" varchar(128),
	"contact_phone" varchar(32),
	"remark" text,
	"platform_synced_at" timestamp with time zone,
	"admin_url" varchar(1024),
	"console_url" varchar(1024),
	"website" varchar(1024),
	"promo_enabled" boolean DEFAULT false NOT NULL,
	"oem_enabled" boolean DEFAULT false NOT NULL,
	"iframe_enabled" boolean DEFAULT false NOT NULL,
	"funding_mode" varchar(16) DEFAULT 'prepay' NOT NULL,
	"commission_tier_id" text,
	"commission_rate_override" numeric(7, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_funding_mode_check" CHECK ("merchant"."funding_mode" IN ('prepay', 'commission')),
	CONSTRAINT "merchant_commission_rate_override_check" CHECK ("merchant"."commission_rate_override" IS NULL OR ("merchant"."commission_rate_override" >= 0 AND "merchant"."commission_rate_override" <= 1))
);
--> statement-breakpoint
CREATE TABLE "merchant_account" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"cash_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_balance" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_used" numeric(15, 4) DEFAULT '0' NOT NULL,
	"frozen" numeric(15, 4) DEFAULT '0' NOT NULL,
	"low_balance_threshold" numeric(15, 4) DEFAULT '0' NOT NULL,
	"recharge_block_threshold" numeric(15, 4),
	"auto_recharge_enabled" boolean DEFAULT false NOT NULL,
	"auto_recharge_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_account_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"direction" varchar(8) NOT NULL,
	"pool" varchar(16) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"effect" varchar(16) DEFAULT 'available' NOT NULL,
	"available_before" numeric(15, 4) NOT NULL,
	"available_after" numeric(15, 4) NOT NULL,
	"reserved_before" numeric(15, 4) NOT NULL,
	"reserved_after" numeric(15, 4) NOT NULL,
	"balance_before" numeric(15, 4) NOT NULL,
	"balance_after" numeric(15, 4) NOT NULL,
	"ref_type" varchar(32) NOT NULL,
	"ref_id" text,
	"idempotency_key" varchar(128) NOT NULL,
	"trace_id" text,
	"external_user_ref" text,
	"description" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_account_manager_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"user_staff_id" text NOT NULL,
	"role_type" varchar(32) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"remark" text,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_account_pool" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_merchant_id" integer DEFAULT 0 NOT NULL,
	"pool" varchar(16) NOT NULL,
	"name" varchar(32) NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_account_pool_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"pool" varchar(16) NOT NULL,
	"available" numeric(15, 4) DEFAULT '0' NOT NULL,
	"reserved" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total" numeric(15, 4) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"last_ledger_id" text,
	"last_ledger_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_account_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"trigger" varchar(16) NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"cash_available" numeric(15, 4) DEFAULT '0' NOT NULL,
	"cash_reserved" numeric(15, 4) DEFAULT '0' NOT NULL,
	"cash_total" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_available" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_reserved" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_total" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_available" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_reserved" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_total" numeric(15, 4) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"ledger_count" bigint DEFAULT 0 NOT NULL,
	"consume_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"author_staff_id" text,
	"author_name" varchar(128) NOT NULL,
	"author_role" varchar(32) NOT NULL,
	"ref_domain" varchar(64),
	"ref_id" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merchant_activity_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint,
	"mime_type" varchar(128),
	"storage_uri" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"scopes" varchar(256) NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_bill" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"bill_month" varchar(7) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"platform_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"coupon_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"tenant_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"source" varchar(32) DEFAULT 'rollup_from_tenant' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_bill_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"bill_date" date NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"platform_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"coupon_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"tenant_count" integer DEFAULT 0 NOT NULL,
	"source" varchar(32) DEFAULT 'rollup_from_tenant' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_bill_daily_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"daily_bill_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"product_line" varchar(64) NOT NULL,
	"resource_name" varchar(255) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_bill_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_bill_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"bill_month" varchar(7) NOT NULL,
	"product_line" varchar(64) NOT NULL,
	"resource_name" varchar(255) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"coupon_amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"brand_name" varchar(255) NOT NULL,
	"logo_url" varchar(1024),
	"favicon_url" varchar(1024),
	"primary_color" varchar(16),
	"custom_domain" varchar(255),
	"payment_channel_config" jsonb,
	"sms_channel_config" jsonb,
	"email_channel_config" jsonb,
	"theme_config" jsonb,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_commission_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"tier_code" varchar(32) NOT NULL,
	"tier_name" varchar(64) NOT NULL,
	"monthly_basis_min" numeric(15, 4) NOT NULL,
	"monthly_basis_max" numeric(15, 4),
	"commission_rate" numeric(7, 4) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_commission_tier_rate_check" CHECK ("merchant_commission_tier"."commission_rate" >= 0 AND "merchant_commission_tier"."commission_rate" <= 1),
	CONSTRAINT "merchant_commission_tier_range_check" CHECK ("merchant_commission_tier"."monthly_basis_max" IS NULL OR "merchant_commission_tier"."monthly_basis_max" > "merchant_commission_tier"."monthly_basis_min")
);
--> statement-breakpoint
CREATE TABLE "merchant_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"wechat_id" varchar(128),
	"title" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_datacenter_card_type" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_datacenter_region_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"status" varchar(32) DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_datacenter_region" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"display_name" varchar(255),
	"region_code" varchar(128) NOT NULL,
	"status" varchar(32) NOT NULL,
	"available_gpu_quota" integer DEFAULT -1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_external_subject" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"external_user_ref" varchar(128) NOT NULL,
	"external_tenant_ref" varchar(128),
	"platform_tenant_id" text NOT NULL,
	"bind_status" varchar(32) DEFAULT 'active' NOT NULL,
	"first_bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_finance_config" (
	"config_key" varchar(64) PRIMARY KEY NOT NULL,
	"numeric_value" numeric(15, 4) NOT NULL,
	"remark" text,
	"updated_by_staff_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_finance_config_value_check" CHECK ("merchant_finance_config"."numeric_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "merchant_finance_config_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"config_key" varchar(64) NOT NULL,
	"old_value" numeric(15, 4),
	"new_value" numeric(15, 4) NOT NULL,
	"operator_staff_id" text,
	"operator_name" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "merchant_payment_node" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"expected_amount" numeric(15, 4) NOT NULL,
	"due_date" date NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"bill_month" varchar(7),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_by_staff_id" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_payment_node_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_node_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"action" varchar(16) NOT NULL,
	"operator_staff_id" text,
	"operator_name" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"changes" jsonb,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "merchant_payout_account" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" varchar(16) NOT NULL,
	"owner_id" text NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_no" varchar(64) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"bank_branch" varchar(255),
	"bank_code" varchar(32),
	"account_type" varchar(16) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"status" varchar(16) DEFAULT 'pending_review' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by_staff_id" text,
	"reject_reason" text,
	"created_by_staff_id" text,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_payout_account_owner_type_check" CHECK ("merchant_payout_account"."owner_type" IN ('merchant', 'supplier')),
	CONSTRAINT "merchant_payout_account_type_check" CHECK ("merchant_payout_account"."account_type" IN ('enterprise', 'personal')),
	CONSTRAINT "merchant_payout_account_status_check" CHECK ("merchant_payout_account"."status" IN ('pending_review', 'active', 'rejected', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "merchant_payout_account_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_account_id" text NOT NULL,
	"owner_type" varchar(16) NOT NULL,
	"owner_id" text NOT NULL,
	"action" varchar(24) NOT NULL,
	"operator_staff_id" text,
	"operator_name" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"changes" jsonb,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "merchant_product_purchase_price" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"pricing_model" varchar(16) NOT NULL,
	"commission_rate" numeric(7, 4),
	"fixed_unit_price" numeric(15, 4),
	"billing_unit" varchar(16) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"source" varchar(32) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" varchar(32) NOT NULL,
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_product_purchase_price_pricing_model_ck" CHECK ("merchant_product_purchase_price"."pricing_model" in ('revenue_share', 'fixed_price'))
);
--> statement-breakpoint
CREATE TABLE "merchant_promo_attribution" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"promo_link_id" text NOT NULL,
	"promo_code" varchar(64) NOT NULL,
	"tenant_id" text,
	"user_id" text,
	"event_type" varchar(32) NOT NULL,
	"event_data" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_promo_link" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"promo_code" varchar(64) NOT NULL,
	"landing_product" varchar(64),
	"short_url" varchar(512),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"click_count" integer DEFAULT 0 NOT NULL,
	"signup_count" integer DEFAULT 0 NOT NULL,
	"recharge_count" integer DEFAULT 0 NOT NULL,
	"total_recharge_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_consume_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"remark" text,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_purchase_price" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"purchase_price" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"source" varchar(32) NOT NULL,
	"platform_list_price_id" text,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" varchar(32) NOT NULL,
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_purchase_price_record" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"purchase_price" numeric(15, 4) NOT NULL,
	"platform_list_price_id" text,
	"source" varchar(32) NOT NULL,
	"effective_from" date NOT NULL,
	"updated_by_staff_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_recharge_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"recharge_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"file_size" bigint NOT NULL,
	"storage_uri" varchar(1024) NOT NULL,
	"uploaded_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_recharge_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"recharge_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"action" varchar(16) NOT NULL,
	"operator_staff_id" text,
	"operator_name" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"changes" jsonb,
	"remark" text
);
--> statement-breakpoint
CREATE TABLE "merchant_recharge_record" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_node_id" text,
	"amount" numeric(15, 4) NOT NULL,
	"payment_method" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"transaction_id" varchar(128),
	"recharge_date" date NOT NULL,
	"remark" text,
	"bill_month" varchar(7),
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by_staff_id" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_recon_diff" (
	"id" text PRIMARY KEY NOT NULL,
	"statement_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"recon_date" date NOT NULL,
	"request_id" varchar(128),
	"diff_type" varchar(32) NOT NULL,
	"platform_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"resource_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"merchant_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"resource_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"resolution" varchar(32),
	"adjusted_ledger_id" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_recon_statement" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"period_type" varchar(8) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"platform_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"merchant_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"resource_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"diff_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"match_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"uncomparable_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"generated_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" text,
	"dispute_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_sales_price" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"sales_price" numeric(15, 4) NOT NULL,
	"purchase_price" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" varchar(32) NOT NULL,
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_site_message" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
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
CREATE TABLE "merchant_tenant_contribution" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"total_revenue" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"first_bill_date" date,
	"last_bill_date" date,
	"bill_days_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_condition_sheet" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"gpu_network_cpu_terms" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"agent_version" varchar(64) NOT NULL,
	"data_center_id" text,
	"hostname" varchar(255),
	"os_info" text,
	"status" varchar(32) DEFAULT 'online' NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"running_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_order" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_order_id" varchar(64),
	"order_no" varchar(128),
	"order_mark" varchar(16) NOT NULL,
	"tenant_id" text NOT NULL,
	"platform_tenant_id" varchar(128) NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text,
	"project_id" text,
	"data_center_id" text,
	"supplier_id" text,
	"idc_code" varchar(64),
	"idc_name" varchar(128),
	"status" varchar(32) NOT NULL,
	"pay_status" varchar(32) NOT NULL,
	"billing_unit" varchar(16) NOT NULL,
	"purchase_qty" integer,
	"purchase_qty_text" varchar(128),
	"device_count" integer DEFAULT 0 NOT NULL,
	"gpu_count" integer DEFAULT 0 NOT NULL,
	"order_amount" numeric(15, 4),
	"refund_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"final_amount" numeric(15, 4) NOT NULL,
	"balance_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"coupon_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rent_starts_at" timestamp with time zone,
	"rent_ends_at" timestamp with time zone,
	"import_batch_id" text,
	"source" varchar(32) DEFAULT 'platform_sync' NOT NULL,
	"platform_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"match_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remark" text,
	"workspace_id" text,
	"description" varchar(255),
	"payment_order_id" text,
	"deploy_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"organization_id" varchar(64),
	"ssh_enabled" boolean DEFAULT false NOT NULL,
	"ssh_public_key" text,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"next_billing_at" timestamp with time zone,
	"renew_count" integer DEFAULT 0 NOT NULL,
	"overdue_retries" integer DEFAULT 0 NOT NULL,
	"overdue_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_order_device" (
	"id" text PRIMARY KEY NOT NULL,
	"bare_metal_order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"allocation_status" varchar(32) DEFAULT 'planned' NOT NULL,
	"gpu_card_type_id" text,
	"device_model_text" varchar(128),
	"gpu_count" integer DEFAULT 0 NOT NULL,
	"platform_device_id" varchar(128),
	"supplier_device_id" text,
	"device_status" varchar(32),
	"sn" varchar(64),
	"asset_no" varchar(64),
	"external_ip" varchar(45),
	"internal_ip" varchar(45),
	"line_amount" numeric(15, 4),
	"duration_hours" numeric(15, 4),
	"unit_price_per_card_hour" numeric(15, 4),
	"rent_starts_at" timestamp with time zone,
	"rent_ends_at" timestamp with time zone,
	"linked_at" timestamp with time zone,
	"platform_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"match_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_order_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"bare_metal_order_id" text,
	"file_name" varchar(255) NOT NULL,
	"file_uri" varchar(1024),
	"file_hash" varchar(64),
	"row_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_order_log" (
	"id" text PRIMARY KEY NOT NULL,
	"bare_metal_order_id" text NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"previous_status" varchar(32),
	"new_status" varchar(32),
	"description" text,
	"detail" jsonb,
	"operator_id" varchar(64),
	"operator_source" varchar(16) DEFAULT 'user' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_order_price_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"bare_metal_order_id" text NOT NULL,
	"unit_price_per_card_hour" numeric(15, 4) NOT NULL,
	"gpu_count" integer NOT NULL,
	"order_amount" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"price_source" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_sync_job_item" (
	"id" text PRIMARY KEY NOT NULL,
	"job_run_id" text NOT NULL,
	"platform_tenant_id" varchar(128) NOT NULL,
	"tenant_id" text,
	"phase" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"platform_order_id" varchar(64),
	"order_no" varchar(128),
	"error_code" varchar(32),
	"resolved_at" timestamp with time zone,
	"resolved_by_staff_id" text,
	"platform_payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bare_metal_sync_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(16) NOT NULL,
	"orders_fetched_count" integer DEFAULT 0 NOT NULL,
	"unknown_tenant_count" integer DEFAULT 0 NOT NULL,
	"tenants_auto_imported_count" integer DEFAULT 0 NOT NULL,
	"billing_sync_tenant_count" integer DEFAULT 0 NOT NULL,
	"order_upserted_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "bare_metal_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"order_sync_cursor_end_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compute_node" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_device_id" text NOT NULL,
	"node_role" varchar(32) NOT NULL,
	"mgmt_ip" varchar(45),
	"cluster_name" varchar(128),
	"node_name" varchar(128),
	"expected_service" varchar(255),
	"cluster_id" varchar(64),
	"lifecycle_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_center" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(128),
	"region_tags" text[] DEFAULT '{}' NOT NULL,
	"address" text,
	"status" varchar(32) NOT NULL,
	"cooperation_status" varchar(32) DEFAULT 'active' NOT NULL,
	"network_fee_monthly" numeric(15, 4) DEFAULT '0' NOT NULL,
	"mgmt_node_fee_monthly" numeric(15, 4) DEFAULT '0' NOT NULL,
	"external_onboarding_id" varchar(64),
	"platform_tenant_id" varchar(32),
	"container_instance_region" varchar(128),
	"bare_metal_region" varchar(128),
	"description" text,
	"scale" varchar(64),
	"public_ip_count" integer,
	"internal_network_cidr" varchar(64),
	"audit_status" varchar(32),
	"audit_remark" text,
	"source_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_onboarding_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"policy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_onboarding_policy_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"device_overrides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_by" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_onboarding_task" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_device_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"agent_id" text,
	"policy_json" jsonb NOT NULL,
	"stage" varchar(32) DEFAULT 'pending' NOT NULL,
	"stage_status" varchar(16) DEFAULT 'waiting' NOT NULL,
	"stage_started_at" timestamp with time zone,
	"stage_completed_at" timestamp with time zone,
	"stage_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"node_name" varchar(255),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_platform_orphan_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_code" varchar(64) NOT NULL,
	"snapshot_hour" timestamp with time zone NOT NULL,
	"source_job_run_id" text,
	"status" varchar(16) NOT NULL,
	"rule_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview_rows_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"committed_device_count" integer DEFAULT 0 NOT NULL,
	"operator_staff_id" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_platform_orphan_import_link" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"probe_snapshot_id" text NOT NULL,
	"supplier_device_id" text NOT NULL,
	"matched_rule_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_platform_orphan_import_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"supplier_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"match_field" varchar(32) NOT NULL,
	"match_operator" varchar(32) NOT NULL,
	"match_value" varchar(255) NOT NULL,
	"presence_channel" varchar(16) DEFAULT 'any' NOT NULL,
	"target_data_center_id" text NOT NULL,
	"default_fields_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_gpu_match_from_k8s" boolean DEFAULT false NOT NULL,
	"remark" text,
	"created_by_staff_id" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_platform_probe_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(16) NOT NULL,
	"snapshot_hour" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" varchar(16) NOT NULL,
	"inventory_device_count" integer DEFAULT 0 NOT NULL,
	"proxy_fetched_count" integer DEFAULT 0 NOT NULL,
	"k8s_fetched_count" integer DEFAULT 0 NOT NULL,
	"bare_metal_hit_count" integer DEFAULT 0 NOT NULL,
	"matched_proxy_count" integer DEFAULT 0 NOT NULL,
	"matched_k8s_count" integer DEFAULT 0 NOT NULL,
	"matched_bare_metal_count" integer DEFAULT 0 NOT NULL,
	"ambiguous_count" integer DEFAULT 0 NOT NULL,
	"missing_platform_count" integer DEFAULT 0 NOT NULL,
	"orphan_count" integer DEFAULT 0 NOT NULL,
	"missing_crm_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "device_platform_probe_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"job_run_id" text NOT NULL,
	"record_kind" varchar(16) DEFAULT 'crm_inventory' NOT NULL,
	"supplier_device_id" text,
	"supplier_id" text,
	"data_center_id" text,
	"sn" varchar(64) NOT NULL,
	"internal_ip" varchar(45),
	"data_center_name" varchar(255),
	"ops_status" varchar(64),
	"lifecycle_status" varchar(32),
	"snapshot_hour" timestamp with time zone NOT NULL,
	"probe_status" varchar(32) NOT NULL,
	"consistency_flag" varchar(32) NOT NULL,
	"presence_crm" boolean DEFAULT false NOT NULL,
	"presence_proxy" boolean DEFAULT false NOT NULL,
	"presence_k8s" boolean DEFAULT false NOT NULL,
	"presence_bare_metal" boolean DEFAULT false NOT NULL,
	"orphan_merge_key" varchar(128),
	"proxy_matched" boolean DEFAULT false NOT NULL,
	"proxy_rent_status" varchar(64),
	"proxy_is_container_instance" boolean,
	"proxy_platform_device_id" varchar(64),
	"k8s_matched" boolean DEFAULT false NOT NULL,
	"k8s_device_name" varchar(255),
	"k8s_region" varchar(128),
	"bare_metal_matched" boolean DEFAULT false NOT NULL,
	"bare_metal_order_no" varchar(64),
	"bare_metal_order_status" varchar(32),
	"suggested_action" text,
	"consistency_reason" text,
	"match_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proxy_payload" jsonb,
	"k8s_payload" jsonb,
	"bare_metal_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_platform_probe_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_snapshot_hour" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_state_transition_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" text NOT NULL,
	"from_state" varchar(64) NOT NULL,
	"to_state" varchar(64) NOT NULL,
	"operator_staff_id" text,
	"reason_code" varchar(64),
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "fault_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_ops_upload_batch_id" text,
	"supplier_device_id" text,
	"compute_node_id" text,
	"fault_type" varchar(64) NOT NULL,
	"severity" varchar(8) DEFAULT 'P3' NOT NULL,
	"incident_status" varchar(32) NOT NULL,
	"impact_minutes" integer,
	"impact_scope" varchar(255),
	"affected_device_count" integer,
	"postmortem" text,
	"resolution_outcome" text,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_node" (
	"id" text PRIMARY KEY NOT NULL,
	"data_center_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"internal_ip" varchar(64) NOT NULL,
	"external_ip" varchar(64),
	"ssh_port" integer DEFAULT 22 NOT NULL,
	"ssh_username" varchar(64) NOT NULL,
	"ssh_password_encrypted" text,
	"os_type" varchar(128),
	"cpu_cores" integer,
	"memory_gb" integer,
	"disk_gb" integer,
	"vlan_id" varchar(16),
	"gateway" varchar(64) NOT NULL,
	"subnet_mask" varchar(64) NOT NULL,
	"dns_servers" text[],
	"public_gateway" varchar(64),
	"firewall_rules" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"health_status" varchar(32) DEFAULT 'unknown' NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"last_health_check_result" jsonb,
	"audit_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"audited_by" text,
	"audited_at" timestamp with time zone,
	"audit_remark" text,
	"capabilities" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_card_type" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"code" varchar(64) NOT NULL,
	"manufacturer" varchar(32) NOT NULL,
	"memory_gb" integer,
	"tdp_watts" integer,
	"compute_capability" varchar(64),
	"device_role" varchar(16) DEFAULT 'compute' NOT NULL,
	"status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gpu_card_type_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "internal_test_hold" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"data_center_id" text,
	"work_order_no" varchar(64),
	"user_name" varchar(128),
	"department" varchar(32),
	"settlement_mode" varchar(32),
	"gpu_card_type_id" text,
	"unit_count" integer,
	"remark" text,
	"supplier_device_id" text,
	"supplier_gpu_inventory_id" text,
	"scope" varchar(255) DEFAULT 'planned' NOT NULL,
	"hold_from" timestamp with time zone NOT NULL,
	"hold_until" timestamp with time zone,
	"onboarding_batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_test_hold_device_link" (
	"id" text PRIMARY KEY NOT NULL,
	"hold_id" text NOT NULL,
	"supplier_device_id" text NOT NULL,
	"port" varchar(16) DEFAULT '22' NOT NULL,
	"login_username" varchar(128) NOT NULL,
	"login_password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_state_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" varchar(32) NOT NULL,
	"state_code" varchar(64) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"sort_order" integer NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "onboarding_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_kind" varchar(32) NOT NULL,
	"supplier_id" text NOT NULL,
	"supplier_code" varchar(64) NOT NULL,
	"supplier_name" varchar(255) NOT NULL,
	"supplier_short_name" varchar(64),
	"data_center_id" text NOT NULL,
	"idc_code" varchar(64) NOT NULL,
	"data_center_name" varchar(255) NOT NULL,
	"idc_region" varchar(64),
	"contract_id" text,
	"access_condition_sheet_id" text,
	"batch_code" varchar(64) NOT NULL,
	"batch_status" varchar(32) NOT NULL,
	"planned_ready_at" timestamp with time zone,
	"planned_lines_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planned_device_count" integer DEFAULT 0 NOT NULL,
	"planned_gpu_count" integer DEFAULT 0 NOT NULL,
	"list_upload_mode" varchar(32) DEFAULT 'none' NOT NULL,
	"work_order_no" varchar(64),
	"touched_device_count" integer DEFAULT 0 NOT NULL,
	"online_device_count" integer DEFAULT 0 NOT NULL,
	"progress_synced_at" timestamp with time zone,
	"online_reason" varchar(64),
	"order_no" varchar(128),
	"remark" text,
	"parent_batch_id" text,
	"access_method" varchar(32) NOT NULL,
	"import_file_name" varchar(255),
	"import_file_uri" varchar(1024),
	"import_file_mime_type" varchar(128),
	"import_file_size_bytes" bigint,
	"import_status" varchar(32) DEFAULT 'draft' NOT NULL,
	"parse_error" text,
	"parsed_row_count" integer DEFAULT 0 NOT NULL,
	"parsed_success_count" integer DEFAULT 0 NOT NULL,
	"parsed_rows_json" jsonb,
	"parsed_at" timestamp with time zone,
	"committed_device_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"retire_reason" varchar(64),
	"retire_action_type" varchar(32),
	"retire_plan_mode" varchar(32),
	"expected_completion_date" date,
	"retire_remark" text,
	"retired_device_count" integer DEFAULT 0 NOT NULL,
	"progress_flags_json" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_batch_device_link" (
	"id" text PRIMARY KEY NOT NULL,
	"business_onboarding_batch_id" text NOT NULL,
	"supplier_device_id" text NOT NULL,
	"link_kind" varchar(32) DEFAULT 'touched' NOT NULL,
	"source_change_log_id" text,
	"source_changelog_batch_id" text,
	"gpu_card_type_id" text NOT NULL,
	"cooperation_type" varchar(32) NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_batch_import_row" (
	"id" text PRIMARY KEY NOT NULL,
	"onboarding_batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"public_ip" varchar(45) NOT NULL,
	"private_ip" varchar(45) NOT NULL,
	"root_account" varchar(128) NOT NULL,
	"root_password_enc" text NOT NULL,
	"sn" varchar(64),
	"asset_no" varchar(64),
	"gpu_count" integer,
	"gpu_card_type_id" text,
	"parse_status" varchar(32) NOT NULL,
	"parse_message" text,
	"supplier_device_id" text
);
--> statement-breakpoint
CREATE TABLE "onboarding_batch_plan_line" (
	"id" text PRIMARY KEY NOT NULL,
	"onboarding_batch_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"cooperation_type" varchar(32) NOT NULL,
	"planned_quantity" integer NOT NULL,
	"touched_quantity" integer DEFAULT 0 NOT NULL,
	"online_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_batch_progress_event" (
	"id" text PRIMARY KEY NOT NULL,
	"onboarding_batch_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"batch_kind" varchar(32) NOT NULL,
	"batch_status" varchar(32) NOT NULL,
	"planned_device_count" integer NOT NULL,
	"planned_gpu_count" integer NOT NULL,
	"touched_device_count" integer NOT NULL,
	"touched_pipeline_gpu" integer NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text,
	"idc_region" varchar(64),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_task" (
	"id" text PRIMARY KEY NOT NULL,
	"onboarding_batch_id" text NOT NULL,
	"supplier_device_id" text,
	"task_type" varchar(64) NOT NULL,
	"assignee_staff_id" text NOT NULL,
	"task_status" varchar(32) NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_pool_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_device_id" text NOT NULL,
	"resource_pool_id" varchar(128),
	"pool_code" varchar(64),
	"workload_profile" varchar(32) NOT NULL,
	"is_exclusive_pool" boolean DEFAULT false NOT NULL,
	"bound_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"external_tenant_id" text NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"short_name" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"default_cooperation_mode" varchar(32),
	"default_revenue_share_percent" numeric(7, 4),
	"business_manager_staff_id" text,
	"contact_person" varchar(128),
	"contact_phone" varchar(32),
	"contact_email" varchar(255),
	"address" text,
	"bank_name" varchar(255),
	"source" varchar(64) DEFAULT 'import' NOT NULL,
	"bank_account" varchar(64),
	"external_onboarding_id" varchar(64),
	"platform_tenant_id" varchar(32),
	"onboarding_type" varchar(16),
	"identity_no" varchar(32),
	"business_scope" text,
	"business_license_uri" varchar(1024),
	"id_card_front_uri" varchar(1024),
	"id_card_back_uri" varchar(1024),
	"bank_branch_name" varchar(255),
	"bank_branch_address" text,
	"admin_phone" varchar(32),
	"admin_email" varchar(255),
	"device_info_raw" text,
	"audit_status" varchar(32),
	"audit_confirmed" boolean DEFAULT false NOT NULL,
	"audit_remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"author_staff_id" text,
	"author_name" varchar(128),
	"author_role" varchar(32),
	"ref_domain" varchar(64),
	"ref_id" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_activity_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint,
	"mime_type" varchar(128),
	"storage_uri" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_activity_type_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"type_code" varchar(64) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"category" varchar(32),
	"sort_order" integer
);
--> statement-breakpoint
CREATE TABLE "supplier_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(64) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"scopes" varchar(256) NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bill" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"bill_month" varchar(7) NOT NULL,
	"cooperation_mode" varchar(32) NOT NULL,
	"pricing_mode" varchar(32) DEFAULT 'card_time' NOT NULL,
	"status" varchar(32) NOT NULL,
	"total_usage_hours" numeric(15, 4) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"network_fee" numeric(15, 4) NOT NULL,
	"management_fee" numeric(15, 4) NOT NULL,
	"storage_fee" numeric(15, 4) DEFAULT '0' NOT NULL,
	"final_amount" numeric(15, 4) NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" text,
	"confirmed_by_source" varchar(16),
	"payment_reference" varchar(128),
	"paid_by" text,
	"adjustment_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"adjustment_reason" varchar(255),
	"supplier_revenue_share_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supplier_card_time_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supplier_whole_rent_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"voucher_cost_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"gross_profit" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"usage_date" date NOT NULL,
	"usage_month" varchar(7) NOT NULL,
	"cooperation_mode" varchar(32) NOT NULL,
	"total_usage_hours" numeric(15, 4) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"network_fee_daily" numeric(15, 4) DEFAULT '0' NOT NULL,
	"mgmt_fee_daily" numeric(15, 4) DEFAULT '0' NOT NULL,
	"storage_fee_daily" numeric(15, 4) DEFAULT '0' NOT NULL,
	"online_device_count" integer DEFAULT 0 NOT NULL,
	"rented_gpu_count" integer DEFAULT 0 NOT NULL,
	"idle_gpu_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_daily_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"daily_bill_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"device_id" text,
	"contract_id" text,
	"usage_hours" numeric(15, 4) NOT NULL,
	"unit_cost" numeric(15, 4) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"tenant_consumption" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_detail" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"pricing_mode" varchar(32) DEFAULT 'card_time' NOT NULL,
	"usage_hours" numeric(15, 4) NOT NULL,
	"unit_cost" numeric(15, 4) NOT NULL,
	"amount" numeric(15, 4) NOT NULL,
	"tenant_consumption" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE "supplier_card_list_price" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"list_price_per_hour" numeric(15, 4) NOT NULL,
	"currency" varchar(8) DEFAULT 'CNY' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" varchar(64),
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"contract_no" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"pricing_mode" varchar(32) NOT NULL,
	"tier_basis" varchar(32),
	"cooperation_mode" varchar(32) NOT NULL,
	"unit_price_per_hour" numeric(15, 4),
	"revenue_share_percent" numeric(7, 4),
	"list_price_per_hour" numeric(15, 4),
	"deal_to_list_ratio" numeric(9, 6),
	"min_commit_hours" numeric(15, 4),
	"settlement_cycle" varchar(32),
	"start_date" date NOT NULL,
	"end_date" date,
	"terms" text,
	"signed_at" timestamp with time zone,
	"signer_name" varchar(128),
	"contract_file_uri" varchar(1024),
	"supplier_confirmation_status" varchar(32) DEFAULT 'none' NOT NULL,
	"confirmed_by_supplier_org_id" text,
	"confirmed_at" timestamp with time zone,
	"rejection_reason" text,
	"modification_note" text,
	"expected_listing_time" date,
	"penalty_terms" text,
	"monthly_rent_price" numeric(15, 4),
	"infra_pricing" jsonb,
	"site_node_count" integer,
	"site_node_tier" varchar(16),
	"product_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"public_ip_count" integer,
	"supplier_provides_cpu_hosts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contract_capacity_line" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"cooperation_type" varchar(32) DEFAULT 'idle_time' NOT NULL,
	"device_quantity" integer NOT NULL,
	"gpu_quantity" integer NOT NULL,
	"gpu_count_per_device" integer,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"line_status" varchar(32) DEFAULT 'active' NOT NULL,
	"bitable_record_id" varchar(128),
	"remark" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_datacenter_card_type_spec" (
	"id" text PRIMARY KEY NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"device_spec" text,
	"remark" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_datacenter_infrastructure" (
	"id" text PRIMARY KEY NOT NULL,
	"data_center_id" text NOT NULL,
	"bandwidth_config" jsonb,
	"network_config" jsonb,
	"storage_config" jsonb,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_device" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"contract_id" text,
	"onboarding_batch_id" text,
	"data_center_id" text,
	"gpu_card_type_id" text NOT NULL,
	"external_device_id" varchar(128),
	"asset_no" varchar(64),
	"sn" varchar(64) NOT NULL,
	"idc_code" varchar(64) NOT NULL,
	"idc_region" varchar(64),
	"gpu_count" integer NOT NULL,
	"external_ip" varchar(45),
	"internal_ip" varchar(45),
	"ops_status" varchar(64) DEFAULT '预留闲置中' NOT NULL,
	"lifecycle_status" varchar(32) NOT NULL,
	"in_maintenance" boolean DEFAULT false NOT NULL,
	"listing_disabled" boolean DEFAULT false NOT NULL,
	"onboarding_substage" varchar(64),
	"bandwidth_group" varchar(64),
	"rate_limit" varchar(64),
	"cooperation_type" varchar(32) DEFAULT 'idle_time' NOT NULL,
	"device_spec" text,
	"device_purpose" varchar(255),
	"received_at" timestamp with time zone,
	"remark" text,
	"login_username" varchar(128),
	"login_password" text,
	"platform_resource_id" varchar(128),
	"review_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"review_remark" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"device_role" varchar(16) DEFAULT 'compute' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_device_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_device_id" text NOT NULL,
	"onboarding_batch_id" text NOT NULL,
	"business_onboarding_batch_id" text,
	"internal_ip" varchar(45),
	"external_device_id" varchar(64),
	"occurred_at" timestamp with time zone NOT NULL,
	"change_action" varchar(64) NOT NULL,
	"change_content" text,
	"description" text,
	"ticket_no" varchar(64),
	"attachment_names" text,
	"import_row_no" integer,
	"previous_ops_status" varchar(64),
	"new_ops_status" varchar(64),
	"previous_lifecycle_status" varchar(32),
	"new_lifecycle_status" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_gpu_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"online_quantity" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) NOT NULL,
	"is_internal_test" boolean DEFAULT false NOT NULL,
	"internal_test_scope" varchar(255),
	"internal_test_until" timestamp with time zone,
	"card_time_cost_per_hour" numeric(15, 4),
	"revenue_share_cost_per_hour" numeric(15, 4),
	"last_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" varchar(16) NOT NULL,
	"event" varchar(32) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_ops_engineer" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"wechat_id" varchar(128),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_ops_upload_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(32) NOT NULL,
	"supplier_id" text NOT NULL,
	"idc_code" varchar(64) NOT NULL,
	"access_method" varchar(32),
	"file_name" varchar(255) NOT NULL,
	"rows_json" jsonb NOT NULL,
	"status" varchar(32) NOT NULL,
	"import_status" varchar(32) DEFAULT 'uploaded' NOT NULL,
	"parse_error" text,
	"parsed_row_count" integer DEFAULT 0 NOT NULL,
	"parsed_success_count" integer DEFAULT 0 NOT NULL,
	"committed_incident_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"onboarding_batch_id" text,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_pricing_history" (
	"id" text PRIMARY KEY NOT NULL,
	"pricing_record_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"pricing_mode" varchar(32) NOT NULL,
	"previous_list_price_per_hour" numeric(15, 4),
	"new_list_price_per_hour" numeric(15, 4),
	"previous_unit_price_per_hour" numeric(15, 4),
	"new_unit_price_per_hour" numeric(15, 4),
	"previous_billing_unit" varchar(16),
	"new_billing_unit" varchar(16),
	"previous_unit_price" numeric(15, 4),
	"new_unit_price" numeric(15, 4),
	"previous_cards_per_machine" integer,
	"new_cards_per_machine" integer,
	"previous_deal_to_list_ratio" numeric(9, 6),
	"new_deal_to_list_ratio" numeric(9, 6),
	"previous_revenue_share_percent" numeric(7, 4),
	"new_revenue_share_percent" numeric(7, 4),
	"changed_at" timestamp with time zone NOT NULL,
	"changed_by_staff_id" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "supplier_pricing_record" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"supplier_unit_cost_id" text,
	"supplier_card_list_price_id" text,
	"pricing_mode" varchar(32) NOT NULL,
	"config_status" varchar(32) DEFAULT 'active' NOT NULL,
	"list_price_per_hour" numeric(15, 4),
	"unit_price_per_hour" numeric(15, 4),
	"billing_unit" varchar(16) DEFAULT 'hour' NOT NULL,
	"unit_price" numeric(15, 4),
	"cards_per_machine" integer DEFAULT 8,
	"deal_to_list_ratio" numeric(9, 6),
	"revenue_share_percent" numeric(7, 4),
	"pricing_tiers" jsonb,
	"effective_from" timestamp(0) NOT NULL,
	"effective_to" timestamp(0),
	"updated_by_staff_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_pricing_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"supplier_card_list_price_id" text,
	"tier_order" integer NOT NULL,
	"list_price_multiplier" numeric(9, 6),
	"deal_to_list_ratio_min" numeric(9, 6),
	"deal_to_list_ratio_max" numeric(9, 6),
	"deal_unit_price_per_hour" numeric(15, 4),
	"revenue_share_percent" numeric(7, 4),
	"remark" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "supplier_site_message" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_org_id" text NOT NULL,
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
CREATE TABLE "supplier_terms_version" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text,
	"contract_id" text,
	"deal_mode" varchar(64) NOT NULL,
	"terms_json" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_unit_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_terms_version_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"supplier_card_list_price_id" text NOT NULL,
	"list_price_per_hour" numeric(15, 4) NOT NULL,
	"deal_unit_price_per_hour" numeric(15, 4),
	"deal_to_list_ratio" numeric(9, 6),
	"unit_cost" numeric(15, 4),
	"revenue_share_percent" numeric(7, 4),
	"tier_json" jsonb,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead" (
	"id" text PRIMARY KEY NOT NULL,
	"type" varchar(16) NOT NULL,
	"code" varchar(64),
	"name" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"description" text,
	"source" varchar(128),
	"province" varchar(64),
	"city" varchar(64),
	"address" text,
	"supplier_name_text" varchar(255),
	"linked_supplier_id" text,
	"parent_supplier_lead_id" text,
	"docking_scope" varchar(32),
	"estimated_online_date" date,
	"owner_staff_id" text,
	"converted_supplier_id" text,
	"converted_data_center_id" text,
	"converted_at" timestamp with time zone,
	"converted_by" text,
	"lost_reason" text,
	"lost_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"author_staff_id" text,
	"author_name" varchar(128),
	"author_role" varchar(32),
	"metadata" jsonb,
	"ref_domain" varchar(64),
	"ref_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_activity_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint,
	"mime_type" varchar(128),
	"storage_uri" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"contact_role" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"title" varchar(64),
	"phone" varchar(32),
	"email" varchar(255),
	"wechat_id" varchar(128),
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_gpu_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"gpu_card_type_id" text,
	"card_type_name" varchar(128) NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"idle_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"in_use_quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_per_hour" numeric(15, 4),
	"available_time" varchar(255),
	"notes" text,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"source" varchar(32) NOT NULL,
	"file_name" varchar(512),
	"bitable_config_id" text,
	"status" varchar(32) NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"preview_json" jsonb,
	"operator_staff_id" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_import_batch_item" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"lead_id" text,
	"group_key" varchar(255),
	"row_nos" integer[],
	"action" varchar(32) NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_tag_assignment" (
	"lead_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_chain_lead_tag_assignment_lead_id_tag_id_pk" PRIMARY KEY("lead_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "feishu_external_link" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" varchar(64) NOT NULL,
	"ref_id" text NOT NULL,
	"external_type" varchar(64) NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"external_code" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"app_secret_enc" text NOT NULL,
	"encrypt_key" varchar(255),
	"verification_token" varchar(255),
	"webhook_secret" varchar(128),
	"default_approval_codes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhook_policy_json" jsonb DEFAULT '{"auto_complete_on_approval":true,"auto_create_enabled":true}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_integration_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job_kind" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"supplier_id" text,
	"ref_domain" varchar(64),
	"ref_id" text,
	"request_summary" jsonb,
	"response_summary" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feishu_webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" varchar(256) NOT NULL,
	"instance_id" varchar(128),
	"event_type" varchar(64),
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feishu_work_order_bitable_config" (
	"id" text PRIMARY KEY NOT NULL,
	"app_token" varchar(128) DEFAULT '' NOT NULL,
	"table_id" varchar(128) DEFAULT '' NOT NULL,
	"view_id" varchar(128),
	"work_order_backend" varchar(16) DEFAULT 'bitable' NOT NULL,
	"field_mapping_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"defaults_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_mapping_json" jsonb DEFAULT '{"待审核":"pending_review","待分配":"pending_assign","处理中":"in_progress","已结束":"completed","已终止":"cancelled"}'::jsonb NOT NULL,
	"inbound_channel" varchar(32) DEFAULT 'bitable_automation' NOT NULL,
	"automation_webhook_secret" varchar(128),
	"automation_token" varchar(255),
	"inbound_policy_json" jsonb DEFAULT '{"timeline_on_every_sync":true,"timeline_on_terminal_only":false,"auto_sync_in_progress_status":true,"dedupe_window_seconds":60}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_lead_bitable_sync_config" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"app_token" varchar(128) NOT NULL,
	"table_id" varchar(128) NOT NULL,
	"view_id" varchar(128),
	"field_mapping_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filter_formula" text,
	"group_key_field" varchar(64) DEFAULT 'idc_name' NOT NULL,
	"merge_key_field" varchar(64) DEFAULT 'name' NOT NULL,
	"gpu_snapshot_merge_mode" varchar(32) DEFAULT 'replace_all' NOT NULL,
	"cron_expr" varchar(64) DEFAULT '30 * * * *' NOT NULL,
	"auto_commit" boolean DEFAULT false NOT NULL,
	"cursor_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_availability_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_device_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"pool" varchar(16) NOT NULL,
	"pool_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allocated_to" varchar(64),
	"allocated_gpu_count" integer DEFAULT 0,
	"allocatable_gpu_count" integer NOT NULL,
	"current_priority_class" varchar(32) DEFAULT 'od-normal' NOT NULL,
	"current_weight" integer DEFAULT 50 NOT NULL,
	"preemptible" boolean DEFAULT false NOT NULL,
	"preempt_notice_seconds" integer DEFAULT 120,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_scheduling_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"tenant_tier" text[],
	"product_line" text[],
	"billing_mode" text[],
	"task_category" text[],
	"match_extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"scope" varchar(16) DEFAULT 'global' NOT NULL,
	"scope_id" text,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_rule_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"changed_by" text NOT NULL,
	"change_type" varchar(16) NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_bare_metal_order" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"customer_full_name" varchar(255) NOT NULL,
	"contract_no" varchar(128),
	"tenant_id" text,
	"order_status" varchar(32) DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"expected_delivery_at" timestamp with time zone,
	"remark" text,
	"total_device_count" integer DEFAULT 0 NOT NULL,
	"total_gpu_count" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"total_sla_compensation" numeric(15, 4) DEFAULT '0' NOT NULL,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_bare_metal_order_supply_line" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"cooperation_type" varchar(32) DEFAULT 'idle_time' NOT NULL,
	"device_count" integer NOT NULL,
	"gpu_count" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"accessory_fee" numeric(15, 4) DEFAULT '0' NOT NULL,
	"sla_compensation_amount" numeric(15, 4) DEFAULT '0' NOT NULL,
	"line_cost" numeric(15, 4) DEFAULT '0' NOT NULL,
	"capacity_line_id" text,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_bitable_sync_config" (
	"id" text PRIMARY KEY NOT NULL,
	"sync_kind" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"app_token" varchar(128) NOT NULL,
	"table_id" varchar(128) NOT NULL,
	"view_id" varchar(128),
	"field_mapping_json" jsonb NOT NULL,
	"filter_formula" text,
	"cron_expr" varchar(64) DEFAULT '30 * * * *' NOT NULL,
	"auto_commit" boolean DEFAULT false NOT NULL,
	"cursor_record_id" varchar(128),
	"cursor_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_datacenter_card_type_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"supplier_id" text,
	"contract_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_machine_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_card_hours" numeric(15, 4) NOT NULL,
	"new_fault_count" integer NOT NULL,
	"carryover_fault_count_end" integer NOT NULL,
	"closed_fault_count" integer NOT NULL,
	"new_fault_device_count" integer NOT NULL,
	"carryover_fault_device_count_end" integer NOT NULL,
	"external_fault_card_hours" numeric(15, 4) NOT NULL,
	"internal_fault_card_hours" numeric(15, 4) NOT NULL,
	"actual_usage_card_hours" numeric(15, 4) NOT NULL,
	"idle_card_hours" numeric(15, 4) NOT NULL,
	"idle_rate_avg" numeric(8, 6),
	"waste_card_hours" numeric(15, 4) NOT NULL,
	"waste_rate_avg" numeric(8, 6),
	"internal_usage_card_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_event_count" integer NOT NULL,
	"platform_offline_incident_count" integer NOT NULL,
	"platform_online_incident_count" integer NOT NULL,
	"compensation_amount_total" numeric(15, 4) NOT NULL,
	"exempt_incident_count" integer NOT NULL,
	"availability_rate" numeric(8, 6),
	"fault_sla_rate" numeric(8, 6),
	"sla_met" boolean,
	"rollup_status" varchar(32) NOT NULL,
	"rollup_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_datacenter_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"data_center_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"supplier_id" text,
	"contract_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_machine_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_card_hours" numeric(15, 4) NOT NULL,
	"new_fault_count" integer NOT NULL,
	"carryover_fault_count_end" integer NOT NULL,
	"closed_fault_count" integer NOT NULL,
	"new_fault_device_count" integer NOT NULL,
	"carryover_fault_device_count_end" integer NOT NULL,
	"external_fault_card_hours" numeric(15, 4) NOT NULL,
	"internal_fault_card_hours" numeric(15, 4) NOT NULL,
	"actual_usage_card_hours" numeric(15, 4) NOT NULL,
	"idle_card_hours" numeric(15, 4) NOT NULL,
	"idle_rate_avg" numeric(8, 6),
	"waste_card_hours" numeric(15, 4) NOT NULL,
	"waste_rate_avg" numeric(8, 6),
	"internal_usage_card_hours" numeric(15, 4) NOT NULL,
	"onboarding_loss_event_count" integer NOT NULL,
	"platform_offline_incident_count" integer NOT NULL,
	"platform_online_incident_count" integer NOT NULL,
	"compensation_amount_total" numeric(15, 4) NOT NULL,
	"exempt_incident_count" integer NOT NULL,
	"availability_rate" numeric(8, 6),
	"fault_sla_rate" numeric(8, 6),
	"sla_met" boolean,
	"rollup_status" varchar(32) NOT NULL,
	"rollup_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_device_monthly" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"active_days" integer DEFAULT 0 NOT NULL,
	"external_fault_machine_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"internal_fault_machine_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"external_fault_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"internal_fault_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supply_machine_hours" numeric(15, 4) NOT NULL,
	"supply_card_hours" numeric(15, 4) NOT NULL,
	"device_sla_rate" numeric(8, 6),
	"sla_met" boolean,
	"rollup_status" varchar(32) NOT NULL,
	"rollup_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_fault_card_hours_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"impact_side" varchar(16) NOT NULL,
	"import_batch_id" text,
	"fault_machine_hours" numeric(15, 4) NOT NULL,
	"fault_card_hours" numeric(15, 4) NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_fault_count_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"new_fault_count" integer DEFAULT 0 NOT NULL,
	"carryover_fault_count" integer DEFAULT 0 NOT NULL,
	"closed_fault_count" integer DEFAULT 0 NOT NULL,
	"resolved_fault_count" integer DEFAULT 0 NOT NULL,
	"new_fault_device_count" integer DEFAULT 0 NOT NULL,
	"carryover_fault_device_count" integer DEFAULT 0 NOT NULL,
	"closed_fault_device_count" integer DEFAULT 0 NOT NULL,
	"new_fault_by_category" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_fault_device_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"impact_side" varchar(16) NOT NULL,
	"fault_machine_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"fault_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supply_machine_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"supply_card_hours" numeric(15, 4) NOT NULL,
	"device_sla_rate" numeric(8, 6),
	"incident_count" integer DEFAULT 0 NOT NULL,
	"source_incident_device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rollup_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"source_system" varchar(32) NOT NULL,
	"dataset_kind" varchar(64) NOT NULL,
	"stat_date" date,
	"sla_month" varchar(7),
	"file_name" varchar(255),
	"file_uri" varchar(1024),
	"import_status" varchar(32) NOT NULL,
	"parse_error" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"committed_row_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"created_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_monthly_report_compensation" (
	"id" text PRIMARY KEY NOT NULL,
	"sla_month" varchar(7) NOT NULL,
	"data_center_id" text NOT NULL,
	"group_key" varchar(128) NOT NULL,
	"service_fee" numeric(15, 4),
	"compensation_tier" numeric(8, 6),
	"compensation_amount" numeric(15, 4),
	"compensation_note" text,
	"updated_by_staff_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_onboarding_loss" (
	"id" text PRIMARY KEY NOT NULL,
	"external_record_id" varchar(128) NOT NULL,
	"import_batch_id" text,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"device_count" integer NOT NULL,
	"gpu_count" integer NOT NULL,
	"ops_received_at" timestamp with time zone NOT NULL,
	"actual_shelved_at" timestamp with time zone NOT NULL,
	"loss_hours" numeric(15, 4) NOT NULL,
	"loss_card_hours" numeric(15, 4) NOT NULL,
	"supplier_device_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_ops_fault_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"list_kind" varchar(16) NOT NULL,
	"incident_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"snapshot_status" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_ops_fault_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"external_fault_id" varchar(128) NOT NULL,
	"import_batch_id" text,
	"supplier_id" text NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"scope_label" varchar(32),
	"discovered_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"incident_status" varchar(32) NOT NULL,
	"parent_external_fault_id" varchar(128),
	"parent_incident_id" text,
	"fault_category" varchar(32) NOT NULL,
	"fault_type" varchar(128) NOT NULL,
	"fault_operator" varchar(128),
	"remediation" text,
	"postmortem" text,
	"impact_minutes" integer,
	"affected_device_count" integer DEFAULT 0 NOT NULL,
	"affected_gpu_count" integer DEFAULT 0 NOT NULL,
	"affected_tenant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_order_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fault_card_hours" numeric(15, 4),
	"fault_machine_hours" numeric(15, 4),
	"impact_side" varchar(16) DEFAULT 'external' NOT NULL,
	"first_seen_date" date NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_ops_fault_incident_device" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"supplier_device_id" text,
	"device_sn" varchar(64) NOT NULL,
	"device_asset_no" varchar(64),
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"gpu_count" integer NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"device_incident_status" varchar(32) NOT NULL,
	"fault_type" varchar(128),
	"fault_category" varchar(32),
	"remediation" text,
	"impact_minutes" integer,
	"fault_machine_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"fault_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"impact_side" varchar(16) DEFAULT 'external' NOT NULL,
	"bare_metal_order_id" text,
	"bare_metal_order_device_id" text,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_platform_internal_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"external_record_id" varchar(128) NOT NULL,
	"bitable_record_id" varchar(128),
	"import_batch_id" text,
	"expected_at" timestamp with time zone,
	"actual_started_at" timestamp with time zone NOT NULL,
	"actual_returned_at" timestamp with time zone,
	"actual_shelved_at" timestamp with time zone,
	"department" varchar(128) NOT NULL,
	"user_name" varchar(128) NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"device_count" integer NOT NULL,
	"gpu_count" integer NOT NULL,
	"unit_price" numeric(15, 4) NOT NULL,
	"total_amount" numeric(15, 4) NOT NULL,
	"usage_card_hours" numeric(15, 4),
	"list_price_per_hour" numeric(15, 4),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_platform_offline_baremetal_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"external_incident_id" varchar(128) NOT NULL,
	"bitable_record_id" varchar(128),
	"import_batch_id" text,
	"offline_bare_metal_order_id" text,
	"offline_supply_line_id" text,
	"report_received_at" timestamp with time zone NOT NULL,
	"customer_full_name" varchar(255) NOT NULL,
	"contract_no" varchar(128),
	"fault_started_at" timestamp with time zone NOT NULL,
	"fault_ended_at" timestamp with time zone,
	"impact_minutes" integer NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"responsibility" varchar(32) NOT NULL,
	"fault_description" text,
	"remediation" text,
	"is_force_majeure_exempt" boolean DEFAULT false NOT NULL,
	"is_compensated" boolean DEFAULT false NOT NULL,
	"compensation_amount" numeric(15, 4),
	"compensation_work_order_id" varchar(128),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_platform_online_incident" (
	"id" text PRIMARY KEY NOT NULL,
	"external_incident_id" varchar(128) NOT NULL,
	"bitable_record_id" varchar(128),
	"import_batch_id" text,
	"report_received_at" timestamp with time zone NOT NULL,
	"tenant_platform_id" varchar(128) NOT NULL,
	"tenant_id" text,
	"fault_started_at" timestamp with time zone NOT NULL,
	"fault_ended_at" timestamp with time zone,
	"impact_minutes" integer NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"product_line" varchar(32) NOT NULL,
	"order_id" varchar(128),
	"bare_metal_order_id" text,
	"affected_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responsibility" varchar(32) NOT NULL,
	"fault_description" text,
	"remediation" text,
	"is_force_majeure_exempt" boolean DEFAULT false NOT NULL,
	"is_compensated" boolean DEFAULT false NOT NULL,
	"compensation_voucher_amount" numeric(15, 4),
	"compensation_work_order_id" varchar(128),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_supply_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"total_machine_hours" numeric(15, 4) NOT NULL,
	"total_card_hours" numeric(15, 4) NOT NULL,
	"contract_card_hours" numeric(15, 4),
	"onboarding_loss_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"contract_source" varchar(32),
	"online_device_count" integer,
	"online_gpu_count" integer,
	"source" varchar(32) DEFAULT 'ops_import' NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_utilization_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"service_deploy_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"bare_metal_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"actual_usage_card_hours" numeric(15, 4) NOT NULL,
	"total_supply_card_hours" numeric(15, 4) NOT NULL,
	"waste_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"internal_usage_card_hours" numeric(15, 4) DEFAULT '0' NOT NULL,
	"idle_card_hours" numeric(15, 4) NOT NULL,
	"idle_rate" numeric(8, 6),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_waste_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"stat_date" date NOT NULL,
	"data_center_id" text NOT NULL,
	"gpu_card_type_id" text NOT NULL,
	"sla_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"import_batch_id" text,
	"waste_machine_hours" numeric(15, 4) NOT NULL,
	"waste_card_hours" numeric(15, 4) NOT NULL,
	"waste_rate" numeric(8, 6),
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_merchant_org_id_organization_id_fk" FOREIGN KEY ("parent_merchant_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_codes" ADD CONSTRAINT "user_invitation_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_invitee_id_users_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitation_relations" ADD CONSTRAINT "user_invitation_relations_invitation_code_id_user_invitation_co" FOREIGN KEY ("invitation_code_id") REFERENCES "public"."user_invitation_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_message" ADD CONSTRAINT "user_site_message_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_task" ADD CONSTRAINT "api_task_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_task" ADD CONSTRAINT "api_task_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_template" ADD CONSTRAINT "application_template_reviewed_by_user_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_template" ADD CONSTRAINT "application_template_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_template_version" ADD CONSTRAINT "application_template_version_template_id_application_template_i" FOREIGN KEY ("template_id") REFERENCES "public"."application_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_image_version" ADD CONSTRAINT "base_image_version_base_image_id_base_image_id_fk" FOREIGN KEY ("base_image_id") REFERENCES "public"."base_image"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_vm_detail" ADD CONSTRAINT "cloud_vm_detail_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_base" ADD CONSTRAINT "compute_base_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_task_event" ADD CONSTRAINT "compute_task_event_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preload_node_task" ADD CONSTRAINT "preload_node_task_preload_task_id_preload_task_id_fk" FOREIGN KEY ("preload_task_id") REFERENCES "public"."preload_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preload_task" ADD CONSTRAINT "preload_task_registry_credential_id_registry_credential_id_fk" FOREIGN KEY ("registry_credential_id") REFERENCES "public"."registry_credential"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preload_task" ADD CONSTRAINT "preload_task_region_id_data_center_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serverless_detail" ADD CONSTRAINT "serverless_detail_compute_base_id_compute_base_id_fk" FOREIGN KEY ("compute_base_id") REFERENCES "public"."compute_base"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activity" ADD CONSTRAINT "account_activity_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activity" ADD CONSTRAINT "account_activity_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activity" ADD CONSTRAINT "account_activity_activity_type_id_activity_type_definition_id_f" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_type_definition"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_activity" ADD CONSTRAINT "account_activity_actor_user_id_user_staff_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_manager_assignment" ADD CONSTRAINT "account_manager_assignment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_manager_assignment" ADD CONSTRAINT "account_manager_assignment_user_staff_id_user_staff_id_fk" FOREIGN KEY ("user_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshot_job_item" ADD CONSTRAINT "balance_snapshot_job_item_job_run_id_balance_snapshot_job_run_i" FOREIGN KEY ("job_run_id") REFERENCES "public"."balance_snapshot_job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshot_job_item" ADD CONSTRAINT "balance_snapshot_job_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_sync_job_item" ADD CONSTRAINT "billing_sync_job_item_job_run_id_billing_sync_job_run_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."billing_sync_job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_sync_job_item" ADD CONSTRAINT "billing_sync_job_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_sync_job_item" ADD CONSTRAINT "billing_sync_job_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_task" ADD CONSTRAINT "compute_task_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_task" ADD CONSTRAINT "compute_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_record" ADD CONSTRAINT "consumption_record_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_record" ADD CONSTRAINT "consumption_record_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_record" ADD CONSTRAINT "consumption_record_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_usage_daily" ADD CONSTRAINT "consumption_usage_daily_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_usage_daily" ADD CONSTRAINT "consumption_usage_daily_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_snapshot" ADD CONSTRAINT "contract_snapshot_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_snapshot" ADD CONSTRAINT "contract_snapshot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_record" ADD CONSTRAINT "conversion_record_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_template_id_discount_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."discount_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_primary_tenant_id_tenant_id_fk" FOREIGN KEY ("primary_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_business_line_id_business_line_id_fk" FOREIGN KEY ("business_line_id") REFERENCES "public"."business_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_sales_manager_id_user_staff_id_fk" FOREIGN KEY ("sales_manager_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contact" ADD CONSTRAINT "customer_contact_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_comment" ADD CONSTRAINT "engagement_comment_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_comment" ADD CONSTRAINT "engagement_comment_account_activity_id_account_activity_id_fk" FOREIGN KEY ("account_activity_id") REFERENCES "public"."account_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_comment" ADD CONSTRAINT "engagement_comment_author_id_user_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_document" ADD CONSTRAINT "engagement_document_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_document" ADD CONSTRAINT "engagement_document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_document" ADD CONSTRAINT "engagement_document_uploaded_by_user_staff_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_assignee_id_user_staff_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_task" ADD CONSTRAINT "follow_up_task_source_account_activity_id_account_activity_id_f" FOREIGN KEY ("source_account_activity_id") REFERENCES "public"."account_activity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_milestone" ADD CONSTRAINT "lifecycle_milestone_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lifecycle_milestone" ADD CONSTRAINT "lifecycle_milestone_filled_by_user_staff_id_fk" FOREIGN KEY ("filled_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_evidence" ADD CONSTRAINT "milestone_evidence_lifecycle_milestone_id_lifecycle_milestone_i" FOREIGN KEY ("lifecycle_milestone_id") REFERENCES "public"."lifecycle_milestone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_evidence" ADD CONSTRAINT "milestone_evidence_uploaded_by_user_staff_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tenant_blacklist" ADD CONSTRAINT "platform_tenant_blacklist_local_tenant_id_tenant_id_fk" FOREIGN KEY ("local_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_author_staff_id_user_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity_attachment" ADD CONSTRAINT "project_activity_attachment_activity_id_project_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_conversion_setting" ADD CONSTRAINT "project_conversion_setting_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_conversion_setting" ADD CONSTRAINT "project_conversion_setting_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_source_assignment" ADD CONSTRAINT "project_opportunity_source_assignment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_opportunity_source_assignment" ADD CONSTRAINT "project_opportunity_source_assignment_created_by_user_staff_id_" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revenue_department_assignment" ADD CONSTRAINT "project_revenue_department_assignment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revenue_department_assignment" ADD CONSTRAINT "project_revenue_department_assignment_created_by_user_staff_id_" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignment" ADD CONSTRAINT "project_staff_assignment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignment" ADD CONSTRAINT "project_staff_assignment_user_staff_id_user_staff_id_fk" FOREIGN KEY ("user_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_staff_assignment" ADD CONSTRAINT "project_staff_assignment_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tag_assignment" ADD CONSTRAINT "project_tag_assignment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tag_assignment" ADD CONSTRAINT "project_tag_assignment_tag_id_project_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."project_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tenant" ADD CONSTRAINT "project_tenant_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tenant" ADD CONSTRAINT "project_tenant_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge" ADD CONSTRAINT "recharge_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge" ADD CONSTRAINT "recharge_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_order" ADD CONSTRAINT "recharge_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recharge_order" ADD CONSTRAINT "recharge_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_balance_snapshot" ADD CONSTRAINT "tenant_balance_snapshot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_balance_snapshot" ADD CONSTRAINT "tenant_balance_snapshot_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_balance_snapshot" ADD CONSTRAINT "tenant_balance_snapshot_job_run_id_balance_snapshot_job_run_id_" FOREIGN KEY ("job_run_id") REFERENCES "public"."balance_snapshot_job_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill" ADD CONSTRAINT "tenant_bill_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill" ADD CONSTRAINT "tenant_bill_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill" ADD CONSTRAINT "tenant_bill_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill_daily" ADD CONSTRAINT "tenant_bill_daily_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill_daily" ADD CONSTRAINT "tenant_bill_daily_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill_daily_detail" ADD CONSTRAINT "tenant_bill_daily_detail_daily_bill_id_tenant_bill_daily_id_fk" FOREIGN KEY ("daily_bill_id") REFERENCES "public"."tenant_bill_daily"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill_daily_detail" ADD CONSTRAINT "tenant_bill_daily_detail_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_bill_detail" ADD CONSTRAINT "tenant_bill_detail_bill_id_tenant_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."tenant_bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_consumption_daily_detail" ADD CONSTRAINT "tenant_consumption_daily_detail_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_consumption_daily_detail" ADD CONSTRAINT "tenant_consumption_daily_detail_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_contact" ADD CONSTRAINT "tenant_contact_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_daily" ADD CONSTRAINT "tenant_region_gpu_consumption_daily_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_daily" ADD CONSTRAINT "tenant_region_gpu_consumption_daily_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_daily" ADD CONSTRAINT "tenant_region_gpu_consumption_daily_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_daily" ADD CONSTRAINT "tenant_region_gpu_consumption_daily_account_manager_staff_id_us" FOREIGN KEY ("account_manager_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_monthly" ADD CONSTRAINT "tenant_region_gpu_consumption_monthly_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_monthly" ADD CONSTRAINT "tenant_region_gpu_consumption_monthly_customer_id_customer_id_f" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_monthly" ADD CONSTRAINT "tenant_region_gpu_consumption_monthly_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_region_gpu_consumption_monthly" ADD CONSTRAINT "tenant_region_gpu_consumption_monthly_account_manager_staff_id_" FOREIGN KEY ("account_manager_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_voucher_issue" ADD CONSTRAINT "test_voucher_issue_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_voucher_issue" ADD CONSTRAINT "test_voucher_issue_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_voucher_issue" ADD CONSTRAINT "test_voucher_issue_operator_id_user_staff_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_voucher_issue" ADD CONSTRAINT "test_voucher_issue_coupon_id_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_staff" ADD CONSTRAINT "user_staff_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_agg_customer_consumption" ADD CONSTRAINT "billing_period_agg_customer_consumption_billing_period_id_billi" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_agg_customer_consumption" ADD CONSTRAINT "billing_period_agg_customer_consumption_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_agg_customer_consumption" ADD CONSTRAINT "billing_period_agg_customer_consumption_customer_id_customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_agg_customer_consumption" ADD CONSTRAINT "billing_period_agg_customer_consumption_project_id_project_id_f" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_import_batch" ADD CONSTRAINT "billing_period_import_batch_billing_period_id_billing_period_id" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_import_batch" ADD CONSTRAINT "billing_period_import_batch_window_id_billing_period_tenant_bil" FOREIGN KEY ("window_id") REFERENCES "public"."billing_period_tenant_bill_window"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_import_batch" ADD CONSTRAINT "billing_period_import_batch_uploaded_by_user_staff_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_operation_log" ADD CONSTRAINT "billing_period_operation_log_billing_period_id_billing_period_i" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_operation_log" ADD CONSTRAINT "billing_period_operation_log_actor_id_user_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_personal_income_summary" ADD CONSTRAINT "billing_period_personal_income_summary_billing_period_id_billin" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_personal_income_summary" ADD CONSTRAINT "billing_period_personal_income_summary_tenant_bill_batch_id_bil" FOREIGN KEY ("tenant_bill_batch_id") REFERENCES "public"."billing_period_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_personal_income_summary" ADD CONSTRAINT "billing_period_personal_income_summary_baremetal_batch_id_billi" FOREIGN KEY ("baremetal_batch_id") REFERENCES "public"."billing_period_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_personal_income_tenant_line" ADD CONSTRAINT "billing_period_personal_income_tenant_line_billing_period_id_bi" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_raw_baremetal_order" ADD CONSTRAINT "billing_period_raw_baremetal_order_batch_id_billing_period_impo" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_period_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_raw_customer_consumption" ADD CONSTRAINT "billing_period_raw_customer_consumption_batch_id_billing_period" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_period_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_raw_tenant_bill" ADD CONSTRAINT "billing_period_raw_tenant_bill_batch_id_billing_period_import_b" FOREIGN KEY ("batch_id") REFERENCES "public"."billing_period_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_reconciliation_report" ADD CONSTRAINT "billing_period_reconciliation_report_billing_period_id_billing_" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_tenant_bill_window" ADD CONSTRAINT "billing_period_tenant_bill_window_billing_period_id_billing_per" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_tenant_project_enrichment" ADD CONSTRAINT "billing_period_tenant_project_enrichment_billing_period_id_bill" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_tenant_project_enrichment" ADD CONSTRAINT "billing_period_tenant_project_enrichment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_tenant_project_enrichment" ADD CONSTRAINT "billing_period_tenant_project_enrichment_project_id_project_id_" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_period_tenant_project_enrichment" ADD CONSTRAINT "billing_period_tenant_project_enrichment_staff_id_user_staff_id" FOREIGN KEY ("staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tenant_cost_allocation" ADD CONSTRAINT "billing_tenant_cost_allocation_billing_period_id_billing_period" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tenant_cost_allocation" ADD CONSTRAINT "billing_tenant_cost_allocation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tenant_cost_allocation" ADD CONSTRAINT "billing_tenant_cost_allocation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tenant_cost_allocation" ADD CONSTRAINT "billing_tenant_cost_allocation_preset_id_tenant_project_cost_id" FOREIGN KEY ("preset_id") REFERENCES "public"."tenant_project_cost"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_tenant_cost_allocation" ADD CONSTRAINT "billing_tenant_cost_allocation_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_invoice_request_id_invoice_request_id_fk" FOREIGN KEY ("invoice_request_id") REFERENCES "public"."invoice_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_red_flush_invoice_id_invoice_id_fk" FOREIGN KEY ("red_flush_invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD CONSTRAINT "invoice_request_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD CONSTRAINT "invoice_request_bill_monthly_id_supplier_bill_id_fk" FOREIGN KEY ("bill_monthly_id") REFERENCES "public"."supplier_bill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD CONSTRAINT "invoice_request_invoice_title_id_invoice_title_id_fk" FOREIGN KEY ("invoice_title_id") REFERENCES "public"."invoice_title"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_request" ADD CONSTRAINT "invoice_request_reviewed_by_user_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_title" ADD CONSTRAINT "invoice_title_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_base_line" ADD CONSTRAINT "monthly_cost_base_line_run_id_monthly_cost_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_base_line" ADD CONSTRAINT "monthly_cost_base_line_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_base_line" ADD CONSTRAINT "monthly_cost_base_line_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_commission_line" ADD CONSTRAINT "monthly_cost_commission_line_run_id_monthly_cost_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_commission_project_line" ADD CONSTRAINT "monthly_cost_commission_project_line_run_id_monthly_cost_run_id" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_commission_project_line" ADD CONSTRAINT "monthly_cost_commission_project_line_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_contribution_weight" ADD CONSTRAINT "monthly_cost_dept_contribution_weight_staff_id_user_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_contribution_weight" ADD CONSTRAINT "monthly_cost_dept_contribution_weight_updated_by_user_staff_id_" FOREIGN KEY ("updated_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_distribution_line" ADD CONSTRAINT "monthly_cost_dept_distribution_line_run_id_monthly_cost_run_id_" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_distribution_line" ADD CONSTRAINT "monthly_cost_dept_distribution_line_dept_pool_line_id_monthly_c" FOREIGN KEY ("dept_pool_line_id") REFERENCES "public"."monthly_cost_dept_pool_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_distribution_line" ADD CONSTRAINT "monthly_cost_dept_distribution_line_staff_id_user_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_pool_line" ADD CONSTRAINT "monthly_cost_dept_pool_line_run_id_monthly_cost_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_pool_project_line" ADD CONSTRAINT "monthly_cost_dept_pool_project_line_run_id_monthly_cost_run_id_" FOREIGN KEY ("run_id") REFERENCES "public"."monthly_cost_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_pool_project_line" ADD CONSTRAINT "monthly_cost_dept_pool_project_line_dept_pool_line_id_monthly_c" FOREIGN KEY ("dept_pool_line_id") REFERENCES "public"."monthly_cost_dept_pool_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_dept_pool_project_line" ADD CONSTRAINT "monthly_cost_dept_pool_project_line_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_run" ADD CONSTRAINT "monthly_cost_run_billing_period_id_billing_period_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_run" ADD CONSTRAINT "monthly_cost_run_triggered_by_user_staff_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_cost_run" ADD CONSTRAINT "monthly_cost_run_confirmed_by_user_staff_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_income_monthly" ADD CONSTRAINT "platform_income_monthly_billing_period_id_billing_period_id_fk" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_income_monthly" ADD CONSTRAINT "platform_income_monthly_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_income_monthly" ADD CONSTRAINT "platform_income_monthly_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_income_monthly" ADD CONSTRAINT "platform_income_monthly_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_cost_snapshot" ADD CONSTRAINT "project_monthly_cost_snapshot_billing_period_id_billing_period_" FOREIGN KEY ("billing_period_id") REFERENCES "public"."billing_period"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_cost_snapshot" ADD CONSTRAINT "project_monthly_cost_snapshot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_cost_snapshot" ADD CONSTRAINT "project_monthly_cost_snapshot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_cost_snapshot" ADD CONSTRAINT "project_monthly_cost_snapshot_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_monthly_cost_snapshot" ADD CONSTRAINT "project_monthly_cost_snapshot_saved_by_user_staff_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplementary_consumption_history" ADD CONSTRAINT "supplementary_consumption_history_income_id_platform_income_mon" FOREIGN KEY ("income_id") REFERENCES "public"."platform_income_monthly"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplementary_consumption_history" ADD CONSTRAINT "supplementary_consumption_history_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_project_cost" ADD CONSTRAINT "tenant_project_cost_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_project_cost" ADD CONSTRAINT "tenant_project_cost_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_project_cost" ADD CONSTRAINT "tenant_project_cost_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_transaction" ADD CONSTRAINT "balance_transaction_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transfer_verification" ADD CONSTRAINT "bank_transfer_verification_payment_order_id_payment_order_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transfer_verification" ADD CONSTRAINT "bank_transfer_verification_reviewer_id_user_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_coupon" ADD CONSTRAINT "gpu_coupon_template_id_gpu_coupon_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."gpu_coupon_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_coupon_usage" ADD CONSTRAINT "gpu_coupon_usage_coupon_id_gpu_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."gpu_coupon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_coupon_usage" ADD CONSTRAINT "gpu_coupon_usage_task_instance_id_task_instances_id_fk" FOREIGN KEY ("task_instance_id") REFERENCES "public"."task_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_application" ADD CONSTRAINT "identity_verification_application_organization_id_organization_" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_application" ADD CONSTRAINT "identity_verification_application_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_application" ADD CONSTRAINT "identity_verification_application_reviewed_by_user_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_application" ADD CONSTRAINT "identity_verification_application_bound_customer_id_customer_id" FOREIGN KEY ("bound_customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_application" ADD CONSTRAINT "identity_verification_application_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_verification_attachment" ADD CONSTRAINT "identity_verification_attachment_application_id_identity_verifi" FOREIGN KEY ("application_id") REFERENCES "public"."identity_verification_application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_cost_allocation" ADD CONSTRAINT "marketing_cost_allocation_coupon_usage_id_gpu_coupon_usage_id_f" FOREIGN KEY ("coupon_usage_id") REFERENCES "public"."gpu_coupon_usage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_order" ADD CONSTRAINT "payment_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_order" ADD CONSTRAINT "payment_order_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliation" ADD CONSTRAINT "payment_reconciliation_reconciled_by_user_staff_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund" ADD CONSTRAINT "payment_refund_payment_order_id_payment_order_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund" ADD CONSTRAINT "payment_refund_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refund" ADD CONSTRAINT "payment_refund_reviewer_id_user_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_workspace_id_gpu_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."gpu_workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_definition_id_task_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."task_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_balance" ADD CONSTRAINT "tenant_balance_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_list_price" ADD CONSTRAINT "platform_card_list_price_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_list_price" ADD CONSTRAINT "platform_card_list_price_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_history" ADD CONSTRAINT "platform_card_price_history_price_record_id_platform_card_price" FOREIGN KEY ("price_record_id") REFERENCES "public"."platform_card_price_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_history" ADD CONSTRAINT "platform_card_price_history_gpu_card_type_id_gpu_card_type_id_f" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_history" ADD CONSTRAINT "platform_card_price_history_changed_by_staff_id_user_staff_id_f" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_record" ADD CONSTRAINT "platform_card_price_record_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_record" ADD CONSTRAINT "platform_card_price_record_platform_card_list_price_id_platform" FOREIGN KEY ("platform_card_list_price_id") REFERENCES "public"."platform_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_card_price_record" ADD CONSTRAINT "platform_card_price_record_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price" ADD CONSTRAINT "supplier_datacenter_sell_price_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price" ADD CONSTRAINT "supplier_datacenter_sell_price_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price" ADD CONSTRAINT "supplier_datacenter_sell_price_gpu_card_type_id_gpu_card_type_i" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price" ADD CONSTRAINT "supplier_datacenter_sell_price_platform_card_list_price_id_plat" FOREIGN KEY ("platform_card_list_price_id") REFERENCES "public"."platform_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price" ADD CONSTRAINT "supplier_datacenter_sell_price_updated_by_staff_id_user_staff_i" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price_history" ADD CONSTRAINT "supplier_datacenter_sell_price_history_sell_price_id_supplier_d" FOREIGN KEY ("sell_price_id") REFERENCES "public"."supplier_datacenter_sell_price"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price_history" ADD CONSTRAINT "supplier_datacenter_sell_price_history_supplier_id_supplier_id_" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price_history" ADD CONSTRAINT "supplier_datacenter_sell_price_history_data_center_id_data_cent" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price_history" ADD CONSTRAINT "supplier_datacenter_sell_price_history_gpu_card_type_id_gpu_car" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_sell_price_history" ADD CONSTRAINT "supplier_datacenter_sell_price_history_changed_by_staff_id_user" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant" ADD CONSTRAINT "merchant_commission_tier_id_merchant_commission_tier_id_fk" FOREIGN KEY ("commission_tier_id") REFERENCES "public"."merchant_commission_tier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account" ADD CONSTRAINT "merchant_account_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_ledger" ADD CONSTRAINT "merchant_account_ledger_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_manager_assignment" ADD CONSTRAINT "merchant_account_manager_assignment_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_manager_assignment" ADD CONSTRAINT "merchant_account_manager_assignment_user_staff_id_user_staff_id" FOREIGN KEY ("user_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_manager_assignment" ADD CONSTRAINT "merchant_account_manager_assignment_created_by_staff_id_user_st" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_pool_balance" ADD CONSTRAINT "merchant_account_pool_balance_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_account_snapshot" ADD CONSTRAINT "merchant_account_snapshot_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_activity" ADD CONSTRAINT "merchant_activity_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_activity" ADD CONSTRAINT "merchant_activity_author_staff_id_user_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_activity_attachment" ADD CONSTRAINT "merchant_activity_attachment_activity_id_merchant_activity_id_f" FOREIGN KEY ("activity_id") REFERENCES "public"."merchant_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_api_key" ADD CONSTRAINT "merchant_api_key_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill" ADD CONSTRAINT "merchant_bill_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill_daily" ADD CONSTRAINT "merchant_bill_daily_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill_daily_detail" ADD CONSTRAINT "merchant_bill_daily_detail_daily_bill_id_merchant_bill_daily_id" FOREIGN KEY ("daily_bill_id") REFERENCES "public"."merchant_bill_daily"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill_daily_detail" ADD CONSTRAINT "merchant_bill_daily_detail_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill_detail" ADD CONSTRAINT "merchant_bill_detail_merchant_bill_id_merchant_bill_id_fk" FOREIGN KEY ("merchant_bill_id") REFERENCES "public"."merchant_bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_bill_detail" ADD CONSTRAINT "merchant_bill_detail_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_branding" ADD CONSTRAINT "merchant_branding_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_contact" ADD CONSTRAINT "merchant_contact_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_datacenter_card_type" ADD CONSTRAINT "merchant_datacenter_card_type_merchant_datacenter_region_id_mer" FOREIGN KEY ("merchant_datacenter_region_id") REFERENCES "public"."merchant_datacenter_region"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_datacenter_card_type" ADD CONSTRAINT "merchant_datacenter_card_type_gpu_card_type_id_gpu_card_type_id" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_datacenter_region" ADD CONSTRAINT "merchant_datacenter_region_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_datacenter_region" ADD CONSTRAINT "merchant_datacenter_region_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_datacenter_region" ADD CONSTRAINT "merchant_datacenter_region_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_external_subject" ADD CONSTRAINT "merchant_external_subject_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_external_subject" ADD CONSTRAINT "merchant_external_subject_platform_tenant_id_tenant_id_fk" FOREIGN KEY ("platform_tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_finance_config" ADD CONSTRAINT "merchant_finance_config_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_finance_config_audit_log" ADD CONSTRAINT "merchant_finance_config_audit_log_operator_staff_id_user_staff_" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node" ADD CONSTRAINT "merchant_payment_node_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node" ADD CONSTRAINT "merchant_payment_node_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node" ADD CONSTRAINT "merchant_payment_node_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node_audit_log" ADD CONSTRAINT "merchant_payment_node_audit_log_payment_node_id_merchant_paymen" FOREIGN KEY ("payment_node_id") REFERENCES "public"."merchant_payment_node"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node_audit_log" ADD CONSTRAINT "merchant_payment_node_audit_log_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payment_node_audit_log" ADD CONSTRAINT "merchant_payment_node_audit_log_operator_staff_id_user_staff_id" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payout_account" ADD CONSTRAINT "merchant_payout_account_verified_by_staff_id_user_staff_id_fk" FOREIGN KEY ("verified_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payout_account" ADD CONSTRAINT "merchant_payout_account_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payout_account_audit_log" ADD CONSTRAINT "merchant_payout_account_audit_log_payout_account_id_merchant_pa" FOREIGN KEY ("payout_account_id") REFERENCES "public"."merchant_payout_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payout_account_audit_log" ADD CONSTRAINT "merchant_payout_account_audit_log_operator_staff_id_user_staff_" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_product_purchase_price" ADD CONSTRAINT "merchant_product_purchase_price_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_product_purchase_price" ADD CONSTRAINT "merchant_product_purchase_price_updated_by_staff_id_user_staff_" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_promo_attribution" ADD CONSTRAINT "merchant_promo_attribution_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_promo_attribution" ADD CONSTRAINT "merchant_promo_attribution_promo_link_id_merchant_promo_link_id" FOREIGN KEY ("promo_link_id") REFERENCES "public"."merchant_promo_link"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_promo_attribution" ADD CONSTRAINT "merchant_promo_attribution_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_promo_link" ADD CONSTRAINT "merchant_promo_link_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_promo_link" ADD CONSTRAINT "merchant_promo_link_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price" ADD CONSTRAINT "merchant_purchase_price_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price" ADD CONSTRAINT "merchant_purchase_price_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price" ADD CONSTRAINT "merchant_purchase_price_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price" ADD CONSTRAINT "merchant_purchase_price_platform_list_price_id_platform_card_li" FOREIGN KEY ("platform_list_price_id") REFERENCES "public"."platform_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price" ADD CONSTRAINT "merchant_purchase_price_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price_record" ADD CONSTRAINT "merchant_purchase_price_record_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price_record" ADD CONSTRAINT "merchant_purchase_price_record_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price_record" ADD CONSTRAINT "merchant_purchase_price_record_gpu_card_type_id_gpu_card_type_i" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price_record" ADD CONSTRAINT "merchant_purchase_price_record_platform_list_price_id_platform_" FOREIGN KEY ("platform_list_price_id") REFERENCES "public"."platform_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_price_record" ADD CONSTRAINT "merchant_purchase_price_record_updated_by_staff_id_user_staff_i" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_attachment" ADD CONSTRAINT "merchant_recharge_attachment_recharge_id_merchant_recharge_reco" FOREIGN KEY ("recharge_id") REFERENCES "public"."merchant_recharge_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_attachment" ADD CONSTRAINT "merchant_recharge_attachment_uploaded_by_staff_id_user_staff_id" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_audit_log" ADD CONSTRAINT "merchant_recharge_audit_log_recharge_id_merchant_recharge_recor" FOREIGN KEY ("recharge_id") REFERENCES "public"."merchant_recharge_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_audit_log" ADD CONSTRAINT "merchant_recharge_audit_log_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_audit_log" ADD CONSTRAINT "merchant_recharge_audit_log_operator_staff_id_user_staff_id_fk" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_record" ADD CONSTRAINT "merchant_recharge_record_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_record" ADD CONSTRAINT "merchant_recharge_record_payment_node_id_merchant_payment_node_" FOREIGN KEY ("payment_node_id") REFERENCES "public"."merchant_payment_node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_record" ADD CONSTRAINT "merchant_recharge_record_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recharge_record" ADD CONSTRAINT "merchant_recharge_record_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recon_diff" ADD CONSTRAINT "merchant_recon_diff_statement_id_merchant_recon_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."merchant_recon_statement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recon_diff" ADD CONSTRAINT "merchant_recon_diff_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recon_diff" ADD CONSTRAINT "merchant_recon_diff_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recon_statement" ADD CONSTRAINT "merchant_recon_statement_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_recon_statement" ADD CONSTRAINT "merchant_recon_statement_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_sales_price" ADD CONSTRAINT "merchant_sales_price_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_sales_price" ADD CONSTRAINT "merchant_sales_price_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_sales_price" ADD CONSTRAINT "merchant_sales_price_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_sales_price" ADD CONSTRAINT "merchant_sales_price_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_site_message" ADD CONSTRAINT "merchant_site_message_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_tenant_contribution" ADD CONSTRAINT "merchant_tenant_contribution_merchant_id_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_tenant_contribution" ADD CONSTRAINT "merchant_tenant_contribution_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_condition_sheet" ADD CONSTRAINT "access_condition_sheet_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_registry" ADD CONSTRAINT "agent_registry_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order" ADD CONSTRAINT "bare_metal_order_import_batch_id_bare_metal_order_import_batch_" FOREIGN KEY ("import_batch_id") REFERENCES "public"."bare_metal_order_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_device" ADD CONSTRAINT "bare_metal_order_device_bare_metal_order_id_bare_metal_order_id" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_device" ADD CONSTRAINT "bare_metal_order_device_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_device" ADD CONSTRAINT "bare_metal_order_device_supplier_device_id_supplier_device_id_f" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_import_batch" ADD CONSTRAINT "bare_metal_order_import_batch_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_import_batch" ADD CONSTRAINT "bare_metal_order_import_batch_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_import_batch" ADD CONSTRAINT "bare_metal_order_import_batch_bare_metal_order_id_bare_metal_or" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_import_batch" ADD CONSTRAINT "bare_metal_order_import_batch_created_by_staff_id_user_staff_id" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_log" ADD CONSTRAINT "bare_metal_order_log_bare_metal_order_id_bare_metal_order_id_fk" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_order_price_snapshot" ADD CONSTRAINT "bare_metal_order_price_snapshot_bare_metal_order_id_bare_metal_" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_sync_job_item" ADD CONSTRAINT "bare_metal_sync_job_item_job_run_id_bare_metal_sync_job_run_id_" FOREIGN KEY ("job_run_id") REFERENCES "public"."bare_metal_sync_job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_sync_job_item" ADD CONSTRAINT "bare_metal_sync_job_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bare_metal_sync_job_item" ADD CONSTRAINT "bare_metal_sync_job_item_resolved_by_staff_id_user_staff_id_fk" FOREIGN KEY ("resolved_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compute_node" ADD CONSTRAINT "compute_node_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_center" ADD CONSTRAINT "data_center_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_policy" ADD CONSTRAINT "device_onboarding_policy_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_policy_batch" ADD CONSTRAINT "device_onboarding_policy_batch_policy_id_device_onboarding_poli" FOREIGN KEY ("policy_id") REFERENCES "public"."device_onboarding_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_policy_batch" ADD CONSTRAINT "device_onboarding_policy_batch_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_policy_batch" ADD CONSTRAINT "device_onboarding_policy_batch_applied_by_user_staff_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_task" ADD CONSTRAINT "device_onboarding_task_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_onboarding_task" ADD CONSTRAINT "device_onboarding_task_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_batch" ADD CONSTRAINT "device_platform_orphan_import_batch_source_job_run_id_device_pl" FOREIGN KEY ("source_job_run_id") REFERENCES "public"."device_platform_probe_job_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_batch" ADD CONSTRAINT "device_platform_orphan_import_batch_operator_staff_id_user_staf" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_link" ADD CONSTRAINT "device_platform_orphan_import_link_batch_id_device_platform_orp" FOREIGN KEY ("batch_id") REFERENCES "public"."device_platform_orphan_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_link" ADD CONSTRAINT "device_platform_orphan_import_link_probe_snapshot_id_device_pla" FOREIGN KEY ("probe_snapshot_id") REFERENCES "public"."device_platform_probe_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_link" ADD CONSTRAINT "device_platform_orphan_import_link_supplier_device_id_supplier_" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_link" ADD CONSTRAINT "device_platform_orphan_import_link_matched_rule_id_device_platf" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."device_platform_orphan_import_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_rule" ADD CONSTRAINT "device_platform_orphan_import_rule_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_rule" ADD CONSTRAINT "device_platform_orphan_import_rule_target_data_center_id_data_c" FOREIGN KEY ("target_data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_rule" ADD CONSTRAINT "device_platform_orphan_import_rule_created_by_staff_id_user_sta" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_orphan_import_rule" ADD CONSTRAINT "device_platform_orphan_import_rule_updated_by_staff_id_user_sta" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_probe_snapshot" ADD CONSTRAINT "device_platform_probe_snapshot_job_run_id_device_platform_probe" FOREIGN KEY ("job_run_id") REFERENCES "public"."device_platform_probe_job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_probe_snapshot" ADD CONSTRAINT "device_platform_probe_snapshot_supplier_device_id_supplier_devi" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_probe_snapshot" ADD CONSTRAINT "device_platform_probe_snapshot_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_platform_probe_snapshot" ADD CONSTRAINT "device_platform_probe_snapshot_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_state_transition_log" ADD CONSTRAINT "entity_state_transition_log_operator_staff_id_user_staff_id_fk" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fault_incident" ADD CONSTRAINT "fault_incident_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fault_incident" ADD CONSTRAINT "fault_incident_supplier_ops_upload_batch_id_supplier_ops_upload" FOREIGN KEY ("supplier_ops_upload_batch_id") REFERENCES "public"."supplier_ops_upload_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fault_incident" ADD CONSTRAINT "fault_incident_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fault_incident" ADD CONSTRAINT "fault_incident_compute_node_id_compute_node_id_fk" FOREIGN KEY ("compute_node_id") REFERENCES "public"."compute_node"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_node" ADD CONSTRAINT "gateway_node_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_node" ADD CONSTRAINT "gateway_node_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_node" ADD CONSTRAINT "gateway_node_audited_by_user_staff_id_fk" FOREIGN KEY ("audited_by") REFERENCES "public"."user_staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_supplier_gpu_inventory_id_supplier_gpu_inven" FOREIGN KEY ("supplier_gpu_inventory_id") REFERENCES "public"."supplier_gpu_inventory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold" ADD CONSTRAINT "internal_test_hold_onboarding_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold_device_link" ADD CONSTRAINT "internal_test_hold_device_link_hold_id_internal_test_hold_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."internal_test_hold"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_test_hold_device_link" ADD CONSTRAINT "internal_test_hold_device_link_supplier_device_id_supplier_devi" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_access_condition_sheet_id_access_condition_she" FOREIGN KEY ("access_condition_sheet_id") REFERENCES "public"."access_condition_sheet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_parent_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("parent_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch" ADD CONSTRAINT "onboarding_batch_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_device_link" ADD CONSTRAINT "onboarding_batch_device_link_business_onboarding_batch_id_onboa" FOREIGN KEY ("business_onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_device_link" ADD CONSTRAINT "onboarding_batch_device_link_supplier_device_id_supplier_device" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_device_link" ADD CONSTRAINT "onboarding_batch_device_link_source_changelog_batch_id_onboardi" FOREIGN KEY ("source_changelog_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_device_link" ADD CONSTRAINT "onboarding_batch_device_link_gpu_card_type_id_gpu_card_type_id_" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_import_row" ADD CONSTRAINT "onboarding_batch_import_row_onboarding_batch_id_onboarding_batc" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_import_row" ADD CONSTRAINT "onboarding_batch_import_row_gpu_card_type_id_gpu_card_type_id_f" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_import_row" ADD CONSTRAINT "onboarding_batch_import_row_supplier_device_id_supplier_device_" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_plan_line" ADD CONSTRAINT "onboarding_batch_plan_line_onboarding_batch_id_onboarding_batch" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_plan_line" ADD CONSTRAINT "onboarding_batch_plan_line_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_progress_event" ADD CONSTRAINT "onboarding_batch_progress_event_onboarding_batch_id_onboarding_" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_progress_event" ADD CONSTRAINT "onboarding_batch_progress_event_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_batch_progress_event" ADD CONSTRAINT "onboarding_batch_progress_event_data_center_id_data_center_id_f" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_onboarding_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_assignee_staff_id_user_staff_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_pool_binding" ADD CONSTRAINT "resource_pool_binding_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_business_manager_staff_id_user_staff_id_fk" FOREIGN KEY ("business_manager_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_activity" ADD CONSTRAINT "supplier_activity_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_activity" ADD CONSTRAINT "supplier_activity_author_staff_id_user_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_activity_attachment" ADD CONSTRAINT "supplier_activity_attachment_activity_id_supplier_activity_id_f" FOREIGN KEY ("activity_id") REFERENCES "public"."supplier_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_api_key" ADD CONSTRAINT "supplier_api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill" ADD CONSTRAINT "supplier_bill_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily" ADD CONSTRAINT "supplier_bill_daily_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily" ADD CONSTRAINT "supplier_bill_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily_detail" ADD CONSTRAINT "supplier_bill_daily_detail_daily_bill_id_supplier_bill_daily_id" FOREIGN KEY ("daily_bill_id") REFERENCES "public"."supplier_bill_daily"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily_detail" ADD CONSTRAINT "supplier_bill_daily_detail_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily_detail" ADD CONSTRAINT "supplier_bill_daily_detail_device_id_supplier_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."supplier_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_daily_detail" ADD CONSTRAINT "supplier_bill_daily_detail_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_detail" ADD CONSTRAINT "supplier_bill_detail_bill_id_supplier_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bill"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_detail" ADD CONSTRAINT "supplier_bill_detail_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_detail" ADD CONSTRAINT "supplier_bill_detail_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_card_list_price" ADD CONSTRAINT "supplier_card_list_price_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_card_list_price" ADD CONSTRAINT "supplier_card_list_price_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_card_list_price" ADD CONSTRAINT "supplier_card_list_price_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contract" ADD CONSTRAINT "supplier_contract_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contract" ADD CONSTRAINT "supplier_contract_confirmed_by_supplier_org_id_organization_id_" FOREIGN KEY ("confirmed_by_supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contract_capacity_line" ADD CONSTRAINT "supplier_contract_capacity_line_contract_id_supplier_contract_i" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contract_capacity_line" ADD CONSTRAINT "supplier_contract_capacity_line_data_center_id_data_center_id_f" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contract_capacity_line" ADD CONSTRAINT "supplier_contract_capacity_line_gpu_card_type_id_gpu_card_type_" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_card_type_spec" ADD CONSTRAINT "supplier_datacenter_card_type_spec_data_center_id_data_center_i" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_card_type_spec" ADD CONSTRAINT "supplier_datacenter_card_type_spec_gpu_card_type_id_gpu_card_ty" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_datacenter_infrastructure" ADD CONSTRAINT "supplier_datacenter_infrastructure_data_center_id_data_center_i" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device" ADD CONSTRAINT "supplier_device_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device" ADD CONSTRAINT "supplier_device_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device" ADD CONSTRAINT "supplier_device_onboarding_batch_id_onboarding_batch_id_fk" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device" ADD CONSTRAINT "supplier_device_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device" ADD CONSTRAINT "supplier_device_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device_change_log" ADD CONSTRAINT "supplier_device_change_log_supplier_device_id_supplier_device_i" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device_change_log" ADD CONSTRAINT "supplier_device_change_log_onboarding_batch_id_onboarding_batch" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_device_change_log" ADD CONSTRAINT "supplier_device_change_log_business_onboarding_batch_id_onboard" FOREIGN KEY ("business_onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_gpu_inventory" ADD CONSTRAINT "supplier_gpu_inventory_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_gpu_inventory" ADD CONSTRAINT "supplier_gpu_inventory_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_gpu_inventory" ADD CONSTRAINT "supplier_gpu_inventory_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_notification_preference" ADD CONSTRAINT "supplier_notification_preference_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ops_engineer" ADD CONSTRAINT "supplier_ops_engineer_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ops_engineer" ADD CONSTRAINT "supplier_ops_engineer_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ops_upload_batch" ADD CONSTRAINT "supplier_ops_upload_batch_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ops_upload_batch" ADD CONSTRAINT "supplier_ops_upload_batch_onboarding_batch_id_onboarding_batch_" FOREIGN KEY ("onboarding_batch_id") REFERENCES "public"."onboarding_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_ops_upload_batch" ADD CONSTRAINT "supplier_ops_upload_batch_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_history" ADD CONSTRAINT "supplier_pricing_history_pricing_record_id_supplier_pricing_rec" FOREIGN KEY ("pricing_record_id") REFERENCES "public"."supplier_pricing_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_history" ADD CONSTRAINT "supplier_pricing_history_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_history" ADD CONSTRAINT "supplier_pricing_history_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_history" ADD CONSTRAINT "supplier_pricing_history_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_history" ADD CONSTRAINT "supplier_pricing_history_changed_by_staff_id_user_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_supplier_unit_cost_id_supplier_unit_cos" FOREIGN KEY ("supplier_unit_cost_id") REFERENCES "public"."supplier_unit_cost"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_supplier_card_list_price_id_supplier_ca" FOREIGN KEY ("supplier_card_list_price_id") REFERENCES "public"."supplier_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_record" ADD CONSTRAINT "supplier_pricing_record_updated_by_staff_id_user_staff_id_fk" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_tier" ADD CONSTRAINT "supplier_pricing_tier_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_pricing_tier" ADD CONSTRAINT "supplier_pricing_tier_supplier_card_list_price_id_supplier_card" FOREIGN KEY ("supplier_card_list_price_id") REFERENCES "public"."supplier_card_list_price"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_site_message" ADD CONSTRAINT "supplier_site_message_supplier_org_id_organization_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_terms_version" ADD CONSTRAINT "supplier_terms_version_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_terms_version" ADD CONSTRAINT "supplier_terms_version_contract_id_supplier_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."supplier_contract"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_unit_cost" ADD CONSTRAINT "supplier_unit_cost_supplier_terms_version_id_supplier_terms_ver" FOREIGN KEY ("supplier_terms_version_id") REFERENCES "public"."supplier_terms_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_unit_cost" ADD CONSTRAINT "supplier_unit_cost_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_unit_cost" ADD CONSTRAINT "supplier_unit_cost_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_unit_cost" ADD CONSTRAINT "supplier_unit_cost_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_unit_cost" ADD CONSTRAINT "supplier_unit_cost_supplier_card_list_price_id_supplier_card_li" FOREIGN KEY ("supplier_card_list_price_id") REFERENCES "public"."supplier_card_list_price"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_linked_supplier_id_supplier_id_fk" FOREIGN KEY ("linked_supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_parent_supplier_lead_id_supply_chain_lead_id_" FOREIGN KEY ("parent_supplier_lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_owner_staff_id_user_staff_id_fk" FOREIGN KEY ("owner_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_converted_supplier_id_supplier_id_fk" FOREIGN KEY ("converted_supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_converted_data_center_id_data_center_id_fk" FOREIGN KEY ("converted_data_center_id") REFERENCES "public"."data_center"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_converted_by_user_staff_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead" ADD CONSTRAINT "supply_chain_lead_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_activity" ADD CONSTRAINT "supply_chain_lead_activity_lead_id_supply_chain_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_activity" ADD CONSTRAINT "supply_chain_lead_activity_author_staff_id_user_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_activity_attachment" ADD CONSTRAINT "supply_chain_lead_activity_attachment_activity_id_supply_chain_" FOREIGN KEY ("activity_id") REFERENCES "public"."supply_chain_lead_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_contact" ADD CONSTRAINT "supply_chain_lead_contact_lead_id_supply_chain_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_gpu_snapshot" ADD CONSTRAINT "supply_chain_lead_gpu_snapshot_lead_id_supply_chain_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_gpu_snapshot" ADD CONSTRAINT "supply_chain_lead_gpu_snapshot_gpu_card_type_id_gpu_card_type_i" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_gpu_snapshot" ADD CONSTRAINT "supply_chain_lead_gpu_snapshot_created_by_user_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_import_batch" ADD CONSTRAINT "supply_chain_lead_import_batch_operator_staff_id_user_staff_id_" FOREIGN KEY ("operator_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_import_batch_item" ADD CONSTRAINT "supply_chain_lead_import_batch_item_batch_id_supply_chain_lead_" FOREIGN KEY ("batch_id") REFERENCES "public"."supply_chain_lead_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_import_batch_item" ADD CONSTRAINT "supply_chain_lead_import_batch_item_lead_id_supply_chain_lead_i" FOREIGN KEY ("lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_tag_assignment" ADD CONSTRAINT "supply_chain_lead_tag_assignment_lead_id_supply_chain_lead_id_f" FOREIGN KEY ("lead_id") REFERENCES "public"."supply_chain_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lead_tag_assignment" ADD CONSTRAINT "supply_chain_lead_tag_assignment_tag_id_supply_chain_lead_tag_i" FOREIGN KEY ("tag_id") REFERENCES "public"."supply_chain_lead_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_availability_snapshot" ADD CONSTRAINT "device_availability_snapshot_supplier_device_id_supplier_device" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_availability_snapshot" ADD CONSTRAINT "device_availability_snapshot_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_availability_snapshot" ADD CONSTRAINT "device_availability_snapshot_gpu_card_type_id_gpu_card_type_id_" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_rule_change_log" ADD CONSTRAINT "scheduling_rule_change_log_rule_id_resource_scheduling_rule_id_" FOREIGN KEY ("rule_id") REFERENCES "public"."resource_scheduling_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order" ADD CONSTRAINT "offline_bare_metal_order_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order" ADD CONSTRAINT "offline_bare_metal_order_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order_supply_line" ADD CONSTRAINT "offline_bare_metal_order_supply_line_order_id_offline_bare_meta" FOREIGN KEY ("order_id") REFERENCES "public"."offline_bare_metal_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order_supply_line" ADD CONSTRAINT "offline_bare_metal_order_supply_line_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order_supply_line" ADD CONSTRAINT "offline_bare_metal_order_supply_line_data_center_id_data_center" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_bare_metal_order_supply_line" ADD CONSTRAINT "offline_bare_metal_order_supply_line_gpu_card_type_id_gpu_card_" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_bitable_sync_config" ADD CONSTRAINT "sla_bitable_sync_config_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_datacenter_card_type_monthly" ADD CONSTRAINT "sla_datacenter_card_type_monthly_data_center_id_data_center_id_" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_datacenter_card_type_monthly" ADD CONSTRAINT "sla_datacenter_card_type_monthly_gpu_card_type_id_gpu_card_type" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_datacenter_card_type_monthly" ADD CONSTRAINT "sla_datacenter_card_type_monthly_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_datacenter_monthly" ADD CONSTRAINT "sla_datacenter_monthly_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_datacenter_monthly" ADD CONSTRAINT "sla_datacenter_monthly_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_device_monthly" ADD CONSTRAINT "sla_device_monthly_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_device_monthly" ADD CONSTRAINT "sla_device_monthly_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_device_monthly" ADD CONSTRAINT "sla_device_monthly_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_card_hours_daily" ADD CONSTRAINT "sla_fault_card_hours_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_card_hours_daily" ADD CONSTRAINT "sla_fault_card_hours_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_card_hours_daily" ADD CONSTRAINT "sla_fault_card_hours_daily_import_batch_id_sla_import_batch_id_" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_count_daily" ADD CONSTRAINT "sla_fault_count_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_count_daily" ADD CONSTRAINT "sla_fault_count_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_device_daily" ADD CONSTRAINT "sla_fault_device_daily_supplier_device_id_supplier_device_id_fk" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_device_daily" ADD CONSTRAINT "sla_fault_device_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_fault_device_daily" ADD CONSTRAINT "sla_fault_device_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_import_batch" ADD CONSTRAINT "sla_import_batch_created_by_staff_id_user_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_monthly_report_compensation" ADD CONSTRAINT "sla_monthly_report_compensation_data_center_id_data_center_id_f" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_monthly_report_compensation" ADD CONSTRAINT "sla_monthly_report_compensation_updated_by_staff_id_user_staff_" FOREIGN KEY ("updated_by_staff_id") REFERENCES "public"."user_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_onboarding_loss" ADD CONSTRAINT "sla_onboarding_loss_import_batch_id_sla_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_onboarding_loss" ADD CONSTRAINT "sla_onboarding_loss_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_onboarding_loss" ADD CONSTRAINT "sla_onboarding_loss_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_daily" ADD CONSTRAINT "sla_ops_fault_daily_incident_id_sla_ops_fault_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."sla_ops_fault_incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident" ADD CONSTRAINT "sla_ops_fault_incident_import_batch_id_sla_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident" ADD CONSTRAINT "sla_ops_fault_incident_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident" ADD CONSTRAINT "sla_ops_fault_incident_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident" ADD CONSTRAINT "sla_ops_fault_incident_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident" ADD CONSTRAINT "sla_ops_fault_incident_parent_incident_id_sla_ops_fault_inciden" FOREIGN KEY ("parent_incident_id") REFERENCES "public"."sla_ops_fault_incident"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_incident_id_sla_ops_fault_inciden" FOREIGN KEY ("incident_id") REFERENCES "public"."sla_ops_fault_incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_supplier_device_id_supplier_devic" FOREIGN KEY ("supplier_device_id") REFERENCES "public"."supplier_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_gpu_card_type_id_gpu_card_type_id" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_bare_metal_order_id_bare_metal_or" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_ops_fault_incident_device" ADD CONSTRAINT "sla_ops_fault_incident_device_bare_metal_order_device_id_bare_m" FOREIGN KEY ("bare_metal_order_device_id") REFERENCES "public"."bare_metal_order_device"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_internal_usage" ADD CONSTRAINT "sla_platform_internal_usage_import_batch_id_sla_import_batch_id" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_internal_usage" ADD CONSTRAINT "sla_platform_internal_usage_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_internal_usage" ADD CONSTRAINT "sla_platform_internal_usage_gpu_card_type_id_gpu_card_type_id_f" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_offline_baremetal_incident" ADD CONSTRAINT "sla_platform_offline_baremetal_incident_import_batch_id_sla_imp" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_offline_baremetal_incident" ADD CONSTRAINT "sla_platform_offline_baremetal_incident_offline_bare_metal_orde" FOREIGN KEY ("offline_bare_metal_order_id") REFERENCES "public"."offline_bare_metal_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_offline_baremetal_incident" ADD CONSTRAINT "sla_platform_offline_baremetal_incident_offline_supply_line_id_" FOREIGN KEY ("offline_supply_line_id") REFERENCES "public"."offline_bare_metal_order_supply_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_offline_baremetal_incident" ADD CONSTRAINT "sla_platform_offline_baremetal_incident_data_center_id_data_cen" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_offline_baremetal_incident" ADD CONSTRAINT "sla_platform_offline_baremetal_incident_gpu_card_type_id_gpu_ca" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_online_incident" ADD CONSTRAINT "sla_platform_online_incident_import_batch_id_sla_import_batch_i" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_online_incident" ADD CONSTRAINT "sla_platform_online_incident_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_online_incident" ADD CONSTRAINT "sla_platform_online_incident_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_online_incident" ADD CONSTRAINT "sla_platform_online_incident_gpu_card_type_id_gpu_card_type_id_" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_platform_online_incident" ADD CONSTRAINT "sla_platform_online_incident_bare_metal_order_id_bare_metal_ord" FOREIGN KEY ("bare_metal_order_id") REFERENCES "public"."bare_metal_order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_supply_daily" ADD CONSTRAINT "sla_supply_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_supply_daily" ADD CONSTRAINT "sla_supply_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_supply_daily" ADD CONSTRAINT "sla_supply_daily_import_batch_id_sla_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_utilization_daily" ADD CONSTRAINT "sla_utilization_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_utilization_daily" ADD CONSTRAINT "sla_utilization_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_utilization_daily" ADD CONSTRAINT "sla_utilization_daily_import_batch_id_sla_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_waste_daily" ADD CONSTRAINT "sla_waste_daily_data_center_id_data_center_id_fk" FOREIGN KEY ("data_center_id") REFERENCES "public"."data_center"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_waste_daily" ADD CONSTRAINT "sla_waste_daily_gpu_card_type_id_gpu_card_type_id_fk" FOREIGN KEY ("gpu_card_type_id") REFERENCES "public"."gpu_card_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_waste_daily" ADD CONSTRAINT "sla_waste_daily_import_batch_id_sla_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."sla_import_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_inviter_id_idx" ON "invitation" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_user_id_idx" ON "user_invitation_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_code_idx" ON "user_invitation_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "user_invitation_codes_active_idx" ON "user_invitation_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_inviter_idx" ON "user_invitation_relations" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_invitee_idx" ON "user_invitation_relations" USING btree ("invitee_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_code_idx" ON "user_invitation_relations" USING btree ("invitation_code_id");--> statement-breakpoint
CREATE INDEX "user_invitation_relations_unique_idx" ON "user_invitation_relations" USING btree ("inviter_id","invitee_id");--> statement-breakpoint
CREATE INDEX "user_site_message_user_created_idx" ON "user_site_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_site_message_user_read_idx" ON "user_site_message" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "api_task_merchant_idx" ON "api_task" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "api_task_tenant_idx" ON "api_task" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "api_task_status_idx" ON "api_task" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_task_merchant_tenant_idx" ON "api_task" USING btree ("merchant_id","tenant_id");--> statement-breakpoint
CREATE INDEX "application_template_category_idx" ON "application_template" USING btree ("category");--> statement-breakpoint
CREATE INDEX "application_template_review_idx" ON "application_template" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "application_template_version_template_idx" ON "application_template_version" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "base_image_category_idx" ON "base_image" USING btree ("category");--> statement-breakpoint
CREATE INDEX "base_image_status_idx" ON "base_image" USING btree ("status");--> statement-breakpoint
CREATE INDEX "base_image_version_image_id_idx" ON "base_image_version" USING btree ("base_image_id");--> statement-breakpoint
CREATE INDEX "cloud_vm_detail_base_idx" ON "cloud_vm_detail" USING btree ("compute_base_id");--> statement-breakpoint
CREATE INDEX "compute_base_org_idx" ON "compute_base" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "compute_base_tenant_idx" ON "compute_base" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "compute_base_product_line_idx" ON "compute_base" USING btree ("product_line");--> statement-breakpoint
CREATE INDEX "compute_base_status_idx" ON "compute_base" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compute_base_org_product_status_idx" ON "compute_base" USING btree ("organization_id","product_line","status");--> statement-breakpoint
CREATE INDEX "compute_task_event_base_idx" ON "compute_task_event" USING btree ("compute_base_id");--> statement-breakpoint
CREATE INDEX "compute_task_event_base_occurred_idx" ON "compute_task_event" USING btree ("compute_base_id","occurred_at");--> statement-breakpoint
CREATE INDEX "compute_task_event_type_idx" ON "compute_task_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "custom_image_tenant_idx" ON "custom_image" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "custom_image_tenant_status_idx" ON "custom_image" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "image_save_job_tenant_idx" ON "image_save_job" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "image_save_job_status_idx" ON "image_save_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preload_node_task_preload_idx" ON "preload_node_task" USING btree ("preload_task_id");--> statement-breakpoint
CREATE INDEX "preload_task_tenant_idx" ON "preload_task" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "preload_task_region_idx" ON "preload_task" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "preload_task_status_idx" ON "preload_task" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registry_credential_tenant_idx" ON "registry_credential" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "serverless_detail_base_idx" ON "serverless_detail" USING btree ("compute_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_activity_idempotency_key_uk" ON "account_activity" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "account_activity_customer_occurred_idx" ON "account_activity" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "account_activity_tenant_occurred_idx" ON "account_activity" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "account_manager_assignment_customer_id_idx" ON "account_manager_assignment" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "account_manager_assignment_user_staff_id_idx" ON "account_manager_assignment" USING btree ("user_staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_type_definition_type_code_uk" ON "activity_type_definition" USING btree ("type_code");--> statement-breakpoint
CREATE INDEX "balance_snapshot_job_item_job_run_id_idx" ON "balance_snapshot_job_item" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "balance_snapshot_job_item_tenant_id_idx" ON "balance_snapshot_job_item" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "balance_snapshot_job_run_started_at_idx" ON "balance_snapshot_job_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "balance_snapshot_job_run_status_idx" ON "balance_snapshot_job_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_sync_job_item_job_run_id_idx" ON "billing_sync_job_item" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "billing_sync_job_item_tenant_id_idx" ON "billing_sync_job_item" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_sync_job_run_started_at_idx" ON "billing_sync_job_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "billing_sync_job_run_status_idx" ON "billing_sync_job_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_platform_tenant_id_uk" ON "tenant" USING btree ("platform_tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_customer_default_uk" ON "tenant" USING btree ("customer_id") WHERE "tenant"."is_default" = true;--> statement-breakpoint
CREATE INDEX "tenant_customer_id_idx" ON "tenant" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tenant_merchant_id_idx" ON "tenant" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_line_code_uk" ON "business_line" USING btree ("code");--> statement-breakpoint
CREATE INDEX "compute_task_tenant_id_idx" ON "compute_task" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "compute_task_project_id_idx" ON "compute_task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "consumption_record_project_occurred_idx" ON "consumption_record" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "consumption_record_tenant_occurred_idx" ON "consumption_record" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "consumption_record_merchant_id_idx" ON "consumption_record" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consumption_usage_daily_tenant_date_pl_uk" ON "consumption_usage_daily" USING btree ("tenant_id","usage_date","product_line");--> statement-breakpoint
CREATE INDEX "consumption_usage_daily_tenant_date_idx" ON "consumption_usage_daily" USING btree ("tenant_id","usage_date");--> statement-breakpoint
CREATE INDEX "consumption_usage_daily_tenant_month_pl_idx" ON "consumption_usage_daily" USING btree ("tenant_id","usage_month","product_line");--> statement-breakpoint
CREATE INDEX "consumption_usage_daily_merchant_date_idx" ON "consumption_usage_daily" USING btree ("merchant_id","usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_contract_no_uk" ON "contract" USING btree ("contract_no");--> statement-breakpoint
CREATE INDEX "contract_customer_id_idx" ON "contract" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "contract_project_id_idx" ON "contract" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "contract_snapshot_customer_id_idx" ON "contract_snapshot" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conversion_record_customer_id_idx" ON "conversion_record" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_code_uk" ON "coupon" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_platform_relation_id_uk" ON "coupon" USING btree ("platform_relation_id") WHERE "coupon"."platform_relation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "coupon_tenant_id_idx" ON "coupon" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "coupon_tenant_issued_idx" ON "coupon" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "coupon_status_idx" ON "coupon" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coupon_platform_template_id_idx" ON "coupon" USING btree ("platform_template_id");--> statement-breakpoint
CREATE INDEX "coupon_template_id_idx" ON "coupon" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "coupon_merchant_id_idx" ON "coupon" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "project_customer_id_idx" ON "project" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "project_primary_tenant_id_idx" ON "project" USING btree ("primary_tenant_id");--> statement-breakpoint
CREATE INDEX "project_business_line_id_idx" ON "project" USING btree ("business_line_id");--> statement-breakpoint
CREATE INDEX "project_stage_idx" ON "project" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_revenue_department_idx" ON "project" USING btree ("revenue_department");--> statement-breakpoint
CREATE INDEX "project_opportunity_source_idx" ON "project" USING btree ("opportunity_source");--> statement-breakpoint
CREATE INDEX "project_deal_closed_month_idx" ON "project" USING btree ("deal_closed_month");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_code_uk" ON "customer" USING btree ("customer_code");--> statement-breakpoint
CREATE INDEX "customer_status_idx" ON "customer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_type_idx" ON "customer" USING btree ("type");--> statement-breakpoint
CREATE INDEX "customer_contact_customer_id_idx" ON "customer_contact" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_contact_customer_sort_idx" ON "customer_contact" USING btree ("customer_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contact_primary_uk" ON "customer_contact" USING btree ("customer_id") WHERE "customer_contact"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_template_platform_id_uk" ON "discount_template" USING btree ("platform_template_id");--> statement-breakpoint
CREATE INDEX "discount_template_status_idx" ON "discount_template" USING btree ("status");--> statement-breakpoint
CREATE INDEX "engagement_comment_account_activity_id_idx" ON "engagement_comment" USING btree ("account_activity_id");--> statement-breakpoint
CREATE INDEX "engagement_document_customer_id_idx" ON "engagement_document" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "follow_up_task_customer_id_idx" ON "follow_up_task" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "follow_up_task_project_id_idx" ON "follow_up_task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "lifecycle_milestone_customer_id_idx" ON "lifecycle_milestone" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "milestone_evidence_lifecycle_milestone_id_idx" ON "milestone_evidence" USING btree ("lifecycle_milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tenant_blacklist_platform_id_uk" ON "platform_tenant_blacklist" USING btree ("platform_blacklist_id");--> statement-breakpoint
CREATE INDEX "platform_tenant_blacklist_platform_tenant_id_idx" ON "platform_tenant_blacklist" USING btree ("platform_tenant_id");--> statement-breakpoint
CREATE INDEX "platform_tenant_blacklist_status_idx" ON "platform_tenant_blacklist" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_tenant_blacklist_removed_at_idx" ON "platform_tenant_blacklist" USING btree ("removed_at");--> statement-breakpoint
CREATE INDEX "platform_tenant_blacklist_platform_updated_at_idx" ON "platform_tenant_blacklist" USING btree ("platform_updated_at");--> statement-breakpoint
CREATE INDEX "project_activity_project_id_idx" ON "project_activity" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_activity_attachment_activity_id_idx" ON "project_activity_attachment" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_conversion_setting_project_id_uk" ON "project_conversion_setting" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_conversion_setting_conversion_date_idx" ON "project_conversion_setting" USING btree ("conversion_date");--> statement-breakpoint
CREATE UNIQUE INDEX "project_opportunity_source_assignment_current_uk" ON "project_opportunity_source_assignment" USING btree ("project_id") WHERE "project_opportunity_source_assignment"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "project_opportunity_source_assignment_project_id_idx" ON "project_opportunity_source_assignment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_opportunity_source_assignment_effective_from_idx" ON "project_opportunity_source_assignment" USING btree ("project_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "project_revenue_department_assignment_current_uk" ON "project_revenue_department_assignment" USING btree ("project_id") WHERE "project_revenue_department_assignment"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "project_revenue_department_assignment_project_id_idx" ON "project_revenue_department_assignment" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_revenue_department_assignment_effective_from_idx" ON "project_revenue_department_assignment" USING btree ("project_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "project_staff_assignment_current_role_uk" ON "project_staff_assignment" USING btree ("project_id","role_type") WHERE "project_staff_assignment"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "project_staff_assignment_user_staff_id_idx" ON "project_staff_assignment" USING btree ("user_staff_id");--> statement-breakpoint
CREATE INDEX "project_staff_assignment_project_id_idx" ON "project_staff_assignment" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_tag_name_uk" ON "project_tag" USING btree ("name");--> statement-breakpoint
CREATE INDEX "project_tag_assignment_tag_id_idx" ON "project_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_tenant_project_tenant_uk" ON "project_tenant" USING btree ("project_id","tenant_id");--> statement-breakpoint
CREATE INDEX "project_tenant_tenant_id_idx" ON "project_tenant" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recharge_transaction_id_uk" ON "recharge" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "recharge_tenant_id_idx" ON "recharge" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recharge_project_id_idx" ON "recharge" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "recharge_merchant_id_idx" ON "recharge" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "recharge_order_tenant_id_idx" ON "recharge_order" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_balance_snapshot_uk" ON "tenant_balance_snapshot" USING btree ("tenant_id","granularity","bucket_start");--> statement-breakpoint
CREATE INDEX "tenant_balance_snapshot_tenant_date_idx" ON "tenant_balance_snapshot" USING btree ("tenant_id","bucket_date");--> statement-breakpoint
CREATE INDEX "tenant_balance_snapshot_granularity_date_idx" ON "tenant_balance_snapshot" USING btree ("granularity","bucket_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_bill_tenant_month_uk" ON "tenant_bill" USING btree ("tenant_id","bill_month");--> statement-breakpoint
CREATE INDEX "tenant_bill_tenant_id_idx" ON "tenant_bill" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_bill_merchant_month_idx" ON "tenant_bill" USING btree ("merchant_id","bill_month");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_bill_daily_tenant_date_uk" ON "tenant_bill_daily" USING btree ("tenant_id","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_tenant_month_idx" ON "tenant_bill_daily" USING btree ("tenant_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_usage_date_idx" ON "tenant_bill_daily" USING btree ("usage_date");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_merchant_date_idx" ON "tenant_bill_daily" USING btree ("merchant_id","usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_bill_daily_detail_bill_pl_uk" ON "tenant_bill_daily_detail" USING btree ("daily_bill_id","product_line");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_detail_tenant_date_idx" ON "tenant_bill_daily_detail" USING btree ("tenant_id","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_detail_tenant_month_pl_idx" ON "tenant_bill_daily_detail" USING btree ("tenant_id","usage_month","product_line");--> statement-breakpoint
CREATE INDEX "tenant_bill_daily_detail_merchant_date_idx" ON "tenant_bill_daily_detail" USING btree ("merchant_id","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_bill_detail_bill_id_idx" ON "tenant_bill_detail" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "tenant_bill_detail_merchant_id_idx" ON "tenant_bill_detail" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "tenant_bill_detail_price_source_idx" ON "tenant_bill_detail" USING btree ("merchant_id","price_source");--> statement-breakpoint
CREATE INDEX "tenant_blacklist_sync_job_run_started_at_idx" ON "tenant_blacklist_sync_job_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "tenant_blacklist_sync_job_run_status_idx" ON "tenant_blacklist_sync_job_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_consumption_daily_detail_idempotency_uk" ON "tenant_consumption_daily_detail" USING btree ("platform_idempotency_key");--> statement-breakpoint
CREATE INDEX "tenant_consumption_daily_detail_tenant_date_pl_idx" ON "tenant_consumption_daily_detail" USING btree ("tenant_id","usage_date","product_line");--> statement-breakpoint
CREATE INDEX "tenant_consumption_daily_detail_tenant_month_pl_idx" ON "tenant_consumption_daily_detail" USING btree ("tenant_id","usage_month","product_line");--> statement-breakpoint
CREATE INDEX "tenant_consumption_daily_detail_merchant_date_idx" ON "tenant_consumption_daily_detail" USING btree ("merchant_id","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_consumption_daily_detail_pricing_status_idx" ON "tenant_consumption_daily_detail" USING btree ("pricing_resolve_status","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_contact_tenant_id_idx" ON "tenant_contact" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_contact_tenant_sort_idx" ON "tenant_contact" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_contact_primary_uk" ON "tenant_contact" USING btree ("tenant_id") WHERE "tenant_contact"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_region_gpu_consumption_daily_uk" ON "tenant_region_gpu_consumption_daily" USING btree ("tenant_platform_id","usage_date","region_code","gpu_model","product_line");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_product_line_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("usage_month","product_line");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_tenant_date_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("tenant_id","usage_date");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_tenant_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("tenant_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_platform_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("tenant_platform_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_am_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("account_manager_staff_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_incentive_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("customer_incentive_type","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_dc_month_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("data_center_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_daily_pricing_status_idx" ON "tenant_region_gpu_consumption_daily" USING btree ("pricing_resolve_status","usage_month");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_region_gpu_consumption_monthly_uk" ON "tenant_region_gpu_consumption_monthly" USING btree ("tenant_platform_id","usage_month","region_code","gpu_model","product_line");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_monthly_product_line_month_idx" ON "tenant_region_gpu_consumption_monthly" USING btree ("usage_month","product_line");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_monthly_tenant_month_idx" ON "tenant_region_gpu_consumption_monthly" USING btree ("tenant_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_monthly_platform_month_idx" ON "tenant_region_gpu_consumption_monthly" USING btree ("tenant_platform_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_monthly_am_month_idx" ON "tenant_region_gpu_consumption_monthly" USING btree ("account_manager_staff_id","usage_month");--> statement-breakpoint
CREATE INDEX "tenant_region_gpu_consumption_monthly_dc_month_idx" ON "tenant_region_gpu_consumption_monthly" USING btree ("data_center_id","usage_month");--> statement-breakpoint
CREATE INDEX "test_voucher_issue_customer_id_idx" ON "test_voucher_issue" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_employee_no_uk" ON "user_staff" USING btree ("employee_no");--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_email_uk" ON "user_staff" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_staff_status_idx" ON "user_staff" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_default_pre_sales_uk" ON "user_staff" USING btree ("is_default_pre_sales") WHERE "user_staff"."is_default_pre_sales" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_default_account_manager_uk" ON "user_staff" USING btree ("is_default_account_manager") WHERE "user_staff"."is_default_account_manager" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_default_delivery_manager_uk" ON "user_staff" USING btree ("is_default_delivery_manager") WHERE "user_staff"."is_default_delivery_manager" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_default_project_manager_uk" ON "user_staff" USING btree ("is_default_project_manager") WHERE "user_staff"."is_default_project_manager" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "user_staff_auth_user_id_uk" ON "user_staff" USING btree ("auth_user_id") WHERE "user_staff"."auth_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_period_code_uk" ON "billing_period" USING btree ("period_code");--> statement-breakpoint
CREATE INDEX "billing_period_status_idx" ON "billing_period" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_period_period_start_idx" ON "billing_period" USING btree ("period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_agg_customer_consumption_uk" ON "billing_period_agg_customer_consumption" USING btree ("billing_period_id","tenant_platform_id","project_id");--> statement-breakpoint
CREATE INDEX "billing_period_agg_customer_consumption_period_id_idx" ON "billing_period_agg_customer_consumption" USING btree ("billing_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_import_batch_period_customer_uk" ON "billing_period_import_batch" USING btree ("billing_period_id") WHERE "billing_period_import_batch"."file_type" = 'customer_consumption';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_import_batch_period_baremetal_uk" ON "billing_period_import_batch" USING btree ("billing_period_id") WHERE "billing_period_import_batch"."file_type" = 'baremetal_order';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_import_batch_period_tenant_window_uk" ON "billing_period_import_batch" USING btree ("billing_period_id","window_id") WHERE "billing_period_import_batch"."file_type" = 'tenant_bill';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_import_batch_period_personal_tenant_bill_uk" ON "billing_period_import_batch" USING btree ("billing_period_id") WHERE "billing_period_import_batch"."file_type" = 'personal_tenant_bill';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_import_batch_period_personal_baremetal_uk" ON "billing_period_import_batch" USING btree ("billing_period_id") WHERE "billing_period_import_batch"."file_type" = 'personal_baremetal_order';--> statement-breakpoint
CREATE INDEX "billing_period_import_batch_period_id_idx" ON "billing_period_import_batch" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "billing_period_import_batch_window_id_idx" ON "billing_period_import_batch" USING btree ("window_id");--> statement-breakpoint
CREATE INDEX "billing_period_operation_log_period_id_idx" ON "billing_period_operation_log" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "billing_period_operation_log_operation_idx" ON "billing_period_operation_log" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "billing_period_operation_log_created_at_idx" ON "billing_period_operation_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_personal_income_summary_period_kind_uk" ON "billing_period_personal_income_summary" USING btree ("billing_period_id","summary_kind");--> statement-breakpoint
CREATE INDEX "billing_period_personal_income_summary_period_id_idx" ON "billing_period_personal_income_summary" USING btree ("billing_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_personal_income_tenant_line_period_tenant_uk" ON "billing_period_personal_income_tenant_line" USING btree ("billing_period_id","platform_tenant_id");--> statement-breakpoint
CREATE INDEX "billing_period_personal_income_tenant_line_period_segment_idx" ON "billing_period_personal_income_tenant_line" USING btree ("billing_period_id","segment");--> statement-breakpoint
CREATE INDEX "billing_period_raw_baremetal_order_batch_id_idx" ON "billing_period_raw_baremetal_order" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_baremetal_order_tenant_idx" ON "billing_period_raw_baremetal_order" USING btree ("tenant_platform_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_baremetal_order_ordered_at_idx" ON "billing_period_raw_baremetal_order" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "billing_period_raw_customer_consumption_batch_id_idx" ON "billing_period_raw_customer_consumption" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_customer_consumption_tenant_idx" ON "billing_period_raw_customer_consumption" USING btree ("tenant_platform_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_tenant_bill_batch_id_idx" ON "billing_period_raw_tenant_bill" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_tenant_bill_tenant_idx" ON "billing_period_raw_tenant_bill" USING btree ("tenant_platform_id");--> statement-breakpoint
CREATE INDEX "billing_period_raw_tenant_bill_region_gpu_idx" ON "billing_period_raw_tenant_bill" USING btree ("region_code","gpu_model");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_reconciliation_report_period_uk" ON "billing_period_reconciliation_report" USING btree ("billing_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_tenant_bill_window_uk" ON "billing_period_tenant_bill_window" USING btree ("billing_period_id","window_start","window_end");--> statement-breakpoint
CREATE INDEX "billing_period_tenant_bill_window_period_id_idx" ON "billing_period_tenant_bill_window" USING btree ("billing_period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_period_tenant_project_enrichment_uk" ON "billing_period_tenant_project_enrichment" USING btree ("billing_period_id","tenant_platform_id","project_id");--> statement-breakpoint
CREATE INDEX "billing_period_tenant_project_enrichment_period_id_idx" ON "billing_period_tenant_project_enrichment" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "billing_period_tenant_project_enrichment_tenant_id_idx" ON "billing_period_tenant_project_enrichment" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_tenant_cost_allocation_uk" ON "billing_tenant_cost_allocation" USING btree ("billing_period_id","tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "billing_tenant_cost_allocation_period_id_idx" ON "billing_tenant_cost_allocation" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "billing_tenant_cost_allocation_tenant_id_idx" ON "billing_tenant_cost_allocation" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_invoice_no_uk" ON "invoice" USING btree ("invoice_no");--> statement-breakpoint
CREATE INDEX "invoice_supplier_id_idx" ON "invoice" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoice_issued_at_idx" ON "invoice" USING btree ("issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_active_request_uk" ON "invoice" USING btree ("invoice_request_id") WHERE "invoice"."void_status" = 'normal';--> statement-breakpoint
CREATE INDEX "invoice_line_item_invoice_id_idx" ON "invoice_line_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_request_supplier_id_idx" ON "invoice_request" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoice_request_bill_monthly_id_idx" ON "invoice_request" USING btree ("bill_monthly_id");--> statement-breakpoint
CREATE INDEX "invoice_request_status_idx" ON "invoice_request" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_request_active_bill_uk" ON "invoice_request" USING btree ("bill_monthly_id") WHERE "invoice_request"."status" NOT IN ('cancelled', 'rejected');--> statement-breakpoint
CREATE INDEX "invoice_title_supplier_id_idx" ON "invoice_title" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoice_title_tax_no_idx" ON "invoice_title" USING btree ("tax_no");--> statement-breakpoint
CREATE INDEX "monthly_cost_base_line_run_idx" ON "monthly_cost_base_line" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_base_line_project_month_idx" ON "monthly_cost_base_line" USING btree ("project_id","usage_month");--> statement-breakpoint
CREATE INDEX "monthly_cost_base_line_am_month_idx" ON "monthly_cost_base_line" USING btree ("account_manager_staff_id","usage_month");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_cost_commission_line_uk" ON "monthly_cost_commission_line" USING btree ("run_id","cost_branch","account_manager_staff_id","account_manager_name","opportunity_source","customer_incentive_label");--> statement-breakpoint
CREATE INDEX "monthly_cost_commission_line_run_idx" ON "monthly_cost_commission_line" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_cost_commission_project_line_uk" ON "monthly_cost_commission_project_line" USING btree ("run_id","project_id","cost_branch","recipient_role","customer_incentive_label");--> statement-breakpoint
CREATE INDEX "monthly_cost_commission_project_line_run_idx" ON "monthly_cost_commission_project_line" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_dept_contribution_weight_month_dept_idx" ON "monthly_cost_dept_contribution_weight" USING btree ("usage_month","recipient_dept","customer_incentive_label");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_cost_dept_distribution_line_uk" ON "monthly_cost_dept_distribution_line" USING btree ("run_id","dept_pool_line_id","staff_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_dept_distribution_line_run_idx" ON "monthly_cost_dept_distribution_line" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_cost_dept_pool_line_uk" ON "monthly_cost_dept_pool_line" USING btree ("run_id","cost_branch","recipient_dept","customer_incentive_label");--> statement-breakpoint
CREATE INDEX "monthly_cost_dept_pool_line_run_idx" ON "monthly_cost_dept_pool_line" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_cost_dept_pool_project_line_uk" ON "monthly_cost_dept_pool_project_line" USING btree ("run_id","cost_branch","recipient_dept","customer_incentive_label","project_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_dept_pool_project_line_pool_idx" ON "monthly_cost_dept_pool_project_line" USING btree ("dept_pool_line_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_run_billing_period_idx" ON "monthly_cost_run" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "monthly_cost_run_usage_month_idx" ON "monthly_cost_run" USING btree ("usage_month");--> statement-breakpoint
CREATE INDEX "monthly_cost_run_period_month_idx" ON "monthly_cost_run" USING btree ("billing_period_id","usage_month");--> statement-breakpoint
CREATE INDEX "monthly_cost_run_confirmed_idx" ON "monthly_cost_run" USING btree ("billing_period_id","usage_month","confirmed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_income_monthly_period_tenant_project_uk" ON "platform_income_monthly" USING btree ("billing_period_id","tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "platform_income_monthly_billing_period_id_idx" ON "platform_income_monthly" USING btree ("billing_period_id");--> statement-breakpoint
CREATE INDEX "platform_income_monthly_tenant_platform_id_idx" ON "platform_income_monthly" USING btree ("tenant_platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_monthly_cost_snapshot_period_tenant_uk" ON "project_monthly_cost_snapshot" USING btree ("billing_period_id","tenant_platform_id");--> statement-breakpoint
CREATE INDEX "project_monthly_cost_snapshot_project_month_idx" ON "project_monthly_cost_snapshot" USING btree ("project_id","settlement_month");--> statement-breakpoint
CREATE INDEX "project_monthly_cost_snapshot_tenant_month_idx" ON "project_monthly_cost_snapshot" USING btree ("tenant_id","settlement_month");--> statement-breakpoint
CREATE INDEX "supplementary_consumption_history_income_id_idx" ON "supplementary_consumption_history" USING btree ("income_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_project_cost_current_uk" ON "tenant_project_cost" USING btree ("tenant_id","project_id") WHERE "tenant_project_cost"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "tenant_project_cost_tenant_id_idx" ON "tenant_project_cost" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_project_cost_project_id_idx" ON "tenant_project_cost" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "bt_tenant_idx" ON "balance_transaction" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bt_org_idx" ON "balance_transaction" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bt_ref_idx" ON "balance_transaction" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bt_idempotency_uk" ON "balance_transaction" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_merchant_sort_order_uq" ON "bank_account" USING btree ("merchant_id","sort_order") WHERE "bank_account"."merchant_id" is not null;--> statement-breakpoint
CREATE INDEX "bank_account_merchant_active_idx" ON "bank_account" USING btree ("merchant_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_btv_order" ON "bank_transfer_verification" USING btree ("payment_order_id");--> statement-breakpoint
CREATE INDEX "idx_btv_status" ON "bank_transfer_verification" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_btv_created" ON "bank_transfer_verification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gpu_coupon_template_idx" ON "gpu_coupon" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "gpu_coupon_org_idx" ON "gpu_coupon" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gpu_coupon_user_idx" ON "gpu_coupon" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gpu_coupon_status_idx" ON "gpu_coupon" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gpu_coupon_template_status_idx" ON "gpu_coupon_template" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gpu_coupon_usage_coupon_idx" ON "gpu_coupon_usage" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "gpu_coupon_usage_task_idx" ON "gpu_coupon_usage" USING btree ("task_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gpu_workspace_org_name_uk" ON "gpu_workspace" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "iva_org_idx" ON "identity_verification_application" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "iva_status_idx" ON "identity_verification_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "iva_type_status_idx" ON "identity_verification_application" USING btree ("type","status");--> statement-breakpoint
CREATE UNIQUE INDEX "iva_org_pending_uk" ON "identity_verification_application" USING btree ("organization_id") WHERE "identity_verification_application"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "iva_att_app_idx" ON "identity_verification_attachment" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "mca_coupon_usage_idx" ON "marketing_cost_allocation" USING btree ("coupon_usage_id");--> statement-breakpoint
CREATE INDEX "mca_bearer_idx" ON "marketing_cost_allocation" USING btree ("bearer");--> statement-breakpoint
CREATE INDEX "idx_payment_order_tenant" ON "payment_order" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_payment_order_merchant" ON "payment_order" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_payment_order_scene" ON "payment_order" USING btree ("scene","scene_order_id");--> statement-breakpoint
CREATE INDEX "idx_payment_order_status" ON "payment_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_order_created" ON "payment_order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_order_method_status" ON "payment_order" USING btree ("payment_method","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recon_date_channel" ON "payment_reconciliation" USING btree ("reconciliation_date","channel");--> statement-breakpoint
CREATE INDEX "idx_refund_order" ON "payment_refund" USING btree ("payment_order_id");--> statement-breakpoint
CREATE INDEX "idx_refund_tenant" ON "payment_refund" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_refund_status" ON "payment_refund" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_definitions_org_idx" ON "task_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_definitions_workspace_idx" ON "task_definitions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "task_instances_def_idx" ON "task_instances" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "task_instances_org_idx" ON "task_instances" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "task_instances_status_idx" ON "task_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_instances_sky_job_idx" ON "task_instances" USING btree ("sky_job_id");--> statement-breakpoint
CREATE INDEX "tenant_balance_org_idx" ON "tenant_balance" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_profiles_status_idx" ON "tenant_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_profiles_org_idx" ON "user_profiles" USING btree ("default_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_card_list_price_current_uk" ON "platform_card_list_price" USING btree ("gpu_card_type_id","product_line","billing_unit") WHERE "platform_card_list_price"."effective_to" IS NULL AND "platform_card_list_price"."status" = 'active';--> statement-breakpoint
CREATE INDEX "platform_card_list_price_gpu_card_type_id_idx" ON "platform_card_list_price" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "platform_card_list_price_product_line_idx" ON "platform_card_list_price" USING btree ("product_line");--> statement-breakpoint
CREATE INDEX "platform_card_list_price_effective_from_idx" ON "platform_card_list_price" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "platform_card_price_history_record_changed_idx" ON "platform_card_price_history" USING btree ("price_record_id","changed_at");--> statement-breakpoint
CREATE INDEX "platform_card_price_history_gpu_card_type_id_idx" ON "platform_card_price_history" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_card_price_record_uk" ON "platform_card_price_record" USING btree ("gpu_card_type_id","product_line","billing_unit");--> statement-breakpoint
CREATE INDEX "platform_card_price_record_list_price_id_idx" ON "platform_card_price_record" USING btree ("platform_card_list_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_datacenter_sell_price_current_uk" ON "supplier_datacenter_sell_price" USING btree ("supplier_id","data_center_id","gpu_card_type_id","product_line","billing_unit") WHERE "supplier_datacenter_sell_price"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "supplier_datacenter_sell_price_card_idx" ON "supplier_datacenter_sell_price" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "supplier_datacenter_sell_price_dc_card_idx" ON "supplier_datacenter_sell_price" USING btree ("data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "supplier_datacenter_sell_price_history_sell_changed_idx" ON "supplier_datacenter_sell_price_history" USING btree ("sell_price_id","changed_at");--> statement-breakpoint
CREATE INDEX "supplier_datacenter_sell_price_history_card_idx" ON "supplier_datacenter_sell_price_history" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_org_id_uk" ON "merchant" USING btree ("organization_id") WHERE organization_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_platform_merchant_id_uk" ON "merchant" USING btree ("platform_merchant_id") WHERE platform_merchant_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_code_uk" ON "merchant" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_uscc_uk" ON "merchant" USING btree ("unified_social_credit_code") WHERE unified_social_credit_code IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_is_default_uk" ON "merchant" USING btree ("is_default") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "merchant_status_idx" ON "merchant" USING btree ("status");--> statement-breakpoint
CREATE INDEX "merchant_name_idx" ON "merchant" USING btree ("name");--> statement-breakpoint
CREATE INDEX "merchant_funding_mode_idx" ON "merchant" USING btree ("funding_mode");--> statement-breakpoint
CREATE INDEX "merchant_commission_tier_idx" ON "merchant" USING btree ("commission_tier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_account_merchant_uk" ON "merchant_account" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_account_ledger_idempotency_uk" ON "merchant_account_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "merchant_account_ledger_merchant_time_idx" ON "merchant_account_ledger" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_account_ledger_ref_idx" ON "merchant_account_ledger" USING btree ("merchant_id","ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "merchant_account_ledger_trace_idx" ON "merchant_account_ledger" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "merchant_account_ledger_external_user_idx" ON "merchant_account_ledger" USING btree ("external_user_ref","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_account_manager_assignment_merchant_id_idx" ON "merchant_account_manager_assignment" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_account_manager_assignment_user_staff_id_idx" ON "merchant_account_manager_assignment" USING btree ("user_staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_account_pool_uk" ON "merchant_account_pool" USING btree ("platform_merchant_id","pool");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_account_pool_balance_uk" ON "merchant_account_pool_balance" USING btree ("merchant_id","pool");--> statement-breakpoint
CREATE INDEX "merchant_account_pool_balance_ledger_idx" ON "merchant_account_pool_balance" USING btree ("last_ledger_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_account_snapshot_merchant_at_uk" ON "merchant_account_snapshot" USING btree ("merchant_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "merchant_account_snapshot_merchant_at_idx" ON "merchant_account_snapshot" USING btree ("merchant_id","snapshot_at");--> statement-breakpoint
CREATE INDEX "merchant_account_snapshot_trigger_idx" ON "merchant_account_snapshot" USING btree ("merchant_id","trigger");--> statement-breakpoint
CREATE INDEX "merchant_activity_merchant_occurred_idx" ON "merchant_activity" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_activity_ref_idx" ON "merchant_activity" USING btree ("ref_domain","ref_id");--> statement-breakpoint
CREATE INDEX "merchant_activity_attachment_activity_id_idx" ON "merchant_activity_attachment" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_api_key_key_hash_uk" ON "merchant_api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "merchant_api_key_merchant_idx" ON "merchant_api_key" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_api_key_active_idx" ON "merchant_api_key" USING btree ("merchant_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_bill_merchant_month_uk" ON "merchant_bill" USING btree ("merchant_id","bill_month");--> statement-breakpoint
CREATE INDEX "merchant_bill_bill_month_idx" ON "merchant_bill" USING btree ("bill_month");--> statement-breakpoint
CREATE INDEX "merchant_bill_status_idx" ON "merchant_bill" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_bill_daily_merchant_date_uk" ON "merchant_bill_daily" USING btree ("merchant_id","bill_date");--> statement-breakpoint
CREATE INDEX "merchant_bill_daily_bill_date_idx" ON "merchant_bill_daily" USING btree ("bill_date");--> statement-breakpoint
CREATE INDEX "merchant_bill_daily_merchant_month_idx" ON "merchant_bill_daily" USING btree ("merchant_id","usage_month");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_bill_daily_detail_bill_pl_uk" ON "merchant_bill_daily_detail" USING btree ("daily_bill_id","product_line");--> statement-breakpoint
CREATE INDEX "merchant_bill_daily_detail_merchant_date_idx" ON "merchant_bill_daily_detail" USING btree ("merchant_id","usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_bill_detail_bill_pl_uk" ON "merchant_bill_detail" USING btree ("merchant_bill_id","product_line");--> statement-breakpoint
CREATE INDEX "merchant_bill_detail_merchant_month_idx" ON "merchant_bill_detail" USING btree ("merchant_id","bill_month");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_branding_merchant_uk" ON "merchant_branding" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_branding_custom_domain_uk" ON "merchant_branding" USING btree ("custom_domain") WHERE "merchant_branding"."custom_domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_commission_tier_code_uk" ON "merchant_commission_tier" USING btree ("tier_code");--> statement-breakpoint
CREATE INDEX "merchant_commission_tier_status_sort_idx" ON "merchant_commission_tier" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "merchant_contact_merchant_id_idx" ON "merchant_contact" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_contact_merchant_sort_idx" ON "merchant_contact" USING btree ("merchant_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_contact_primary_uk" ON "merchant_contact" USING btree ("merchant_id") WHERE "merchant_contact"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_datacenter_card_type_region_card_uk" ON "merchant_datacenter_card_type" USING btree ("merchant_datacenter_region_id","gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "merchant_datacenter_card_type_region_id_idx" ON "merchant_datacenter_card_type" USING btree ("merchant_datacenter_region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_datacenter_region_merchant_dc_active_uk" ON "merchant_datacenter_region" USING btree ("merchant_id","data_center_id") WHERE effective_to IS NULL;--> statement-breakpoint
CREATE INDEX "merchant_datacenter_region_merchant_status_idx" ON "merchant_datacenter_region" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "merchant_datacenter_region_data_center_id_idx" ON "merchant_datacenter_region" USING btree ("data_center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_external_subject_user_uk" ON "merchant_external_subject" USING btree ("merchant_id","external_user_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_external_subject_tenant_uk" ON "merchant_external_subject" USING btree ("merchant_id","platform_tenant_id");--> statement-breakpoint
CREATE INDEX "merchant_external_subject_merchant_idx" ON "merchant_external_subject" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_external_subject_platform_tenant_idx" ON "merchant_external_subject" USING btree ("platform_tenant_id");--> statement-breakpoint
CREATE INDEX "merchant_finance_config_audit_key_idx" ON "merchant_finance_config_audit_log" USING btree ("config_key","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_payment_node_merchant_sort_idx" ON "merchant_payment_node" USING btree ("merchant_id","sort_order");--> statement-breakpoint
CREATE INDEX "merchant_payment_node_merchant_status_idx" ON "merchant_payment_node" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "merchant_payment_node_bill_month_idx" ON "merchant_payment_node" USING btree ("merchant_id","bill_month");--> statement-breakpoint
CREATE INDEX "merchant_payment_node_audit_node_idx" ON "merchant_payment_node_audit_log" USING btree ("payment_node_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_payment_node_audit_merchant_idx" ON "merchant_payment_node_audit_log" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_payout_account_default_uk" ON "merchant_payout_account" USING btree ("owner_type","owner_id") WHERE "merchant_payout_account"."is_default" = true AND "merchant_payout_account"."status" = 'active';--> statement-breakpoint
CREATE INDEX "merchant_payout_account_owner_idx" ON "merchant_payout_account" USING btree ("owner_type","owner_id","status");--> statement-breakpoint
CREATE INDEX "merchant_payout_account_review_idx" ON "merchant_payout_account" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "merchant_payout_account_audit_account_idx" ON "merchant_payout_account_audit_log" USING btree ("payout_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_payout_account_audit_owner_idx" ON "merchant_payout_account_audit_log" USING btree ("owner_type","owner_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_product_purchase_price_active_uk" ON "merchant_product_purchase_price" USING btree ("merchant_id","product_line") WHERE "merchant_product_purchase_price"."effective_to" IS NULL AND "merchant_product_purchase_price"."status" = 'active';--> statement-breakpoint
CREATE INDEX "merchant_product_purchase_price_merchant_idx" ON "merchant_product_purchase_price" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_promo_attribution_merchant_occurred_idx" ON "merchant_promo_attribution" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_promo_attribution_promo_link_idx" ON "merchant_promo_attribution" USING btree ("promo_link_id");--> statement-breakpoint
CREATE INDEX "merchant_promo_attribution_tenant_idx" ON "merchant_promo_attribution" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "merchant_promo_attribution_event_type_idx" ON "merchant_promo_attribution" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_promo_link_code_uk" ON "merchant_promo_link" USING btree ("promo_code");--> statement-breakpoint
CREATE INDEX "merchant_promo_link_merchant_status_idx" ON "merchant_promo_link" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_purchase_price_active_uk" ON "merchant_purchase_price" USING btree ("merchant_id","data_center_id","gpu_card_type_id","product_line","billing_unit") WHERE "merchant_purchase_price"."effective_to" IS NULL AND "merchant_purchase_price"."status" = 'active';--> statement-breakpoint
CREATE INDEX "merchant_purchase_price_merchant_dc_idx" ON "merchant_purchase_price" USING btree ("merchant_id","data_center_id");--> statement-breakpoint
CREATE INDEX "merchant_purchase_price_gpu_card_type_id_idx" ON "merchant_purchase_price" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_purchase_price_record_uk" ON "merchant_purchase_price_record" USING btree ("merchant_id","data_center_id","gpu_card_type_id","product_line","billing_unit");--> statement-breakpoint
CREATE INDEX "merchant_purchase_price_record_merchant_id_idx" ON "merchant_purchase_price_record" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_purchase_price_record_data_center_id_idx" ON "merchant_purchase_price_record" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "merchant_recharge_attachment_recharge_id_idx" ON "merchant_recharge_attachment" USING btree ("recharge_id");--> statement-breakpoint
CREATE INDEX "merchant_recharge_audit_recharge_idx" ON "merchant_recharge_audit_log" USING btree ("recharge_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_recharge_audit_merchant_idx" ON "merchant_recharge_audit_log" USING btree ("merchant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "merchant_recharge_merchant_date_idx" ON "merchant_recharge_record" USING btree ("merchant_id","recharge_date");--> statement-breakpoint
CREATE INDEX "merchant_recharge_merchant_status_idx" ON "merchant_recharge_record" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "merchant_recharge_payment_node_idx" ON "merchant_recharge_record" USING btree ("payment_node_id");--> statement-breakpoint
CREATE INDEX "merchant_recharge_bill_month_idx" ON "merchant_recharge_record" USING btree ("merchant_id","bill_month");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_recon_diff_date_uk" ON "merchant_recon_diff" USING btree ("statement_id","recon_date");--> statement-breakpoint
CREATE INDEX "merchant_recon_diff_status_idx" ON "merchant_recon_diff" USING btree ("status","recon_date");--> statement-breakpoint
CREATE INDEX "merchant_recon_diff_merchant_date_idx" ON "merchant_recon_diff" USING btree ("merchant_id","recon_date");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_recon_statement_period_uk" ON "merchant_recon_statement" USING btree ("merchant_id","period_type","period_start");--> statement-breakpoint
CREATE INDEX "merchant_recon_statement_status_idx" ON "merchant_recon_statement" USING btree ("status","period_end");--> statement-breakpoint
CREATE INDEX "merchant_recon_statement_merchant_idx" ON "merchant_recon_statement" USING btree ("merchant_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_sales_price_active_uk" ON "merchant_sales_price" USING btree ("merchant_id","data_center_id","gpu_card_type_id","product_line","billing_unit") WHERE "merchant_sales_price"."effective_to" IS NULL AND "merchant_sales_price"."status" = 'active';--> statement-breakpoint
CREATE INDEX "merchant_sales_price_merchant_dc_idx" ON "merchant_sales_price" USING btree ("merchant_id","data_center_id");--> statement-breakpoint
CREATE INDEX "merchant_sales_price_gpu_card_type_id_idx" ON "merchant_sales_price" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "merchant_site_message_merchant_created_idx" ON "merchant_site_message" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "merchant_site_message_merchant_read_idx" ON "merchant_site_message" USING btree ("merchant_id","read");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_tenant_contribution_uk" ON "merchant_tenant_contribution" USING btree ("merchant_id","tenant_id");--> statement-breakpoint
CREATE INDEX "merchant_tenant_contribution_merchant_idx" ON "merchant_tenant_contribution" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_tenant_contribution_tenant_idx" ON "merchant_tenant_contribution" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_condition_sheet_contract_version_uk" ON "access_condition_sheet" USING btree ("contract_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "access_condition_sheet_current_uk" ON "access_condition_sheet" USING btree ("contract_id") WHERE "access_condition_sheet"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_registry_agent_id_uk" ON "agent_registry" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_registry_data_center_id_idx" ON "agent_registry" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "agent_registry_status_idx" ON "agent_registry" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bare_metal_order_platform_order_id_uk" ON "bare_metal_order" USING btree ("platform_order_id") WHERE "bare_metal_order"."platform_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bare_metal_order_order_no_uk" ON "bare_metal_order" USING btree ("order_no") WHERE "bare_metal_order"."order_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bare_metal_order_tenant_ordered_idx" ON "bare_metal_order" USING btree ("tenant_id","ordered_at");--> statement-breakpoint
CREATE INDEX "bare_metal_order_project_ordered_idx" ON "bare_metal_order" USING btree ("project_id","ordered_at");--> statement-breakpoint
CREATE INDEX "bare_metal_order_data_center_idx" ON "bare_metal_order" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_status_idx" ON "bare_metal_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bare_metal_order_order_mark_idx" ON "bare_metal_order" USING btree ("order_mark");--> statement-breakpoint
CREATE INDEX "bare_metal_order_ordered_at_idx" ON "bare_metal_order" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "bare_metal_order_imported_at_idx" ON "bare_metal_order" USING btree ("imported_at");--> statement-breakpoint
CREATE INDEX "bare_metal_order_merchant_ordered_idx" ON "bare_metal_order" USING btree ("merchant_id","ordered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bare_metal_order_device_order_line_uk" ON "bare_metal_order_device" USING btree ("bare_metal_order_id","line_no");--> statement-breakpoint
CREATE INDEX "bare_metal_order_device_order_id_idx" ON "bare_metal_order_device" USING btree ("bare_metal_order_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_device_supplier_device_idx" ON "bare_metal_order_device" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bare_metal_order_device_supplier_device_active_uk" ON "bare_metal_order_device" USING btree ("supplier_device_id") WHERE "bare_metal_order_device"."supplier_device_id" IS NOT NULL AND "bare_metal_order_device"."allocation_status" <> 'released';--> statement-breakpoint
CREATE UNIQUE INDEX "bare_metal_order_device_platform_device_uk" ON "bare_metal_order_device" USING btree ("platform_device_id") WHERE "bare_metal_order_device"."platform_device_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bare_metal_order_device_gpu_card_type_idx" ON "bare_metal_order_device" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_import_batch_project_id_idx" ON "bare_metal_order_import_batch" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_import_batch_tenant_id_idx" ON "bare_metal_order_import_batch" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_log_order_idx" ON "bare_metal_order_log" USING btree ("bare_metal_order_id");--> statement-breakpoint
CREATE INDEX "bare_metal_order_log_order_occurred_idx" ON "bare_metal_order_log" USING btree ("bare_metal_order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bare_metal_order_log_event_type_idx" ON "bare_metal_order_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "bare_metal_order_price_snapshot_order_idx" ON "bare_metal_order_price_snapshot" USING btree ("bare_metal_order_id");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_item_job_run_id_idx" ON "bare_metal_sync_job_item" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_item_platform_tenant_id_idx" ON "bare_metal_sync_job_item" USING btree ("platform_tenant_id");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_item_job_phase_status_idx" ON "bare_metal_sync_job_item" USING btree ("job_run_id","phase","status");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_item_phase_status_resolved_idx" ON "bare_metal_sync_job_item" USING btree ("phase","status","resolved_at");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_item_platform_order_id_idx" ON "bare_metal_sync_job_item" USING btree ("platform_order_id") WHERE "bare_metal_sync_job_item"."platform_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_run_started_at_idx" ON "bare_metal_sync_job_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "bare_metal_sync_job_run_status_idx" ON "bare_metal_sync_job_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compute_node_supplier_device_id_idx" ON "compute_node" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "compute_node_cluster_id_idx" ON "compute_node" USING btree ("cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_center_supplier_code_uk" ON "data_center" USING btree ("supplier_id","code");--> statement-breakpoint
CREATE INDEX "data_center_supplier_id_idx" ON "data_center" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "data_center_status_idx" ON "data_center" USING btree ("status");--> statement-breakpoint
CREATE INDEX "data_center_cooperation_status_idx" ON "data_center" USING btree ("cooperation_status");--> statement-breakpoint
CREATE INDEX "data_center_supplier_external_onboarding_id_idx" ON "data_center" USING btree ("supplier_id","external_onboarding_id");--> statement-breakpoint
CREATE INDEX "device_onboarding_policy_name_idx" ON "device_onboarding_policy" USING btree ("name");--> statement-breakpoint
CREATE INDEX "device_onboarding_policy_created_by_idx" ON "device_onboarding_policy" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "device_onboarding_policy_batch_uk" ON "device_onboarding_policy_batch" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "device_onboarding_policy_batch_policy_id_idx" ON "device_onboarding_policy_batch" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "device_onboarding_task_device_id_idx" ON "device_onboarding_task" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "device_onboarding_task_batch_id_idx" ON "device_onboarding_task" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "device_onboarding_task_stage_idx" ON "device_onboarding_task" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "device_onboarding_task_agent_id_idx" ON "device_onboarding_task" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_platform_orphan_import_batch_code_uk" ON "device_platform_orphan_import_batch" USING btree ("batch_code");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_batch_snapshot_hour_idx" ON "device_platform_orphan_import_batch" USING btree ("snapshot_hour");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_batch_status_idx" ON "device_platform_orphan_import_batch" USING btree ("status");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_link_batch_idx" ON "device_platform_orphan_import_link" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_link_probe_idx" ON "device_platform_orphan_import_link" USING btree ("probe_snapshot_id");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_link_device_idx" ON "device_platform_orphan_import_link" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_rule_enabled_priority_idx" ON "device_platform_orphan_import_rule" USING btree ("enabled","priority");--> statement-breakpoint
CREATE INDEX "device_platform_orphan_import_rule_target_dc_idx" ON "device_platform_orphan_import_rule" USING btree ("target_data_center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_platform_orphan_import_rule_match_uk" ON "device_platform_orphan_import_rule" USING btree (coalesce("supplier_id", ''),"match_field","match_operator","match_value") WHERE "device_platform_orphan_import_rule"."enabled" = true;--> statement-breakpoint
CREATE INDEX "device_platform_probe_job_run_started_at_idx" ON "device_platform_probe_job_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "device_platform_probe_job_run_status_idx" ON "device_platform_probe_job_run" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "device_platform_probe_snapshot_crm_uk" ON "device_platform_probe_snapshot" USING btree ("supplier_device_id","snapshot_hour") WHERE record_kind = 'crm_inventory' AND supplier_device_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "device_platform_probe_snapshot_orphan_uk" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","orphan_merge_key") WHERE record_kind = 'platform_orphan' AND orphan_merge_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_hour_record_kind_idx" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","record_kind");--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_hour_supplier_idx" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","supplier_id");--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_hour_dc_idx" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","data_center_id");--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_hour_probe_status_idx" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","probe_status");--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_hour_consistency_idx" ON "device_platform_probe_snapshot" USING btree ("snapshot_hour","consistency_flag");--> statement-breakpoint
CREATE INDEX "device_platform_probe_snapshot_device_hour_desc_idx" ON "device_platform_probe_snapshot" USING btree ("supplier_device_id","snapshot_hour");--> statement-breakpoint
CREATE INDEX "entity_state_transition_log_entity_idx" ON "entity_state_transition_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "fault_incident_supplier_id_opened_idx" ON "fault_incident" USING btree ("supplier_id","opened_at");--> statement-breakpoint
CREATE INDEX "fault_incident_supplier_device_id_idx" ON "fault_incident" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "fault_incident_compute_node_id_idx" ON "fault_incident" USING btree ("compute_node_id");--> statement-breakpoint
CREATE INDEX "fault_incident_ops_upload_batch_id_idx" ON "fault_incident" USING btree ("supplier_ops_upload_batch_id");--> statement-breakpoint
CREATE INDEX "fault_incident_fault_type_idx" ON "fault_incident" USING btree ("fault_type");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_node_dc_name_uk" ON "gateway_node" USING btree ("data_center_id","name");--> statement-breakpoint
CREATE INDEX "gateway_node_supplier_id_idx" ON "gateway_node" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "gateway_node_status_idx" ON "gateway_node" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gateway_node_health_status_idx" ON "gateway_node" USING btree ("health_status");--> statement-breakpoint
CREATE UNIQUE INDEX "gpu_card_type_name_uk" ON "gpu_card_type" USING btree ("name");--> statement-breakpoint
CREATE INDEX "internal_test_hold_supplier_device_id_idx" ON "internal_test_hold" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "internal_test_hold_inventory_id_idx" ON "internal_test_hold" USING btree ("supplier_gpu_inventory_id");--> statement-breakpoint
CREATE INDEX "internal_test_hold_supplier_id_idx" ON "internal_test_hold" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "internal_test_hold_data_center_id_idx" ON "internal_test_hold" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "internal_test_hold_work_order_no_idx" ON "internal_test_hold" USING btree ("work_order_no");--> statement-breakpoint
CREATE INDEX "internal_test_hold_onboarding_batch_id_idx" ON "internal_test_hold" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_test_hold_device_link_uk" ON "internal_test_hold_device_link" USING btree ("hold_id","supplier_device_id");--> statement-breakpoint
CREATE INDEX "internal_test_hold_device_link_hold_id_idx" ON "internal_test_hold_device_link" USING btree ("hold_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_state_definition_uk" ON "lifecycle_state_definition" USING btree ("domain","state_code");--> statement-breakpoint
CREATE INDEX "lifecycle_state_definition_domain_idx" ON "lifecycle_state_definition" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_batch_code_uk" ON "onboarding_batch" USING btree ("batch_code");--> statement-breakpoint
CREATE INDEX "onboarding_batch_supplier_id_idx" ON "onboarding_batch" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_data_center_id_idx" ON "onboarding_batch" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_idc_code_idx" ON "onboarding_batch" USING btree ("idc_code");--> statement-breakpoint
CREATE INDEX "onboarding_batch_contract_id_idx" ON "onboarding_batch" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_status_idx" ON "onboarding_batch" USING btree ("batch_status");--> statement-breakpoint
CREATE INDEX "onboarding_batch_import_status_idx" ON "onboarding_batch" USING btree ("import_status");--> statement-breakpoint
CREATE INDEX "onboarding_batch_supplier_dc_created_idx" ON "onboarding_batch" USING btree ("supplier_id","data_center_id","created_at");--> statement-breakpoint
CREATE INDEX "onboarding_batch_work_order_no_idx" ON "onboarding_batch" USING btree ("work_order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_batch_supplier_work_order_uk" ON "onboarding_batch" USING btree ("supplier_id","work_order_no") WHERE "onboarding_batch"."work_order_no" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "onboarding_batch_parent_batch_id_idx" ON "onboarding_batch" USING btree ("parent_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_batch_device_link_uk" ON "onboarding_batch_device_link" USING btree ("business_onboarding_batch_id","supplier_device_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_device_link_batch_id_idx" ON "onboarding_batch_device_link" USING btree ("business_onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_device_link_device_linked_idx" ON "onboarding_batch_device_link" USING btree ("supplier_device_id","linked_at");--> statement-breakpoint
CREATE INDEX "onboarding_batch_device_link_batch_card_coop_idx" ON "onboarding_batch_device_link" USING btree ("business_onboarding_batch_id","gpu_card_type_id","cooperation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_batch_import_row_uk" ON "onboarding_batch_import_row" USING btree ("onboarding_batch_id","row_no");--> statement-breakpoint
CREATE INDEX "onboarding_batch_import_row_batch_id_idx" ON "onboarding_batch_import_row" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_import_row_parse_status_idx" ON "onboarding_batch_import_row" USING btree ("parse_status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_batch_plan_line_uk" ON "onboarding_batch_plan_line" USING btree ("onboarding_batch_id","gpu_card_type_id","cooperation_type");--> statement-breakpoint
CREATE INDEX "onboarding_batch_plan_line_batch_id_idx" ON "onboarding_batch_plan_line" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "onboarding_batch_progress_event_batch_occurred_idx" ON "onboarding_batch_progress_event" USING btree ("onboarding_batch_id","occurred_at");--> statement-breakpoint
CREATE INDEX "onboarding_batch_progress_event_occurred_idx" ON "onboarding_batch_progress_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "onboarding_batch_progress_event_kind_occurred_idx" ON "onboarding_batch_progress_event" USING btree ("batch_kind","occurred_at");--> statement-breakpoint
CREATE INDEX "onboarding_batch_progress_event_supplier_dc_occurred_idx" ON "onboarding_batch_progress_event" USING btree ("supplier_id","data_center_id","occurred_at");--> statement-breakpoint
CREATE INDEX "onboarding_task_batch_id_idx" ON "onboarding_task" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "resource_pool_binding_supplier_device_id_idx" ON "resource_pool_binding" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_code_uk" ON "supplier" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_org_id_uk" ON "supplier" USING btree ("organization_id") WHERE organization_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_external_tenant_id_uk" ON "supplier" USING btree ("external_tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_external_onboarding_id_uk" ON "supplier" USING btree ("external_onboarding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_platform_tenant_id_uk" ON "supplier" USING btree ("platform_tenant_id");--> statement-breakpoint
CREATE INDEX "supplier_status_idx" ON "supplier" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_business_manager_staff_id_idx" ON "supplier" USING btree ("business_manager_staff_id");--> statement-breakpoint
CREATE INDEX "supplier_identity_no_idx" ON "supplier" USING btree ("identity_no");--> statement-breakpoint
CREATE INDEX "supplier_activity_supplier_occurred_idx" ON "supplier_activity" USING btree ("supplier_id","occurred_at");--> statement-breakpoint
CREATE INDEX "supplier_activity_ref_idx" ON "supplier_activity" USING btree ("ref_domain","ref_id");--> statement-breakpoint
CREATE INDEX "supplier_activity_attachment_activity_id_idx" ON "supplier_activity_attachment" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_activity_type_definition_code_uk" ON "supplier_activity_type_definition" USING btree ("type_code");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_api_key_key_hash_uk" ON "supplier_api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "supplier_api_key_org_idx" ON "supplier_api_key" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "supplier_api_key_org_active_idx" ON "supplier_api_key" USING btree ("organization_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bill_supplier_month_uk" ON "supplier_bill" USING btree ("supplier_id","bill_month");--> statement-breakpoint
CREATE INDEX "supplier_bill_supplier_id_idx" ON "supplier_bill" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_bill_status_due_date_idx" ON "supplier_bill" USING btree ("status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bill_daily_uk" ON "supplier_bill_daily" USING btree ("supplier_id","data_center_id","usage_date");--> statement-breakpoint
CREATE INDEX "supplier_bill_daily_supplier_month_idx" ON "supplier_bill_daily" USING btree ("supplier_id","usage_month");--> statement-breakpoint
CREATE INDEX "supplier_bill_daily_date_idx" ON "supplier_bill_daily" USING btree ("usage_date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bill_daily_detail_uk" ON "supplier_bill_daily_detail" USING btree ("daily_bill_id","gpu_card_type_id",coalesce("device_id", ''));--> statement-breakpoint
CREATE INDEX "supplier_bill_daily_detail_bill_idx" ON "supplier_bill_daily_detail" USING btree ("daily_bill_id");--> statement-breakpoint
CREATE INDEX "supplier_bill_daily_detail_device_idx" ON "supplier_bill_daily_detail" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "supplier_bill_detail_bill_id_idx" ON "supplier_bill_detail" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_card_list_price_current_uk" ON "supplier_card_list_price" USING btree ("supplier_id","data_center_id","gpu_card_type_id") WHERE "supplier_card_list_price"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "supplier_card_list_price_supplier_id_idx" ON "supplier_card_list_price" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_card_list_price_dc_card_idx" ON "supplier_card_list_price" USING btree ("data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contract_no_uk" ON "supplier_contract" USING btree ("contract_no");--> statement-breakpoint
CREATE INDEX "supplier_contract_supplier_id_idx" ON "supplier_contract" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_contract_status_idx" ON "supplier_contract" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_contract_pricing_mode_idx" ON "supplier_contract" USING btree ("pricing_mode");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contract_capacity_line_bitable_record_uk" ON "supplier_contract_capacity_line" USING btree ("bitable_record_id") WHERE "supplier_contract_capacity_line"."bitable_record_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contract_capacity_line_scope_uk" ON "supplier_contract_capacity_line" USING btree ("contract_id","data_center_id","gpu_card_type_id","start_date");--> statement-breakpoint
CREATE INDEX "supplier_contract_capacity_line_contract_id_idx" ON "supplier_contract_capacity_line" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "supplier_contract_capacity_line_dc_card_dates_idx" ON "supplier_contract_capacity_line" USING btree ("data_center_id","gpu_card_type_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "supplier_contract_capacity_line_line_status_idx" ON "supplier_contract_capacity_line" USING btree ("line_status");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_datacenter_card_type_spec_uk" ON "supplier_datacenter_card_type_spec" USING btree ("data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "supplier_datacenter_card_type_spec_card_idx" ON "supplier_datacenter_card_type_spec" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_datacenter_infrastructure_uk" ON "supplier_datacenter_infrastructure" USING btree ("data_center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_device_sn_uk" ON "supplier_device" USING btree ("sn");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_device_asset_no_uk" ON "supplier_device" USING btree ("asset_no");--> statement-breakpoint
CREATE INDEX "supplier_device_supplier_id_idx" ON "supplier_device" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_device_onboarding_batch_id_idx" ON "supplier_device" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "supplier_device_data_center_id_idx" ON "supplier_device" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "supplier_device_lifecycle_status_idx" ON "supplier_device" USING btree ("lifecycle_status");--> statement-breakpoint
CREATE INDEX "supplier_device_idc_code_idx" ON "supplier_device" USING btree ("idc_code");--> statement-breakpoint
CREATE INDEX "supplier_device_ops_status_idx" ON "supplier_device" USING btree ("ops_status");--> statement-breakpoint
CREATE INDEX "supplier_device_in_maintenance_idx" ON "supplier_device" USING btree ("in_maintenance");--> statement-breakpoint
CREATE INDEX "supplier_device_listing_disabled_idx" ON "supplier_device" USING btree ("listing_disabled");--> statement-breakpoint
CREATE INDEX "supplier_device_external_device_id_idx" ON "supplier_device" USING btree ("external_device_id");--> statement-breakpoint
CREATE INDEX "supplier_device_cooperation_type_idx" ON "supplier_device" USING btree ("cooperation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_device_change_log_batch_row_uk" ON "supplier_device_change_log" USING btree ("onboarding_batch_id","import_row_no");--> statement-breakpoint
CREATE INDEX "supplier_device_change_log_device_occurred_idx" ON "supplier_device_change_log" USING btree ("supplier_device_id","occurred_at");--> statement-breakpoint
CREATE INDEX "supplier_device_change_log_batch_id_idx" ON "supplier_device_change_log" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "supplier_device_change_log_ticket_no_idx" ON "supplier_device_change_log" USING btree ("ticket_no");--> statement-breakpoint
CREATE INDEX "supplier_device_change_log_business_batch_id_idx" ON "supplier_device_change_log" USING btree ("business_onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "supplier_device_change_log_business_device_idx" ON "supplier_device_change_log" USING btree ("business_onboarding_batch_id","supplier_device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_gpu_inventory_uk" ON "supplier_gpu_inventory" USING btree ("supplier_id","data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_notification_pref_uk" ON "supplier_notification_preference" USING btree ("user_id","channel","event");--> statement-breakpoint
CREATE INDEX "supplier_notification_pref_user_idx" ON "supplier_notification_preference" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supplier_ops_engineer_supplier_id_idx" ON "supplier_ops_engineer" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_ops_engineer_data_center_id_idx" ON "supplier_ops_engineer" USING btree ("data_center_id");--> statement-breakpoint
CREATE INDEX "supplier_ops_engineer_data_center_sort_idx" ON "supplier_ops_engineer" USING btree ("data_center_id","sort_order");--> statement-breakpoint
CREATE INDEX "supplier_ops_upload_batch_supplier_id_idx" ON "supplier_ops_upload_batch" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_ops_upload_batch_onboarding_batch_id_idx" ON "supplier_ops_upload_batch" USING btree ("onboarding_batch_id");--> statement-breakpoint
CREATE INDEX "supplier_ops_upload_batch_import_status_idx" ON "supplier_ops_upload_batch" USING btree ("import_status");--> statement-breakpoint
CREATE INDEX "supplier_pricing_history_record_changed_idx" ON "supplier_pricing_history" USING btree ("pricing_record_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_pricing_record_uk" ON "supplier_pricing_record" USING btree ("supplier_id","data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_pricing_tier_uk" ON "supplier_pricing_tier" USING btree ("contract_id","tier_order","supplier_card_list_price_id");--> statement-breakpoint
CREATE INDEX "supplier_site_message_org_created_idx" ON "supplier_site_message" USING btree ("supplier_org_id","created_at");--> statement-breakpoint
CREATE INDEX "supplier_site_message_org_read_idx" ON "supplier_site_message" USING btree ("supplier_org_id","read");--> statement-breakpoint
CREATE INDEX "supplier_terms_version_supplier_id_idx" ON "supplier_terms_version" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_terms_version_contract_id_idx" ON "supplier_terms_version" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_unit_cost_current_uk" ON "supplier_unit_cost" USING btree ("supplier_terms_version_id","data_center_id","gpu_card_type_id") WHERE "supplier_unit_cost"."effective_to" IS NULL;--> statement-breakpoint
CREATE INDEX "supply_chain_lead_type_status_idx" ON "supply_chain_lead" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_owner_staff_id_idx" ON "supply_chain_lead" USING btree ("owner_staff_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_last_activity_at_idx" ON "supply_chain_lead" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_linked_supplier_id_idx" ON "supply_chain_lead" USING btree ("linked_supplier_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_converted_supplier_id_idx" ON "supply_chain_lead" USING btree ("converted_supplier_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_converted_data_center_id_idx" ON "supply_chain_lead" USING btree ("converted_data_center_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_activity_lead_occurred_idx" ON "supply_chain_lead_activity" USING btree ("lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_activity_attachment_activity_id_idx" ON "supply_chain_lead_activity_attachment" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_contact_lead_id_idx" ON "supply_chain_lead_contact" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_chain_lead_contact_primary_uk" ON "supply_chain_lead_contact" USING btree ("lead_id","contact_role") WHERE "supply_chain_lead_contact"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "supply_chain_lead_gpu_snapshot_lead_card_uk" ON "supply_chain_lead_gpu_snapshot" USING btree ("lead_id","card_type_name");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_gpu_snapshot_lead_id_idx" ON "supply_chain_lead_gpu_snapshot" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_gpu_snapshot_card_type_id_idx" ON "supply_chain_lead_gpu_snapshot" USING btree ("gpu_card_type_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_import_batch_config_idx" ON "supply_chain_lead_import_batch" USING btree ("bitable_config_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_import_batch_created_idx" ON "supply_chain_lead_import_batch" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_import_batch_item_batch_idx" ON "supply_chain_lead_import_batch_item" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_chain_lead_tag_name_uk" ON "supply_chain_lead_tag" USING btree ("name");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_tag_assignment_tag_id_idx" ON "supply_chain_lead_tag_assignment" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_external_link_domain_ref_type_uk" ON "feishu_external_link" USING btree ("domain","ref_id","external_type");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_external_link_type_id_uk" ON "feishu_external_link" USING btree ("external_type","external_id");--> statement-breakpoint
CREATE INDEX "feishu_external_link_ref_idx" ON "feishu_external_link" USING btree ("domain","ref_id");--> statement-breakpoint
CREATE INDEX "feishu_integration_job_run_kind_started_idx" ON "feishu_integration_job_run" USING btree ("job_kind","started_at");--> statement-breakpoint
CREATE INDEX "feishu_integration_job_run_ref_idx" ON "feishu_integration_job_run" USING btree ("ref_domain","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feishu_webhook_event_idempotency_uk" ON "feishu_webhook_event" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "supply_chain_lead_bitable_sync_config_enabled_idx" ON "supply_chain_lead_bitable_sync_config" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "das_device_uk" ON "device_availability_snapshot" USING btree ("supplier_device_id");--> statement-breakpoint
CREATE INDEX "das_pool_allocatable_idx" ON "device_availability_snapshot" USING btree ("pool","allocatable_gpu_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "das_card_dc_idx" ON "device_availability_snapshot" USING btree ("gpu_card_type_id","data_center_id");--> statement-breakpoint
CREATE INDEX "rsr_priority_idx" ON "resource_scheduling_rule" USING btree ("priority" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "rsr_enabled_idx" ON "resource_scheduling_rule" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "rsr_scope_idx" ON "resource_scheduling_rule" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX "rsr_tenant_tier_idx" ON "resource_scheduling_rule" USING btree ("tenant_tier");--> statement-breakpoint
CREATE INDEX "rsr_product_line_idx" ON "resource_scheduling_rule" USING btree ("product_line");--> statement-breakpoint
CREATE INDEX "srcl_rule_id_idx" ON "scheduling_rule_change_log" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "srcl_changed_at_idx" ON "scheduling_rule_change_log" USING btree ("changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "offline_bare_metal_order_order_no_uk" ON "offline_bare_metal_order" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "offline_bare_metal_order_status_idx" ON "offline_bare_metal_order" USING btree ("order_status");--> statement-breakpoint
CREATE INDEX "offline_bare_metal_order_ordered_at_idx" ON "offline_bare_metal_order" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "offline_bare_metal_order_supply_line_order_idx" ON "offline_bare_metal_order_supply_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "offline_bare_metal_order_supply_line_dc_idx" ON "offline_bare_metal_order_supply_line" USING btree ("data_center_id","gpu_card_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_bitable_sync_config_kind_table_uk" ON "sla_bitable_sync_config" USING btree ("sync_kind","app_token","table_id");--> statement-breakpoint
CREATE INDEX "sla_bitable_sync_config_enabled_idx" ON "sla_bitable_sync_config" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_datacenter_card_type_monthly_uk" ON "sla_datacenter_card_type_monthly" USING btree ("sla_month","data_center_id","gpu_card_type_id","sla_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_datacenter_monthly_uk" ON "sla_datacenter_monthly" USING btree ("sla_month","data_center_id","sla_scope");--> statement-breakpoint
CREATE INDEX "sla_datacenter_monthly_supplier_idx" ON "sla_datacenter_monthly" USING btree ("supplier_id","sla_month");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_device_monthly_month_sn_uk" ON "sla_device_monthly" USING btree ("sla_month","device_sn");--> statement-breakpoint
CREATE INDEX "sla_device_monthly_supplier_device_idx" ON "sla_device_monthly" USING btree ("supplier_device_id","sla_month");--> statement-breakpoint
CREATE INDEX "sla_device_monthly_dc_card_idx" ON "sla_device_monthly" USING btree ("data_center_id","gpu_card_type_id","sla_month");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_fault_card_hours_daily_uk" ON "sla_fault_card_hours_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","sla_scope","impact_side");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_fault_count_daily_uk" ON "sla_fault_count_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","sla_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_fault_device_daily_uk" ON "sla_fault_device_daily" USING btree ("stat_date","device_sn","impact_side");--> statement-breakpoint
CREATE INDEX "sla_fault_device_daily_supplier_device_idx" ON "sla_fault_device_daily" USING btree ("supplier_device_id","stat_date");--> statement-breakpoint
CREATE INDEX "sla_fault_device_daily_dc_card_idx" ON "sla_fault_device_daily" USING btree ("data_center_id","gpu_card_type_id","stat_date");--> statement-breakpoint
CREATE INDEX "sla_import_batch_dataset_stat_date_idx" ON "sla_import_batch" USING btree ("dataset_kind","stat_date");--> statement-breakpoint
CREATE INDEX "sla_import_batch_status_created_at_idx" ON "sla_import_batch" USING btree ("import_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_monthly_report_compensation_uk" ON "sla_monthly_report_compensation" USING btree ("sla_month","data_center_id","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_onboarding_loss_external_uk" ON "sla_onboarding_loss" USING btree ("external_record_id");--> statement-breakpoint
CREATE INDEX "sla_onboarding_loss_dc_card_received_idx" ON "sla_onboarding_loss" USING btree ("data_center_id","gpu_card_type_id","ops_received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_ops_fault_daily_uk" ON "sla_ops_fault_daily" USING btree ("stat_date","list_kind","incident_id");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_daily_dc_card_idx" ON "sla_ops_fault_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","list_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_ops_fault_incident_external_uk" ON "sla_ops_fault_incident" USING btree ("external_fault_id");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_incident_dc_card_started_idx" ON "sla_ops_fault_incident" USING btree ("data_center_id","gpu_card_type_id","started_at");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_incident_status_ended_idx" ON "sla_ops_fault_incident" USING btree ("incident_status","ended_at");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_incident_first_seen_dc_idx" ON "sla_ops_fault_incident" USING btree ("first_seen_date","data_center_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_ops_fault_incident_device_incident_sn_uk" ON "sla_ops_fault_incident_device" USING btree ("incident_id","device_sn");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_incident_device_supplier_device_idx" ON "sla_ops_fault_incident_device" USING btree ("supplier_device_id","started_at");--> statement-breakpoint
CREATE INDEX "sla_ops_fault_incident_device_dc_card_started_idx" ON "sla_ops_fault_incident_device" USING btree ("data_center_id","gpu_card_type_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_platform_internal_usage_external_uk" ON "sla_platform_internal_usage" USING btree ("external_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_platform_offline_baremetal_incident_external_uk" ON "sla_platform_offline_baremetal_incident" USING btree ("external_incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_platform_online_incident_external_uk" ON "sla_platform_online_incident" USING btree ("external_incident_id");--> statement-breakpoint
CREATE INDEX "sla_platform_online_incident_dc_card_started_idx" ON "sla_platform_online_incident" USING btree ("data_center_id","gpu_card_type_id","fault_started_at");--> statement-breakpoint
CREATE INDEX "sla_platform_online_incident_tenant_started_idx" ON "sla_platform_online_incident" USING btree ("tenant_platform_id","fault_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_supply_daily_uk" ON "sla_supply_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","sla_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_utilization_daily_uk" ON "sla_utilization_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","sla_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "sla_waste_daily_uk" ON "sla_waste_daily" USING btree ("stat_date","data_center_id","gpu_card_type_id","sla_scope");