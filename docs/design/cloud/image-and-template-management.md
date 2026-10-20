# 镜像与部署模板管理设计

> 本文覆盖：基础镜像 / 自定义镜像的管理、应用商店模板、预加载镜像的全流程设计与数据库定义。
>
> **v2 变更 (商业评审)**：合并社区镜像→应用模板、系统模板→应用模板；删除 GPU 配置模板和镜像仓库配置表；基础镜像和自定义镜像增加 `recommendedConfig` 字段。详见 `image-template-commercial-review.md`。

---

## 1. 总体设计

### 1.1 镜像与模板分类

```
镜像目录 (Layer 1 — 平台基础设施)
├── 基础镜像 (Base Image)
│   └── 平台官方维护的 GPU 运行时镜像
│   └── 附带 recommendedConfig (命令/端口/环境变量/GPU)
│   └── 示例: pytorch/pytorch:2.4.0-cuda12.4
└── 自定义镜像 (Custom Image)
    └── 用户私有镜像 (push/commit/外部导入)
    └── 附带 recommendedConfig (从实例保存时自动提取)
    └── 仓库凭证 (Registry Credential)

工作负载定义 (Layer 2 — 用户操作单元)
└── 应用模板 (Application Template / App Store)
    └── 预配置 镜像+命令+端口+环境变量+GPU+扩缩容 的完整部署单元
    └── deployType: instance / serverless
    └── tier: official / verified / community
    └── sourceType: base_image / custom_image / docker_hub

性能优化 (跨层)
└── 预加载任务 (Preload Task)
    └── 在指定区域的节点上提前拉取镜像，加速首次启动
```

### 1.2 用户画像与使用场景


| 角色     | 关注的资源                     | 典型场景                           |
| ------ | ------------------------- | ------------------------------ |
| AI 开发者 | 基础镜像 + recommendedConfig  | 选择 PyTorch 镜像，系统自动预填推荐配置，修改后部署 |
| 模型部署者  | 应用模板                      | 一键部署 vLLM、ComfyUI 等成熟服务        |
| 企业用户   | 自定义镜像 + recommendedConfig | 推送内部镜像，从实例保存时自动提取部署配置          |
| 平台运营   | 所有类型                      | 上架/审核/管理基础镜像和应用模板              |


---

## 2. 镜像管理

### 2.1 镜像等级模型

```
镜像等级 (image_tier)
├── official   — 平台官方构建的镜像 (如 Ubuntu+CUDA、PyTorch)
├── verified   — 经平台验证的第三方镜像 (合规扫描 + 功能验证)
└── custom     — 用户私有镜像 (仅创建者可见)
```

> **v2 变更**: 社区镜像 (community) 已合并到应用模板 (application_template) 的 `tier` 字段中。

### 2.2 数据库设计

#### image_registry — 镜像注册表 / 仓库配置

```sql
CREATE TABLE image_registry (
    id              TEXT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,               -- 展示名称
    registry_url    VARCHAR(512) NOT NULL,                -- 仓库地址 e.g. docker.io
    is_public       BOOLEAN NOT NULL DEFAULT true,        -- 是否公共仓库
    requires_auth   BOOLEAN NOT NULL DEFAULT false,       -- 是否需要认证
    status          VARCHAR(16) NOT NULL DEFAULT 'active', -- active / disabled
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 初始数据
INSERT INTO image_registry (id, name, registry_url, is_public) VALUES
    ('docker-hub', 'Docker Hub', 'docker.io', true),
    ('gpurun', 'GPURun Registry', 'gpurun.cn', true),
    ('nvidia', 'NVIDIA NGC', 'nvcr.io', true);
```

#### base_image — 基础镜像

```sql
CREATE TABLE base_image (
    id              TEXT PRIMARY KEY,
    registry_id     TEXT REFERENCES image_registry(id),
    name            VARCHAR(255) NOT NULL,                -- 镜像名称 e.g. pytorch/pytorch
    display_name    VARCHAR(128) NOT NULL,                -- 展示名称 e.g. "PyTorch"
    description     TEXT,                                 -- 简要描述
    category        VARCHAR(64) NOT NULL,                 -- 分类: framework / os / tool
    tags            TEXT[] NOT NULL DEFAULT '{}',         -- 标签: ["deep-learning", "gpu"]
    icon_url        VARCHAR(512),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          VARCHAR(16) NOT NULL DEFAULT 'active', -- active / deprecated / removed
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX base_image_category_idx ON base_image(category);
CREATE INDEX base_image_status_idx ON base_image(status);
```

