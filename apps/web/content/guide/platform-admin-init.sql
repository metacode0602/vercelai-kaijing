-- =============================================================================
-- OpenRoute Cloud — 平台管理员初始化 SQL
-- =============================================================================
-- 适用场景：新部署环境首次创建平台超级管理员。
-- 前置条件：数据库 migration 已运行，所有表已创建。
-- 安全提醒：初始化后请立即修改默认密码。
-- =============================================================================

-- 0. 确保 pgcrypto 扩展可用（用于 bcrypt 密码哈希）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. 生成密码哈希
-- =============================================================================
-- 方法 A — 使用 PostgreSQL pgcrypto（兼容 Node.js bcrypt 格式 $2a$10$...）
--   将 'YourPassword123!' 替换为实际密码：
SELECT crypt('YourPassword123!', gen_salt('bf', 10)) AS password_hash;

-- 方法 B — 使用 Node.js 命令行生成（推荐，格式更可控）
--   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123!', 10).then(console.log)"
-- 将输出的哈希字符串用于下方 account.password 字段。

-- =============================================================================
-- 2. 创建平台管理员
-- =============================================================================
-- 注意：以下所有 id 使用 cuid2 格式，请替换为实际生成的 ID。
-- 在 Node.js 中生成: console.log(require('@paralleldrive/cuid2').createId())
-- =============================================================================

-- 2a. 创建 auth 用户
INSERT INTO users (
    id,                   -- cuid2，例如 'clx...
    name,                 -- 管理员姓名（必填）
    email,                -- 登录邮箱（必填，唯一）
    email_verified,       -- 预开通账号直接置 true
    phone_number,         -- 手机号（可选）
    phone_number_verified,
    role,                 -- 应用角色：admin | user | member
    must_change_password, -- 首次登录强制改密
    provisioned_by,       -- 标记为预开通（避免登录拦截）
    provisioned_at,
    banned,
    created_at,
    updated_at
) VALUES (
    'clx...',             -- id: 替换为实际 cuid2
    '平台管理员',           -- name: 管理员姓名
    'admin@openroute.cloud', -- email: 管理员邮箱
    TRUE,                 -- email_verified
    '13681332236',        -- phone_number: 管理员手机号
    TRUE,                 -- phone_number_verified
    'admin',              -- role: 平台超级管理员
    TRUE,                 -- must_change_password: 登录后强制修改
    'INIT',               -- provisioned_by: 系统初始化
    NOW(),
    FALSE,                -- banned
    NOW(),
    NOW()
);

-- 2b. 创建 credential account（存储密码）
INSERT INTO account (
    id,            -- cuid2
    account_id,    -- 邮箱，与 users.email 一致
    provider_id,   -- 固定为 'credential'
    user_id,       -- 对应 users.id
    password,      -- bcrypt 哈希值（上一步生成的结果）
    created_at,
    updated_at
) VALUES (
    'clx...',            -- id: 替换为实际 cuid2
    'admin@openroute.cloud', -- account_id: 对应 users.email
    'credential',        -- 凭证类型
    'clx...',            -- user_id: 对应上方 users.id
    '$2a$10$...',        -- password: 替换为上一步生成的 bcrypt hash
    NOW(),
    NOW()
);

-- =============================================================================
-- 3. 创建平台管理组织
-- =============================================================================
INSERT INTO organization (
    id,
    name,
    slug,
    org_type,      -- 固定 'platform'
    status,        -- 固定 'active'
    entry_approved,
    is_current,
    created_at
) VALUES (
    'clx...',       -- id: 替换为实际 cuid2
    '平台管理组织',
    'platform',
    'platform',
    'active',
    TRUE,
    TRUE,
    NOW()
);

-- =============================================================================
-- 4. 创建组织成员关系（授予平台管理员角色）
-- =============================================================================
INSERT INTO member (
    id,
    organization_id,  -- 对应 organization.id
    user_id,          -- 对应 users.id
    role,             -- 固定 'platform_admin'
    created_at
) VALUES (
    'clx...',       -- id: 替换为实际 cuid2
    'clx...',       -- organization_id: 对应上方 organization.id
    'clx...',       -- user_id: 对应上方 users.id
    'platform_admin',
    NOW()
);

-- =============================================================================
-- 5. 创建内部员工记录（apps/web 运营平台使用）
-- =============================================================================
-- user_staff 是 apps/web（运营平台）的员工主数据，用于 RBAC 和 CRM 业务。
-- 如果不需要通过运营平台登录管理，可跳过此步骤。
-- =============================================================================
INSERT INTO user_staff (
    id,
    employee_no,
    display_name,
    mobile,
    email,
    status,
    department,
    position,
    roles,             -- JSONB 数组：['admin'] 表示平台超级管理员
    auth_user_id,      -- 关联 auth 用户
    created_at,
    updated_at
) VALUES (
    'clx...',          -- id: 替换为实际 cuid2
    'ADMIN001',        -- employee_no: 工号
    '平台管理员',        -- display_name: 显示名称
    '13681332236',     -- mobile: 手机号
    'admin@openroute.cloud', -- email: 邮箱
    'active',          -- status: 员工状态
    '管理',            -- department: 部门
    '管理员',          -- position: 职位
    '["admin"]',       -- roles: jsonb 数组
    'clx...',          -- auth_user_id: 对应上方 users.id
    NOW(),
    NOW()
);

-- =============================================================================
-- 6. 验证
-- =============================================================================
-- 查看创建的用户：
--   SELECT id, email, role, email_verified, must_change_password FROM users;
--
-- 查看平台组织与成员：
--   SELECT o.name, o.org_type, m.role, u.email
--   FROM member m
--   JOIN organization o ON o.id = m.organization_id
--   JOIN users u ON u.id = m.user_id
--   WHERE o.org_type = 'platform';
--
-- 查看员工记录：
--   SELECT id, display_name, email, roles, auth_user_id FROM user_staff;

-- =============================================================================
-- 撤销（回滚用）
-- =============================================================================
-- DELETE FROM user_staff WHERE email = 'admin@openroute.cloud';
-- DELETE FROM member WHERE user_id IN (SELECT id FROM users WHERE email = 'admin@openroute.cloud');
-- DELETE FROM account WHERE user_id IN (SELECT id FROM users WHERE email = 'admin@openroute.cloud');
-- DELETE FROM session WHERE user_id IN (SELECT id FROM users WHERE email = 'admin@openroute.cloud');
-- DELETE FROM users WHERE email = 'admin@openroute.cloud';
