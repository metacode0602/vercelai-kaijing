-- Enforce onboarding handler branch requirements outside draft state.
DO $$ BEGIN
  ALTER TABLE "tenant_onboarding_applications"
    ADD CONSTRAINT "tenant_onboarding_handler_branch_chk"
    CHECK (
      "status" in ('draft', 'rejected')
      OR (
        "handler_type" = 'legal_rep'
        AND "legal_rep_id_no" IS NOT NULL
        AND "legal_rep_id_front_key" IS NOT NULL
        AND "legal_rep_id_back_key" IS NOT NULL
      )
      OR (
        "handler_type" = 'authorized_agent'
        AND "authorization_file_key" IS NOT NULL
        AND "agent_name" IS NOT NULL
        AND "agent_id_no" IS NOT NULL
        AND "agent_id_front_key" IS NOT NULL
        AND "agent_id_back_key" IS NOT NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