#### base_image_version — 基础镜像版本

```sql
CREATE TABLE base_image_version (
    id              TEXT PRIMARY KEY,
    base_image_id   TEXT NOT NULL REFERENCES base_image(id) ON DELETE CASCADE,
    version_tag     VARCHAR(255) NOT NULL,                -- 版本标签 e.g. 2.4.0-cuda12.4-cudnn9-runtime
    display_label   VARCHAR(255) NOT NULL,                -- 展示标签 (含日期)
    full_image_ref  VARCHAR(512) NOT NULL,                -- 完整镜像引用 docker.io/pytorch/pytorch:2.4.0-...
    cuda_version    VARCHAR(32),                          -- CUDA 版本
    os_version      VARCHAR(64),                          -- OS 版本
    python_version  VARCHAR(32),                          -- Python 版本
    size_bytes      BIGINT,                               -- 镜像大小
    digest_sha256   VARCHAR(128),                         -- 镜像摘要
    requires_gpu    BOOLEAN NOT NULL DEFAULT true,
    min_gpu_memory  INTEGER,                              -- 最低显存要求 (MB)
    is_latest       BOOLEAN NOT NULL DEFAULT false,       -- 是否最新推荐
    release_date    DATE,
    deprecation_date DATE,                                -- 弃用日期
    deprecation_message TEXT,                             -- 弃用提示
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    UNIQUE (base_image_id, version_tag)
);

CREATE INDEX base_image_version_image_id_idx ON base_image_version(base_image_id);
CREATE INDEX base_image_version_latest_idx ON base_image_version(base_image_id, is_latest)
    WHERE is_latest = true;
```

#### community_image — 社区镜像

```sql
CREATE TABLE community_image (
    id              TEXT PRIMARY KEY,
    registry_id     TEXT REFERENCES image_registry(id),
    owner_id        TEXT REFERENCES tenant(id),            -- 提交者
    name            VARCHAR(255) NOT NULL,                 -- 镜像名称
    full_image_ref  VARCHAR(512) NOT NULL,                -- 完整镜像引用
    description     TEXT,                                  -- 描述
    category        VARCHAR(64) NOT NULL,                  -- 分类
    tags            TEXT[] NOT NULL DEFAULT '{}',
    usage_tips      TEXT,                                  -- 使用说明
    source_url      VARCHAR(1024),                         -- 源码地址 (GitHub 等)
    doc_url         VARCHAR(1024),                         -- 文档地址
    license         VARCHAR(128),                          -- 许可证
    sort_order      INTEGER NOT NULL DEFAULT 0,
    download_count  INTEGER NOT NULL DEFAULT 0,
    rating_avg      NUMERIC(3,2),
    review_status   VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
    review_comment  TEXT,                                  -- 审核意见
    reviewed_by     TEXT REFERENCES user_staff(id),
    reviewed_at     TIMESTAMP,
    status          VARCHAR(16) NOT NULL DEFAULT 'active', -- active / deprecated / removed
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (registry_id, full_image_ref)
);

CREATE INDEX community_image_status_idx ON community_image(review_status);
CREATE INDEX community_image_owner_idx ON community_image(owner_id);
CREATE INDEX community_image_category_idx ON community_image(category);
```

#### custom_image — 用户自定义镜像

```sql
CREATE TABLE custom_image (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),   -- 所属租户
    name            VARCHAR(255) NOT NULL,                 -- 镜像名称 (用户自定义)
    full_image_ref  VARCHAR(512) NOT NULL,                -- 完整镜像引用 e.g. registry.example.com/myorg/my-model:v1
    registry_id     TEXT REFERENCES image_registry(id),
    description     TEXT,                                  -- 备注
    source_type     VARCHAR(16) NOT NULL DEFAULT 'external', -- external / built_from_instance
    source_instance_id TEXT REFERENCES compute_task(id),  -- 从实例保存时为源实例 ID
    registry_credential_id TEXT,                           -- 关联的私有仓库凭证 ID
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, full_image_ref)
);

CREATE INDEX custom_image_tenant_idx ON custom_image(tenant_id);
```

#### registry_credential — 镜像仓库凭证

```sql
CREATE TABLE registry_credential (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),   -- 所属租户
    registry_url    VARCHAR(512) NOT NULL,                -- 仓库地址
    username        VARCHAR(255),                         -- 用户名
    password_enc    TEXT,                                  -- 加密密码
    access_token_enc TEXT,                                 -- 加密 Token (优先)
    description     VARCHAR(255),                          -- 备注
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, registry_url)
);
```

