-- 初始化 apps/web 平台管理员（web_auth schema）。
--
-- 登录邮箱：gpurun@163.com
-- 初始密码：Admin@123456（须登录后立即修改）
--
-- 执行前：
--   1. 已运行数据库迁移（web_auth schema 由 0000 迁移创建）
--   2. DATABASE_URL 指向目标库
--
-- 执行：
--   psql "$DATABASE_URL" -f packages/db/drizzle/scripts/init-platform-admin.sql
--
-- 幂等：按 organization.slug='platform' / users.email 定位，重复执行会
-- 重置该账号密码为上面的初始密码。
--
-- 管理员判定口径与 apps/web/src/lib/auth/platform-admin.ts 一致：
--   organization.org_type='platform'
--   且 member.role ∈ ('platform_admin','platform_operator','platform_finance')
--
-- 密码哈希与 better-auth @better-auth/utils/password 一致：
--   scrypt(N=16384, r=16, p=1, dkLen=64)，格式 `<16字节salt hex>:<64字节key hex>`
--   修改初始密码时，用 packages/db/src/scripts/platform-admin-init.ts 的
--   hashPassword() 或同参数 scrypt 重新生成后替换下方 v_password_hash。

DO $$
DECLARE
  v_email         text := 'gpurun@163.com';
  v_name          text := 'Platform Admin';
  v_password_hash text := '544333eda54b3e42df6f69cdbf1b0571:5f63ca3e774c91c8ca000b0b2edaff90597834d59f2ba5c73eafaf80c9ef693c405bfa618a8f5d7d0f049f7a2f059a6a89fe2065abc713d172cc05ff9d73276c';
  v_org_id        text;
  v_user_id       text;
  v_account_id    text;
  v_member_id     text;
BEGIN
  -- 1. 平台组织（slug 唯一，作为幂等定位键）
  SELECT id INTO v_org_id
  FROM web_auth.organization
  WHERE slug = 'platform'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    v_org_id := 'org_platform_main';
    INSERT INTO web_auth.organization (
      id, name, slug, created_at,
      entry_approved, is_current, status, org_type
    ) VALUES (
      v_org_id, 'OpenShop Platform', 'platform', now(),
      true, false, 'active', 'platform'
    );
  ELSE
    UPDATE web_auth.organization
    SET name = 'OpenShop Platform',
        org_type = 'platform',
        entry_approved = true,
        status = 'active'
    WHERE id = v_org_id;
  END IF;

  -- 2. 管理员账号（email 唯一）
  SELECT id INTO v_user_id
  FROM web_auth.users
  WHERE email = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := 'usr_platform_gpurun';
    INSERT INTO web_auth.users (
      id, name, email, email_verified, role, must_change_password, created_at
    ) VALUES (
      v_user_id, v_name, v_email, true, 'admin', true, now()
    );
  ELSE
    UPDATE web_auth.users
    SET name = COALESCE(NULLIF(name, ''), v_name),
        email_verified = true,
        role = 'admin'
    WHERE id = v_user_id;
  END IF;

  -- 3. 邮箱密码登录凭据（provider_id='credential'）
  SELECT id INTO v_account_id
  FROM web_auth.account
  WHERE user_id = v_user_id AND provider_id = 'credential'
  LIMIT 1;

  IF v_account_id IS NULL THEN
    v_account_id := 'acc_platform_gpurun';
    INSERT INTO web_auth.account (
      id, account_id, provider_id, user_id, password, created_at, updated_at
    ) VALUES (
      v_account_id, v_user_id, 'credential', v_user_id, v_password_hash, now(), now()
    );
  ELSE
    UPDATE web_auth.account
    SET account_id = v_user_id,
        password = v_password_hash,
        updated_at = now()
    WHERE id = v_account_id;
  END IF;

  -- 4. 平台组织成员，角色 platform_admin
  SELECT id INTO v_member_id
  FROM web_auth.member
  WHERE user_id = v_user_id AND organization_id = v_org_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    v_member_id := 'mem_platform_gpurun';
    INSERT INTO web_auth.member (
      id, organization_id, user_id, role, created_at
    ) VALUES (
      v_member_id, v_org_id, v_user_id, 'platform_admin', now()
    );
  ELSE
    UPDATE web_auth.member
    SET role = 'platform_admin'
    WHERE id = v_member_id;
  END IF;

  RAISE NOTICE '平台管理员初始化完成: email=%, org=%, user=%', v_email, v_org_id, v_user_id;
END
$$;
