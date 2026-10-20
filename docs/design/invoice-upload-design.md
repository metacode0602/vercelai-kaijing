# 发票文件上传功能实现总结

## 任务背景

原需求：运营人员开具发票时需要手动填写 PDF URL，操作繁琐且容易出错。

新需求：支持直接上传 PDF 或图片文件作为发票附件，提升用户体验。

明确排除：税控集成（税控暂不支持）。

## 实现方案

### 架构设计

采用本地文件系统存储方案，文件按月份子目录组织：

```
INVOICE_UPLOAD_DIR/
├── 2026-09/
│   ├── 1727251234567-a1b2c3d4e5f6.pdf
│   ├── 1727251345678-b2c3d4e5f6a1.jpg
│   └── ...
├── 2026-10/
│   └── ...
```

**文件命名规则**：`{timestamp}-{sha256_hash_16chars}.{extension}`

### 技术实现

#### 1. 上传 API (`/api/v1/upload-invoice`)

**路径**：`apps/web/src/app/api/v1/upload-invoice/route.ts`

**功能**：
- 接受 multipart/form-data 表单数据
- 支持格式：PDF、JPG/JPEG、PNG、WEBP、GIF
- 文件大小限制：20MB
- 自动生成唯一文件名（timestamp + SHA256 hash）
- 按月份组织存储目录
- 返回文件访问 URL 和存储键

**安全措施**：
- MIME 类型校验
- 文件扩展名白名单
- 文件大小限制
- SHA256 hash 防止文件名冲突

**响应格式**：
```json
{
  "requestId": "abc12345",
  "fileUrl": "/api/v1/invoice-files/2026-09/1727251234567-a1b2c3d4e5f6.pdf",
  "storageKey": "2026-09/1727251234567-a1b2c3d4e5f6.pdf",
  "mimeType": "application/pdf",
  "size": 1234567,
  "originalName": "invoice-2026-09.pdf"
}
```

#### 2. 文件服务 API (`/api/v1/invoice-files/[...path]`)

**路径**：`apps/web/src/app/api/v1/invoice-files/[...path]/route.ts`

**功能**：
- 提供文件下载和预览服务
- 根据扩展名设置正确的 Content-Type
- 添加缓存控制头（1年不可变缓存）