#### preload_task — 预加载任务

```sql
CREATE TABLE preload_task (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),   -- 发起者
    image_ref       VARCHAR(512) NOT NULL,                -- 要预加载的镜像
    full_image_ref  VARCHAR(512) NOT NULL,                -- 完整镜像引用 (含 digest)
    image_digest    VARCHAR(128),                         -- 镜像摘要
    registry_credential_id TEXT REFERENCES registry_credential(id),
    region_id       TEXT NOT NULL REFERENCES data_center(id), -- 目标区域
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending / downloading / ready / failed
    progress        INTEGER NOT NULL DEFAULT 0,           -- 下载进度 0-100
    size_bytes      BIGINT,                               -- 镜像大小
    downloaded_bytes BIGINT NOT NULL DEFAULT 0,
    error_message   TEXT,                                 -- 错误信息
    completed_at    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX preload_task_tenant_idx ON preload_task(tenant_id);
CREATE INDEX preload_task_region_idx ON preload_task(region_id);
CREATE INDEX preload_task_status_idx ON preload_task(status);
```

#### preload_node_task — 预加载节点任务 (多节点并行)

```sql
CREATE TABLE preload_node_task (
    id              TEXT PRIMARY KEY,
    preload_task_id TEXT NOT NULL REFERENCES preload_task(id) ON DELETE CASCADE,
    node_name       VARCHAR(256) NOT NULL,                -- 目标节点
    node_ip         VARCHAR(45),                          -- 节点 IP
    status          VARCHAR(16) NOT NULL DEFAULT 'pending',
    progress        INTEGER NOT NULL DEFAULT 0,
    digest_after    VARCHAR(128),                         -- 拉取后的 digest
    error_message   TEXT,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    UNIQUE (preload_task_id, node_name)
);

CREATE INDEX preload_node_task_preload_idx ON preload_node_task(preload_task_id);
```

---

## 3. 部署模板管理

### 3.1 模板类型

```
部署模板
├── 应用模板 (application_template) — 面向应用商店
│   ├── 包含: 镜像 + GPU 推荐 + 端口 + 启动命令 + 环境变量 + 文档
│   ├── 分类: LLM / 图像生成 / 音频 / 视频 / 开发环境
│   └── 示例: "ComfyUI 一键部署" → 选择 GPU 类型 → 点击部署
│
└── GPU 配置模板 (gpu_config_template) — 面向实例配置
    ├── 包含: GPU 型号 + vCPU + 内存 + 系统盘 + 数据盘
    ├── 适用: 快速选择和部署已知工作负载合适的规格
    └── 示例: "A100×1 标准 (8vCPU/32GB/100GB)"
```

### 3.2 数据库设计

#### application_template — 应用模板

```sql
CREATE TABLE application_template (
    id              TEXT PRIMARY KEY,
    registry_id     TEXT REFERENCES image_registry(id),
    name            VARCHAR(255) NOT NULL,                -- 模板名称
    description     TEXT,                                  -- 描述
    category        VARCHAR(32) NOT NULL,                  -- llm / image / audio / video / dev
    tags            TEXT[] NOT NULL DEFAULT '{}',
    icon_url        VARCHAR(512),                          -- 图标
    image_ref       VARCHAR(512) NOT NULL,                -- 使用的镜像
    image_registry_credential_id TEXT,                     -- 镜像仓库凭证 (私有镜像时)
    min_gpu         VARCHAR(64),                           -- 最低 GPU 推荐
    min_gpu_count   INTEGER DEFAULT 1,                     -- 最少 GPU 数量
    min_memory_gb   INTEGER,                               -- 最低内存 (GB)
    min_disk_gb     INTEGER DEFAULT 60,                    -- 最低系统盘 (GB)
    default_port    INTEGER DEFAULT 8080,                  -- 默认端口
    default_command TEXT,                                  -- 推荐启动命令
    default_env_vars JSONB,                                -- 推荐环境变量
    health_check_path VARCHAR(256),                        -- 健康检查路径
    docs_url        VARCHAR(1024),                         -- 部署文档
    source_url      VARCHAR(1024),                         -- 源码地址
    deploy_type     VARCHAR(16) NOT NULL DEFAULT 'instance', -- instance / serverless
    is_featured     BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    download_count  INTEGER NOT NULL DEFAULT 0,
    review_status   VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
    reviewed_by     TEXT REFERENCES user_staff(id),
    reviewed_at     TIMESTAMP,
    tier            VARCHAR(16) NOT NULL DEFAULT 'community', -- official / verified / community
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    created_by      TEXT REFERENCES user_staff(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX application_template_category_idx ON application_template(category);
CREATE INDEX application_template_featured_idx ON application_template(is_featured)
    WHERE is_featured = true AND status = 'active';
CREATE INDEX application_template_review_idx ON application_template(review_status);
```

