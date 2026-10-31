# @workspace/storage — 统一对象存储

统一的文件存储封装：支持阿里云 OSS、S3 / S3 兼容存储（AWS S3、MinIO、Cloudflare R2 等）与本地磁盘，未配置凭证时自动回退本地磁盘。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供文件上传/读取/公开访问地址的统一入口 |
| 消费方 | 发票、凭证、品牌素材等需要持久化文件的模块 |
| 驱动 | `oss`（阿里云 OSS，Signature V1）、`s3`（S3 兼容，Signature V4）或 `local`（本地磁盘） |

## 主要功能

- `oss://` / `s3://` / `local://` 三种 scheme，调用方按前缀区分
- 未显式指定时：已配置 OSS 凭证 → `oss`，否则已配置 S3 → `s3`，最后回退 `local`
- OSS 支持内网 endpoint（`STORAGE_OSS_INTERNAL`）与 HTTPS（`STORAGE_OSS_SECURE`）
- S3 使用 Signature V4，支持自定义 endpoint、path-style、临时凭证与预签名 URL
- S3 提供 `s3Put` / `s3Get` / `s3Delete` / `createS3PresignedPutUrl` / `createS3PresignedGetUrl`

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `STORAGE_DRIVER` | `local` \| `oss` \| `s3`（可省略，自动推断） |
| `STORAGE_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_ID` | 访问密钥 |
| `STORAGE_SECRET_ACCESS_KEY` / `OSS_ACCESS_KEY_SECRET` | 密钥 |
| `STORAGE_BUCKET_NAME` / `OSS_BUCKET` | 桶名 |
| `STORAGE_REGION` / `OSS_REGION` | 地域，默认 `cn-hangzhou` |
| `STORAGE_ENDPOINT` / `OSS_ENDPOINT` | 自定义 endpoint |
| `STORAGE_PUBLIC_URL` / `OSS_PUBLIC_BASE_URL` | 公开访问基地址 |
| `STORAGE_OSS_INTERNAL` | 是否走内网 endpoint |
| `STORAGE_OSS_SECURE` | 是否 HTTPS |
| `STORAGE_S3_ACCESS_KEY_ID` / `S3_ACCESS_KEY_ID` | S3 访问密钥 |
| `STORAGE_S3_SECRET_ACCESS_KEY` / `S3_SECRET_ACCESS_KEY` | S3 密钥 |
| `STORAGE_S3_BUCKET` / `S3_BUCKET` | S3 桶名 |
| `STORAGE_S3_REGION` / `S3_REGION` | S3 地域，默认 `us-east-1` |
| `STORAGE_S3_ENDPOINT` / `S3_ENDPOINT` | S3 endpoint，默认 `https://s3.{region}.amazonaws.com` |
| `STORAGE_S3_PUBLIC_URL` / `S3_PUBLIC_URL` | S3 公开访问基地址 |
| `STORAGE_S3_FORCE_PATH_STYLE` / `S3_FORCE_PATH_STYLE` | 是否使用 path-style，默认 `true`（兼容 MinIO / R2） |
| `STORAGE_S3_SESSION_TOKEN` / `S3_SESSION_TOKEN` | 临时凭证 token（可选） |
| `STORAGE_S3_SECURE` | endpoint 未带协议时是否使用 HTTPS |

## 运行

```bash
pnpm --filter @workspace/storage run lint
pnpm --filter @workspace/storage run typecheck
```

开发环境不配 OSS / S3 即可：自动使用 `local` 驱动写本地目录。

## 部署

**不独立部署**，随宿主应用发布。生产环境必须配置 OSS 或 S3 变量与对应 `PUBLIC_URL`，否则上传的文件无法通过公网访问。

S3 示例：

```bash
STORAGE_DRIVER=s3
STORAGE_S3_ACCESS_KEY_ID=...
STORAGE_S3_SECRET_ACCESS_KEY=...
STORAGE_S3_BUCKET=open-shop
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_S3_PUBLIC_URL=https://open-shop.s3.us-east-1.amazonaws.com
STORAGE_S3_FORCE_PATH_STYLE=false
```

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 变量清单：根目录 `.env.example`