**安全措施**：
- 路径遍历攻击防护（禁止 `..`、`/`、`\`）
- 文件存在性检查
- 错误处理（404、500）

#### 3. 前端文件上传组件

**路径**：`apps/web/src/app/[locale]/(protected)/supplier/invoice-requests/_components/invoice-file-upload.tsx`

**功能**：
- 文件选择器
- 实时上传进度
- 文件类型和大小校验
- 上传成功/失败提示
- 文件预览信息（名称、大小、类型图标）
- 删除已上传文件

**用户体验**：
- 清晰的文件格式和大小限制提示
- 上传中显示加载状态
- 友好的错误提示信息
- 可以删除并重新选择文件

#### 4. UI 集成

**路径**：`apps/web/src/app/[locale]/(protected)/supplier/invoice-requests/_components/invoice-request-list-client.tsx`

**改动**：
- 移除 PDF URL 文本输入框
- 集成 InvoiceFileUpload 组件
- 更新表单验证逻辑
- 更新 tRPC mutation 调用参数

#### 5. Schema 更新

**路径**：`apps/web/src/lib/server/routers/supplier/gateway-invoice-schemas.ts`

**改动**：
```typescript
// 之前：pdfUrl: z.string().url()
// 之后：pdfUrl: z.string().min(1)
```

**原因**：支持本地文件路径（`/api/v1/invoice-files/...`）而不仅仅是完整 URL。

### 数据库设计

**无需修改**，现有 schema 已经支持：

```typescript
// 在 invoice 表中已经存在
pdfUrl: varchar('pdf_url', { length: 1024 }),
pdfStorageKey: varchar('pdf_storage_key', { length: 512 }),
```

- `pdfUrl`：文件访问路径（如 `/api/v1/invoice-files/2026-09/...`）
- `pdfStorageKey`：存储键（如 `2026-09/1727251234567-a1b2c3d4e5f6.pdf`）

## 配置说明

### 环境变量

```bash
# 发票附件存储目录（可选，默认为 /tmp/invoice-attachments）
INVOICE_UPLOAD_DIR=/path/to/invoice-uploads
```

### 目录权限

确保 Node.js 进程对存储目录有写权限：

```bash
mkdir -p "${INVOICE_UPLOAD_DIR:-/tmp/invoice-attachments}"
chmod 755 "${INVOICE_UPLOAD_DIR:-/tmp/invoice-attachments}"
```

## 验证结果

### Lint 检查

```bash
✓ pnpm --filter web run lint
```

**结果**：通过（519 个警告为预先存在的问题，0 个错误）

### 代码审查

- ✅ 文件上传 API 实现完整
- ✅ 文件服务 API 包含安全防护
- ✅ 前端组件用户体验良好
- ✅ UI 集成无破坏性修改
- ✅ Schema 验证放宽合理
- ✅ 环境变量文档完整

### 功能覆盖

- ✅ PDF 文件上传
- ✅ 图片文件上传（JPG/JPEG/PNG/WEBP/GIF）
- ✅ 文件大小限制（20MB）
- ✅ 文件类型验证
- ✅ 上传进度显示
- ✅ 错误处理和提示
- ✅ 文件访问服务
- ✅ 与现有开票流程集成
- ❌ 税控集成（明确不实现）

## 局限性和改进建议

### 当前局限性

1. **存储方式**：使用本地文件系统，不适合多实例部署
2. **文件清理**：没有自动清理未使用文件的机制
3. **权限控制**：文件访问 API 没有权限验证
4. **文件安全**：没有病毒扫描或恶意文件检测

### 生产环境改进建议

#### 短期（MVP）

1. **环境变量配置**：设置 `INVOICE_UPLOAD_DIR` 到持久化存储路径
2. **监控告警**：监控存储目录磁盘使用率
3. **备份策略**：定期备份发票附件目录

#### 中期（优化）

1. **对象存储迁移**：
   ```typescript
   // 使用 S3/R2/OSS 替代本地文件系统
   import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
   ```

2. **权限控制**：
   ```typescript
   // 文件访问前检查用户权限
   const hasAccess = await checkInvoiceAccess(userId, invoiceId)
   if (!hasAccess) return new Response('Forbidden', { status: 403 })
   ```

3. **文件清理**：
   ```typescript
   // 定期清理孤立文件（没有关联 invoice 记录的文件）
   const orphanFiles = await findOrphanInvoiceFiles()
   await cleanupFiles(orphanFiles)
   ```

#### 长期（增强）

1. **CDN 加速**：通过 CDN 分发发票文件，提升访问速度
2. **文件压缩**：自动压缩图片文件，减少存储和带宽成本
3. **OCR 识别**：自动识别发票信息，预填充表单字段
4. **PDF 预览**：在线 PDF 预览功能，无需下载
5. **水印添加**：自动为发票图片添加水印防止盗用
6. **版本控制**：支持发票文件的版本管理和历史记录

## Git 提交记录

1. **feat: add file upload support for invoice issuance** (c596360)
   - 实现上传和文件服务 API
   - 创建文件上传组件
   - 更新 UI 和 schema

2. **docs: add comprehensive testing guide for invoice file upload** (d2ad448)
   - 添加详细的测试指南

3. **docs: add INVOICE_UPLOAD_DIR environment variable to .env.example** (0fb894a)
   - 更新环境变量文档

## Pull Request

**URL**: https://github.com/gpurun/cloud/pull/17

**状态**: Draft（草稿）

**Target Branch**: `develop-gpus`

**建议操作**：
1. 进行 Code Review
2. 在测试环境进行功能测试（参考 `docs/guide/invoice-upload-test-guide.md`）
3. 确认没有问题后转为 Ready for Review
4. 合并到 `develop-gpus`

## 相关文档

- 测试指南：`/workspace/docs/guide/invoice-upload-test-guide.md`
- 环境变量配置：`/workspace/.env.example`
- 设计文档：本文档
- PR 链接：https://github.com/gpurun/cloud/pull/17

## 联系方式

如有问题或需要进一步说明，请：
1. 在 PR 中评论
2. 参考测试指南进行手动测试
3. 查看代码注释了解实现细节