#### application_template_version — 应用模板版本

```sql
CREATE TABLE application_template_version (
    id              TEXT PRIMARY KEY,
    template_id     TEXT NOT NULL REFERENCES application_template(id) ON DELETE CASCADE,
    version_tag     VARCHAR(64) NOT NULL,                 -- 版本号 e.g. v1.2.0
    changelog       TEXT,                                  -- 变更日志
    image_ref       VARCHAR(512) NOT NULL,                -- 该版本的镜像
    gpu_recommendations JSONB,                            -- 推荐 GPU 配置
    command         TEXT,                                  -- 启动命令
    env_vars        JSONB,                                -- 环境变量
    is_latest       BOOLEAN NOT NULL DEFAULT false,
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (template_id, version_tag)
);
```

#### gpu_config_template — GPU 配置模板

```sql
CREATE TABLE gpu_config_template (
    id              TEXT PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,                 -- 模板名称 e.g. "A100×1 基础"
    description     TEXT,
    gpu_card_type_id TEXT NOT NULL REFERENCES gpu_card_type(id),
    gpu_count       INTEGER NOT NULL DEFAULT 1,
    vcpu_count      INTEGER NOT NULL,
    memory_gb       INTEGER NOT NULL,
    system_disk_gb  INTEGER NOT NULL DEFAULT 60,
    data_disk_gb    INTEGER DEFAULT 0,
    network_speed   VARCHAR(32),                          -- 网络带宽建议
    suitable_for    TEXT[] NOT NULL DEFAULT '{}',          -- 适用场景
    is_featured     BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    tier            VARCHAR(16) NOT NULL DEFAULT 'standard', -- standard / premium / custom
    status          VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX gpu_config_template_gpu_type_idx ON gpu_config_template(gpu_card_type_id);
CREATE INDEX gpu_config_template_featured_idx ON gpu_config_template(is_featured)
    WHERE is_featured = true AND status = 'active';
```

---

## 4. 数据关系总图

```mermaid
erDiagram
    image_registry ||--o{ base_image : contains
    image_registry ||--o{ community_image : contains
    image_registry ||--o{ custom_image : references
    image_registry ||--o{ application_template : references

    base_image ||--o{ base_image_version : versions

    tenant ||--o{ community_image : submits
    tenant ||--o{ custom_image : owns
    tenant ||--o{ registry_credential : configures
    tenant ||--o{ preload_task : creates

    custom_image }o--|| compute_task : "saved_from"
    preload_task ||--o{ preload_node_task : "per_node"
    preload_task }o--|| data_center : targets
    preload_task }o--|| registry_credential : uses

    application_template ||--o{ application_template_version : versions
    application_template }o--|| image_registry : references
    application_template }o--|| user_staff : "reviewed by"

    gpu_card_type ||--o{ gpu_config_template : configures
```

---

## 5. 交互流程

### 5.1 用户部署时选择镜像

