# syntax=docker/dockerfile:1
# gpus Next.js 应用（体积最小化：multi-stage + standalone）
#
# 在仓库根目录构建：
#   docker build -f apps/gpus/Dockerfile -t gongji-crm-gpus:latest .
#
# 运行：
#   docker run --rm -p 3000:3000 gongji-crm-gpus:latest

ARG NODE_VERSION=24-alpine
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

ARG PNPM_VERSION=10.33.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY . .

RUN apk add --no-cache ca-certificates

RUN pnpm install --frozen-lockfile --config.package-import-method=copy

RUN pnpm exec turbo build --filter=./apps/gpus

# pnpm + Next standalone：复制目录以稳定 inode，保留符号链接（勿用 cp -aL，会弄断 @swc/helpers 解析）
RUN set -eux; \
    _root="apps/gpus"; \
    _st="${_root}/.next/standalone"; \
    if [ ! -d "${_st}" ]; then echo "missing ${_st}"; exit 1; fi; \
    find "${_st}" -type l ! -exec test -e {} \; -delete; \
    _tmp="${_st}_materialized_$$$$"; \
    rm -rf "${_tmp}"; \
    cp -a "${_st}" "${_tmp}"; \
    rm -rf "${_st}"; \
    mv "${_tmp}" "${_st}"; \
    mkdir -p "${_st}/apps/gpus"; \
    cp -r "${_root}/public" "${_st}/apps/gpus/"; \
    mkdir -p "${_st}/apps/gpus/.next"; \
    cp -r "${_root}/.next/static" "${_st}/apps/gpus/.next/"


ARG NODE_VERSION=24-alpine
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder /app/apps/gpus/.next/standalone ./
COPY --from=builder /app/apps/gpus/.next/static ./apps/gpus/.next/static
COPY --from=builder /app/apps/gpus/public ./apps/gpus/public

RUN mkdir -p apps/gpus/.next && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "apps/gpus/server.js"]
