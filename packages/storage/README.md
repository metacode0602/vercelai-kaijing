# @workspace/storage — 统一对象存储

统一的文件存储封装：默认走阿里云 OSS，未配置凭证时自动回退本地磁盘，开发与生产用同一套调用方式。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 提供文件上传/读取/公开访问地址的统一入口 |
| 消费方 | 发票、凭证、品牌素材等需要持久化文件的模块 |
| 驱动 | `oss`（阿里云 OSS，Signature V1）或 `local`（本地磁盘） |

## 主要功能

- `oss://` / `local://` 两种 scheme，调用方按前缀区分
- 未显式指定时：已配置 OSS 凭证 → `oss`，否则回退 `local`
- 支持内网 endpoint（`STORAGE_OSS_INTERNAL`）与 HTTPS（`STORAGE_OSS_SECURE`）

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `STORAGE_DRIVER` | `local` \| `oss`（可省略，自动推断） |
| `STORAGE_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_ID` | 访问密钥 |
| `STORAGE_SECRET_ACCESS_KEY` / `OSS_ACCESS_KEY_SECRET` | 密钥 |
| `STORAGE_BUCKET_NAME` / `OSS_BUCKET` | 桶名 |
| `STORAGE_REGION` / `OSS_REGION` | 地域，默认 `cn-hangzhou` |
| `STORAGE_ENDPOINT` / `OSS_ENDPOINT` | 自定义 endpoint |
| `STORAGE_PUBLIC_URL` / `OSS_PUBLIC_BASE_URL` | 公开访问基地址 |
| `STORAGE_OSS_INTERNAL` | 是否走内网 endpoint |
| `STORAGE_OSS_SECURE` | 是否 HTTPS |

## 运行

```bash
pnpm --filter @workspace/storage run lint
pnpm --filter @workspace/storage run typecheck
```

开发环境不配 OSS 即可：自动使用 `local` 驱动写本地目录。

## 部署

**不独立部署**，随宿主应用发布。生产环境必须配置 OSS 变量与 `STORAGE_PUBLIC_URL`，否则上传的文件无法通过公网访问。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 变量清单：根目录 `.env.example`