```mermaid
sequenceDiagram
    participant U as 用户浏览器
    participant N as Next.js
    participant A as Task API Server
    participant DB as PostgreSQL

    U->>N: 进入部署页面 /server/deploy?id=xxx
    N->>A: GET /api/server-deploy-init?offeringId=xxx
    A->>DB: SELECT 基础镜像列表 (base_image + version)
    A->>DB: SELECT 社区镜像列表 (community_image WHERE status=active)
    A->>DB: SELECT 用户的镜像列表 (custom_image WHERE tenant_id=?)
    A-->>N: {baseImages, communityImages, customImages}
    N-->>U: 渲染镜像选择器

    Note over U,N: 用户切换镜像分类

    alt 基础镜像 (Base)
        U->>N: 点击"基础镜像"Tab
        N-->>U: 显示基础镜像卡片列表 (PyTorch/TF/Ubuntu...)
        U->>N: 选择镜像 (如 PyTorch)
        N-->>U: 显示版本下拉 (2.4.0-cuda12.4 / 2.3.0-cuda12.1...)
        U->>N: 选择版本
        N->>N: 确定完整镜像引用

    else 社区镜像 (Community)
        U->>N: 点击"社区镜像"Tab
        N->>A: GET /api/community-images?category=&search=
        A->>DB: SELECT community_image WHERE status=active
        A-->>N: [{name, full_image_ref, description, download_count}]
        N-->>U: 显示社区镜像列表 (含搜索/分类筛选)
        U->>N: 选择一个社区镜像

    else 自定义镜像 (Custom)
        U->>N: 点击"我的镜像"Tab
        N->>A: GET /api/custom-images
        A->>DB: SELECT custom_image WHERE tenant_id=?
        A-->>N: [{name, full_image_ref, description}]
        N-->>U: 显示我的镜像列表
        alt 无仓库凭证
            U->>N: 点击"添加镜像仓库凭证"
            N->>A: POST /api/registry-credentials
            N-->>U: 弹窗填写凭证
        end
        U->>N: 选择一个自定义镜像
    end

    Note over U,N: 镜像选择完成后

    alt 使用应用模板 (App Store)
        U->>N: 进入 /apps -> 浏览模板
        N->>A: GET /api/application-templates?category=
        A->>DB: SELECT application_template + version
        A-->>N: [{name, image_ref, gpu_type, price}]
        N-->>U: 展示模板网格 (含分类/搜索)
        U->>N: 选择模板 -> 点击部署
        N-->>U: 跳转到部署页，预填模板配置
    end

    U->>N: 点击"部署"
    N->>A: POST /api/deploy/instance { image_ref, ... }
    Note over A,DB: 后续: 余额检查 -> 镜像预拉取 -> SkyPilot 调度
```

### 5.2 镜像预拉取流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as Task API Server
    participant DB as PostgreSQL
    participant Node as 节点 Agent
    participant Sky as SkyPilot

    U->>A: 提交任务 (含 image_ref)
    A->>DB: INSERT compute_task (status=image_pulling)
    A->>DB: SELECT 候选节点 (同区域、足够资源)

    par 向多个候选节点并行发送
        A->>Node: POST /agent/pull-image {image_ref, credentials, task_id}
        Node->>Node: docker pull image_ref
        Node-->>A: POST /api/node/callback/image-ready {task_id, node, digest}
        A->>DB: INSERT/UPDATE preload_node_task (status=ready)
    end

    Note over A: 等待至少一个节点镜像就绪

    A->>DB: SELECT 第一个就绪节点
    A->>Sky: POST /sky/api/job {image, node_affinity: node, ...}
    Sky-->>A: {job_id, cluster}
    A->>DB: UPDATE compute_task (status=running, billing_started_at=NOW(), sky_job_id)
    A-->>U: {id, status: "running"}
```

### 5.3 应用模板部署流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant N as Next.js
    participant A as Task API Server
    participant DB as PostgreSQL

    U->>N: 进入 /apps (应用商店)
    N->>A: GET /api/application-templates?category=all
    A->>DB: SELECT template + version (latest, status=active)
    A-->>N: [{id, name, category, image_ref, min_gpu, ...}]
    N-->>U: 展示模板网格

    U->>N: 点击模板卡片 -> 查看详情
    N-->>U: 展示模板详情 (描述/文档/推荐 GPU/版本历史)

    U->>N: 点击"部署"
    N-->>U: 跳转到 /server/deploy?templateId=xxx

    Note over N: 页面加载时，根据 templateId 预填

    N->>A: GET /api/application-templates/:id
    A->>DB: SELECT template + version (latest)
    A-->>N: {image_ref, default_command, default_env_vars, default_port, min_gpu}

    N->>N: 预填镜像、命令、端口
    U->>N: 确认/调整 GPU 配置、计费方式
    U->>N: 点击"部署"
    N->>A: POST /api/deploy/instance {template_id, image, command, ...}
    A->>DB: 余额检查 + 冻结
    A-->>U: {instance_id, status: "deploying"}
```

### 5.4 从运行实例保存为自定义镜像

