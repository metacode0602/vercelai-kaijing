# 平台管理员初始化指南

**文档性质**：面向开发与运维的部署初始化说明  
**适用读者**：需要在全新环境首次创建平台管理员的开发或运维人员  
**关联设计**：[认证与权限系统设计方案](../design/auth-system-design.md)

---

## 1. 背景

GPURun Cloud 采用两层认证权限架构：

- **better-auth** 提供核心认证（用户、组织、成员关系）
- **`user_staff`** 提供运营平台（apps/web）的 RBAC 员工主数据

平台管理员初始化需要同时写入这两层数据。

## 2. 涉及的表

| 表 | 用途 | 必填 |
|----|------|:----:|
| `users` | better-auth 用户（登录凭证） | ✅ |
| `account` | 邮箱+密码凭据（存储 bcrypt 哈希） | ✅ |
| `organization` | 平台管理组织（`org_type = 'platform'`） | ✅ |
| `member` | 用户与组织的成员关系 + 角色 | ✅ |
| `user_staff` | 运营平台员工主数据（RBAC 基础） | ✅ |

### 2.1 角色对应关系

| 层级 | 字段/表 | 值 | 说明 |
|------|---------|----|------|
| Auth 角色 | `users.role` | `admin` | 由 `resolveUserRoleFromStaffRoles(['admin'])` 决议 |
| 组织角色 | `member.role` | `platform_admin` | better-auth organization plugin 的权限定义 |
| 员工角色 | `user_staff.roles` | `['admin']` | JSONB 数组，运营平台 RBAC 数据源 |

## 3. 前置条件

- 数据库 migration 已完成（所有表已创建）
- `pgcrypto` 扩展可用（用于哈希生成）
- `@paralleldrive/cuid2` 可用（用于 ID 生成）

## 4. 初始化步骤

### 4.1 生成必需的 ID 和密码哈希

所有主键使用 `cuid2` 格式。在项目目录下执行：

```bash
# 生成一个 cuid2 ID
node -e "const { createId } = require('@paralleldrive/cuid2'); console.log(createId())"

# 生成 bcrypt 密码哈希
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourPassword123!', 10).then(h => console.log(h))"
```

需要生成 **5 个 ID**：

| 序号 | 用途 | 变量名 |
|:----:|------|--------|
| ① | `users.id` | `USER_ID` |
| ② | `account.id` | `ACCOUNT_ID` |
| ③ | `organization.id` | `ORG_ID` |
| ④ | `member.id` | `MEMBER_ID` |
| ⑤ | `user_staff.id` | `STAFF_ID` |

### 4.2 执行 SQL

SQL 脚本位于同目录 `platform-admin-init.sql`。将上一步生成的 ID 和密码哈希填入脚本后执行：

```bash
# 替换 <DB_URL> 为实际的数据库连接字符串
psql <DB_URL> -f apps/web/content/guide/platform-admin-init.sql
```

> **注意**：脚本中的 `'INIT'` 作为 `provisioned_by` 值表示系统初始化，与 apps/web session 创建 hook 中的 `assertUserMayLogin` 兼容。

### 4.3 验证初始化

登录到数据库并执行以下查询：

```sql
-- 1. 确认用户已创建
SELECT id, email, role, email_verified, must_change_password FROM users WHERE email = 'admin@example.com';

-- 2. 确认组织与成员关系
SELECT o.name, o.org_type, m.role, u.email
FROM member m
JOIN organization o ON o.id = m.organization_id
JOIN users u ON u.id = m.user_id
WHERE o.org_type = 'platform';

-- 3. 确认员工记录
SELECT id, display_name, email, roles FROM user_staff WHERE email = 'admin@example.com';
```

### 4.4 首次登录

1. 打开运营平台登录页（apps/web）
2. 使用 `admin@example.com` 和设置的密码登录
3. 系统将提示 **修改密码**（`must_change_password = TRUE`）
4. 设置新密码后即可进入管理后台

## 5. 安全注意事项

- 初始化完成后**立即修改默认密码**
- 生产环境应使用强密码（符合 `@workspace/auth` 的密码策略）
- 避免将含有明文密码的 SQL 文件提交到版本控制
- 建议在初始化后从 `user_staff.roles` 中移除 `admin` 并改为分配 `user` 角色给日常运营人员

## 6. 常见问题

### Q: 登录提示"账号未开通或已禁用"

- 检查 `users.provisioned_by` 是否非空
- 检查 `users.banned` 是否为 `false`
- 确认 `websiteConfig.auth.requireProvisionedToLogin` 配置

### Q: 使用 API 创建用户时如何生成 bcrypt 哈希？

better-auth 在 `user.create` 时自动哈希密码。如果通过 API 创建管理员，应使用 `auth.api.signUpEmail` 或管理端创建用户流程，而非手动 INSERT。

### Q: 如何创建第二个平台管理员？

通过运营平台「员工管理」功能创建员工并勾选 `admin` 应用角色即可，系统会自动执行 `ensureStaffLoginAccess` 流程。