```mermaid
sequenceDiagram
    participant U as 用户
    participant N as Next.js
    participant A as Task API Server
    participant DB as PostgreSQL
    participant Sky as SkyPilot

    U->>N: 进入实例详情 /server/instances/:id
    U->>N: 点击"保存镜像"
    N-->>U: 弹窗输入镜像名称和描述
    U->>N: 确认保存

    N->>A: POST /api/instances/:id/save-image {name, description}
    A->>DB: SELECT compute_task (校验所有权、running 状态)
    
    A->>Sky: POST /sky/api/job/{job_id}/commit {image_name, tag}
    Sky-->>A: {image_ref: "gpurun.cn/tenant-xxx/my-image:latest", digest}

    A->>DB: INSERT custom_image {
    A->>DB:     tenant_id, name, full_image_ref, source_type='built_from_instance',
    A->>DB:     source_instance_id, status='active'
    A->>DB: }
    A-->>N: {image_id, image_ref}
    N-->>U: "镜像已保存，可在'我的镜像'中查看"
```

### 5.5 社区镜像上传与审核

```mermaid
sequenceDiagram
    participant U as 用户
    participant N as Next.js
    participant A as Task API Server
    participant DB as PostgreSQL
    participant O as 运营平台 (apps/web)
    participant Staff as 运营审核员

    Note over U,Staff: 用户提交
    U->>N: 进入"分享镜像"页面
    U->>N: 填写镜像信息 {image_ref, description, tags, category, docs_url}
    U->>N: 点击提交
    N->>A: POST /api/community-images
    A->>DB: INSERT community_image (review_status='pending', status='active')
    A-->>U: {id, message: "提交成功，等待审核"}
    N-->>U: 显示"审核中"

    Note over O,Staff: 运营审核
    O-->>Staff: 运营平台推送待审核通知
    Staff->>O: 打开审核列表 /platform/images/community
    O->>DB: SELECT community_image WHERE review_status='pending'
    O-->>Staff: 显示待审核镜像列表

    alt 审核通过
        Staff->>O: 点击"通过" + 填写备注
        O->>DB: UPDATE community_image (review_status='approved',
        O->>DB:     reviewed_by, reviewed_at, tier='community')
        O-->>Staff: 审核完成
    else 审核驳回
        Staff->>O: 点击"驳回" + 填写原因
        O->>DB: UPDATE community_image (review_status='rejected', review_comment)
        O-->>Staff: 已驳回
    end
```

---

## 6. 运营管理功能

### 6.1 管理页面


| 管理页面     | 路径                           | 功能               | 对应表                                                |
| -------- | ---------------------------- | ---------------- | -------------------------------------------------- |
| 基础镜像管理   | `/platform/images/base`      | 管理基础镜像列表、新增版本、下架 | base_image, base_image_version                     |
| 社区镜像审核   | `/platform/images/community` | 待审核列表、通过/驳回      | community_image                                    |
| 自定义镜像审计  | `/platform/images/custom`    | 查看所有用户自定义镜像      | custom_image                                       |
| 镜像仓库管理   | `/platform/registries`       | 配置仓库地址、认证信息      | image_registry                                     |
| 应用模板管理   | `/platform/templates`        | 模板列表、新建/编辑、版本管理  | application_template, application_template_version |
| 应用模板审核   | `/platform/templates/review` | 用户提交模板的审核        | application_template (pending)                     |
| GPU 配置模板 | `/platform/gpu-templates`    | 管理 GPU 规格模板      | gpu_config_template                                |
| 预加载任务列表  | `/platform/preload`          | 查看全局预加载任务        | preload_task                                       |


### 6.2 应用模板上架流程

```mermaid
stateDiagram-v2
    [*] --> draft: 运营创建
    [*] --> pending: 用户提交
    draft --> active: 直接发布
    pending --> approved: 审核通过
    approved --> active: 上架
    active --> deprecated: 标记弃用
    deprecated --> removed: 下架
    pending --> rejected: 审核驳回
    rejected --> draft: 重新编辑
    active --> active: 发布新版本
```

### 6.3 镜像状态管理

```mermaid
stateDiagram-v2
    state "基础镜像" as BI
    [*] --> active: 创建
    active --> deprecated: 版本过旧
    deprecated --> removed: 正式移除
    deprecated --> active: 重新激活

    state "社区镜像" as CI
    [*] --> pending: 用户提交
    pending --> approved: 审核通过
    pending --> rejected: 审核驳回
    approved --> active: 上架
    active --> deprecated: 标记过时
    active --> removed: 违规下架

    state "自定义镜像" as CMI
    [*] --> active: 用户保存
    active --> removed: 用户删除
```

---

## 7. API 设计

### 7.1 面向用户 (apps/gpus)


| 方法       | 路径                                        | 功能                    | 对应流程    |
| -------- | ----------------------------------------- | --------------------- | ------- |
| `GET`    | `/api/base-images`                        | 基础镜像列表 (含版本)          | 部署页镜像选择 |
| `GET`    | `/api/base-images/:id/versions`           | 获取某镜像的版本列表            | 版本下拉    |
| `GET`    | `/api/community-images`                   | 社区镜像列表 (已上架, 支持搜索/分类) | 社区镜像浏览  |
| `POST`   | `/api/community-images`                   | 提交社区镜像分享              | 社区上传    |
| `GET`    | `/api/custom-images`                      | 我的镜像列表                | 自定义镜像选择 |
| `POST`   | `/api/custom-images`                      | 添加自定义镜像引用             | 自定义镜像   |
| `DELETE` | `/api/custom-images/:id`                  | 删除自定义镜像               | 镜像管理    |
| `GET`    | `/api/registry-credentials`               | 我的仓库凭证列表              | 私有仓库配置  |
| `POST`   | `/api/registry-credentials`               | 添加仓库凭证                | 凭证管理    |
| `PUT`    | `/api/registry-credentials/:id`           | 更新仓库凭证                | 凭证管理    |
| `DELETE` | `/api/registry-credentials/:id`           | 删除仓库凭证                | 凭证管理    |
| `GET`    | `/api/application-templates`              | 应用模板列表 (含筛选)          | 应用商店    |
| `GET`    | `/api/application-templates/:id`          | 应用模板详情                | 模板详情    |
| `GET`    | `/api/application-templates/:id/versions` | 模板版本历史                | 版本选择    |
| `POST`   | `/api/instances/:id/save-image`           | 从实例保存镜像               | 镜像保存    |
| `GET`    | `/api/gpu-config-templates`               | GPU 配置模板列表            | 配置模板选择  |
| `GET`    | `/api/preload-tasks`                      | 预加载任务列表               | 预加载管理   |
| `POST`   | `/api/preload-tasks`                      | 创建预加载任务               | 预加载创建   |
| `DELETE` | `/api/preload-tasks/:id`                  | 删除预加载任务               | 预加载删除   |
| `POST`   | `/api/node/callback/image-ready`          | 节点镜像拉取完成回调            | 预拉取回调   |


### 7.2 面向运营 (apps/web)


| 方法       | 路径                                            | 功能                                       |
| -------- | --------------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/platform/base-images`                      | 管理基础镜像列表                                 |
| `POST`   | `/api/platform/base-images`                      | 新增基础镜像                                   |
| `PUT`    | `/api/platform/base-images/:id`                  | 更新基础镜像                                   |
| `POST`   | `/api/platform/base-images/:id/versions`         | 新增版本                                     |
| `PUT`    | `/api/platform/base-images/:id/versions/:vid`    | 更新版本                                     |
| `GET`    | `/api/platform/community-images`                 | 待审核/已审核社区镜像列表                            |
| `POST`   | `/api/platform/community-images/:id/review`      | 审核社区镜像 {action: approve/reject, comment} |
| `GET`    | `/api/platform/application-templates`            | 管理应用模板列表                                 |
| `POST`   | `/api/platform/application-templates`            | 创建应用模板                                   |
| `PUT`    | `/api/platform/application-templates/:id`        | 更新应用模板                                   |
| `DELETE` | `/api/platform/application-templates/:id`        | 删除应用模板                                   |
| `POST`   | `/api/platform/application-templates/:id/review` | 审核应用模板                                   |
| `GET`    | `/api/platform/gpu-config-templates`             | 管理 GPU 配置模板                              |
| `POST`   | `/api/platform/gpu-config-templates`             | 创建配置模板                                   |
| `PUT`    | `/api/platform/gpu-config-templates/:id`         | 更新配置模板                                   |
| `GET`    | `/api/platform/preload-tasks`                    | 全局预加载任务列表                                |
| `GET`    | `/api/platform/registries`                       | 镜像仓库配置                                   |
| `POST`   | `/api/platform/registries`                       | 添加仓库                                     |
| `PUT`    | `/api/platform/registries/:id`                   | 更新仓库                                     |


---

## 8. 用户界面路由

### 8.1 用户侧 (apps/gpus)


| 路由                              | 页面            | 数据来源                                        |
| ------------------------------- | ------------- | ------------------------------------------- |
| `/apps`                         | 应用商店          | application_template                        |
| `/server/deploy`                | 云服务器部署页       | base_image + community_image + custom_image |
| `/server/deploy?templateId=xxx` | 预填模板的部署页      | application_template + version              |
| `/server/instances/:id`         | 实例详情 → "保存镜像" | compute_task + custom_image                 |
| `/preloaded`                    | 预加载镜像管理       | preload_task                                |
| `/settings/registry`            | 镜像仓库凭证设置      | registry_credential                         |
| `/images/custom`                | 我的自定义镜像       | custom_image                                |
| `/images/share`                 | 分享镜像 (提交社区)   | → POST community_image                      |


### 8.2 运营侧 (apps/web)


| 路由                              | 页面         |
| ------------------------------- | ---------- |
| `/platform/images/base`            | 基础镜像管理     |
| `/platform/images/base/:id`        | 基础镜像版本管理   |
| `/platform/images/community`       | 社区镜像审核列表   |
| `/platform/images/community/:id`   | 社区镜像审核详情   |
| `/platform/templates`              | 应用模板列表     |
| `/platform/templates/create`       | 新建应用模板     |
| `/platform/templates/:id`          | 编辑应用模板     |
| `/platform/templates/:id/versions` | 模板版本管理     |
| `/platform/gpu-templates`          | GPU 配置模板管理 |
| `/platform/preload`                | 全局预加载监控    |
| `/platform/registries`             | 镜像仓库配置     |


---

## 9. 预加载性能与约束

### 9.1 约束

```sql
-- 每个租户最多同时预加载任务数
-- 应用层: 前端展示 MAX_PRELOAD_TASKS = 5
-- 数据库层: 触发器或应用层校验

-- 每个预加载任务最多 100 GB
-- 预加载镜像大小限制
```

### 9.2 预加载策略

```mermaid
flowchart TD
    A[用户提交预加载任务] --> B{是否有同区域<br/>就绪缓存?}
    B -->|是| C[立即标记 ready<br/>跳过实际拉取]
    B -->|否| D{同区域是否有<br/>空闲节点?}
    D -->|是| E[选择节点<br/>发送 pull 指令]
    D -->|否| F[任务进入 pending<br/>等待节点释放]
    E --> G[节点异步拉取]
    G --> H{拉取成功?}
    H -->|是| I[回调通知<br/>更新为 ready]
    H -->|否| J[标记 failed<br/>可选重试]
```

### 9.3 预拉取触发时机

```mermaid
sequenceDiagram
    participant U as 用户
    participant A as Task API Server
    participant DB as PostgreSQL

    Note over U,A: 场景 1: 用户手动提交预加载
    U->>A: POST /api/preload-tasks {image, region}
    A->>DB: INSERT preload_task (status=pending)
    A->>DB: 开始异步拉取

    Note over A: 场景 2: 用户部署实例时自动触发 (若镜像未就绪)
    U->>A: POST /api/deploy/instance {image, region}
    A->>DB: SELECT 1 FROM preload_node_task pn
    A->>DB:   JOIN preload_task p ON p.id = pn.preload_task_id
    A->>DB:   WHERE p.image_ref = ? AND pn.status = 'ready'
    alt 已就绪
        A->>A: 直接调度到就绪节点
    else 未就绪
        A->>DB: INSERT preload_task + preload_node_task
        A->>Node: 异步拉取
        A->>A: 等待镜像就绪后再调度
    end
```

---

## 附录：与现有模块的关系

```mermaid
flowchart LR
    subgraph 镜像与模板
        BI[基础镜像]
        CI[社区镜像]
        CMI[自定义镜像]
        AT[应用模板]
        GT[GPU配置模板]
    end

    subgraph apps/gpus 用户交互
        IMG[部署页-镜像选择]
        APP[应用商店]
        PRE[预加载管理]
        SAVE[从实例保存镜像]
    end

    subgraph apps/web 运营
        BIM[基础镜像管理]
        CIR[社区镜像审核]
        ATM[应用模板管理]
        GTM[GPU模板管理]
    end

    subgraph core 基础设施
        SPD[SkyPilot 调度]
        NODE[节点 Agent]
        REG[镜像仓库]
    end

    BI --> IMG
    CI --> IMG
    CMI --> IMG
    AT --> APP
    AT --> IMG
    GT --> IMG

    BI --> BIM
    CI --> CIR
    AT --> ATM
    GT --> GTM

    IMG --> SPD
    PRE --> NODE
    SAVE --> SPD
    NODE --> REG
    CMI --> REG
```

