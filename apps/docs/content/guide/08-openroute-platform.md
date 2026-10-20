# 第八章：GPURun 平台应用部署

> 部署 GPURun Cloud 的 Next.js 应用集群（gpus、web、merchant、supplier、api、docs）、数据库迁移和推理网关。

---

## 8.1 构建 Docker 镜像

### 8.1.1 构建所有镜像

```bash
# 在代码仓库根目录
pnpm install

# 构建 Docker 镜像
docker build -f docker/Dockerfile --target web -t ${GPURun_IMAGE}/web:latest .
docker build -f docker/Dockerfile --target api -t ${GPURun_IMAGE}/api:latest .
docker build -f docker/Dockerfile --target docs -t ${GPURun_IMAGE}/docs:latest .

# 推送到镜像仓库
docker push ${GPURun_IMAGE}/web:latest
docker push ${GPURun_IMAGE}/api:latest
docker push ${GPURun_IMAGE}/docs:latest
```

### 8.1.2 单应用独立构建

```bash
# 分别构建各应用
docker build -f apps/gpus/Dockerfile -t ${GPURun_IMAGE}/gpus:latest .
docker build -f apps/web/Dockerfile -t ${GPURun_IMAGE}/web-admin:latest .
docker build -f apps/merchant/Dockerfile -t ${GPURun_IMAGE}/merchant:latest .
docker build -f apps/supplier/Dockerfile -t ${GPURun_IMAGE}/supplier:latest .
```

---

## 8.2 数据库初始化

### 8.2.1 运行数据库迁移

```bash
# 连接到 PostgreSQL
export DATABASE_URL="postgresql://GPURun:<PASSWORD>@GPURun-db-rw.database.svc:5432/GPURun"

# 生成 Drizzle 迁移
pnpm --filter @workspace/db run db:generate

# 执行迁移
pnpm --filter @workspace/db run db:migrate

# 初始化平台管理员账号
pnpm --filter @workspace/db run db:seed:admin

# 初始化 GPU 卡型主数据
pnpm --filter @workspace/db run db:seed:metal
```

### 8.2.2 关键数据表确认

```sql
-- 连接数据库验证关键表
psql $DATABASE_URL -c "\dt" | grep -E "organization|tenant|compute_task|supplier_device|gpu_card_type"
```

---

## 8.3 创建 K8s Secrets

```bash
# 数据库连接
kubectl --kubeconfig=$CENTRAL_KUBECONFIG create secret generic GPURun-db \
  --from-literal=DATABASE_URL="postgresql://GPURun:<PASSWORD>@GPURun-db-rw.database.svc:5432/GPURun" \
  -n GPURun-system

# 认证密钥
kubectl --kubeconfig=$CENTRAL_KUBECONFIG create secret generic GPURun-auth \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -n GPURun-system

# Redis 连接
kubectl --kubeconfig=$CENTRAL_KUBECONFIG create secret generic GPURun-redis \
  --from-literal=REDIS_URL="redis://:<PASSWORD>@redis-master.cache.svc:6379" \
  -n GPURun-system

# OSS 存储（阿里云）
kubectl --kubeconfig=$CENTRAL_KUBECONFIG create secret generic GPURun-oss \
  --from-literal=STORAGE_ACCESS_KEY_ID="<YOUR_KEY>" \
  --from-literal=STORAGE_SECRET_ACCESS_KEY="<YOUR_SECRET>" \
  --from-literal=STORAGE_BUCKET_NAME="GPURun-storage" \
  --from-literal=STORAGE_REGION="cn-hangzhou" \
  --from-literal=STORAGE_OSS_SECURE="true" \
  -n GPURun-system
```

---

## 8.4 部署平台应用

### 8.4.1 用户控制台 (apps/gpus)

```yaml
# gpus-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gpus-app
  namespace: GPURun-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gpus-app
  template:
    metadata:
      labels:
        app: gpus-app
    spec:
      containers:
        - name: gpus
          image: ${GPURun_IMAGE}/gpus:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: GPURun-db
            - secretRef:
                name: GPURun-auth
            - secretRef:
                name: GPURun-redis
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "2"
              memory: 4Gi
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: gpus-app
  namespace: GPURun-system
spec:
  selector:
    app: gpus-app
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

### 8.4.2 运营平台 (apps/web)

```yaml
# web-admin-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-admin
  namespace: GPURun-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-admin
  template:
    spec:
      containers:
        - name: web-admin
          image: ${GPURun_IMAGE}/web-admin:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: GPURun-db
            - secretRef:
                name: GPURun-auth
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: "2"
              memory: 4Gi
---
apiVersion: v1
kind: Service
metadata:
  name: web-admin
  namespace: GPURun-system
spec:
  selector:
    app: web-admin
  ports:
    - port: 80
      targetPort: 3000
```

### 8.4.3 API Server (apps/api)

```yaml
# api-server-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: GPURun-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    spec:
      containers:
        - name: api
          image: ${GPURun_IMAGE}/api:latest
          ports:
            - containerPort: 8080
          envFrom:
            - secretRef:
                name: GPURun-db
            - secretRef:
                name: GPURun-auth
          resources:
            requests:
              cpu: 500m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 2Gi
---
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: GPURun-system
spec:
  selector:
    app: api-server
  ports:
    - port: 80
      targetPort: 8080
```

### 8.4.4 商户平台 (apps/merchant) + 供应商门户 (apps/supplier)

```yaml
# merchant-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: merchant-app
  namespace: GPURun-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: merchant-app
  template:
    spec:
      containers:
        - name: merchant
          image: ${GPURun_IMAGE}/merchant:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: GPURun-db
            - secretRef:
                name: GPURun-auth
---
apiVersion: v1
kind: Service
metadata:
  name: merchant-app
  namespace: GPURun-system
spec:
  selector:
    app: merchant-app
  ports:
    - port: 80
      targetPort: 3000
```

```bash
# 供应商门户类似
kubectl --kubeconfig=$CENTRAL_KUBECONFIG apply -f supplier-deployment.yaml
```

---

## 8.5 部署 Traefik 推理网关

### 8.5.1 安装 Traefik

```bash
helm repo add traefik https://traefik.github.io/charts

helm install traefik traefik/traefik \
  --namespace traefik \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --create-namespace \
  --set service.type=LoadBalancer \
  --set ports.web.port=80 \
  --set ports.websecure.port=443 \
  --set additionalArguments[0]="--entryPoints.web.http.redirections.entryPoint.to=websecure" \
  --set logs.access.enable=true \
  --set forwardingTimeouts.readTimeout=300s
```

### 8.5.2 配置推理路由

```yaml
# inference-ingressroute.yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: inference-gateway
  namespace: GPURun-system
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`inference.platform.com`)
      kind: Rule
      middlewares:
        - name: forwardauth-middleware
      services:
        - name: skypilot-api
          port: 8888
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: forwardauth-middleware
  namespace: GPURun-system
spec:
  forwardAuth:
    address: "http://api-server.GPURun-system.svc/auth/verify"
    trustForwardHeader: true
    authResponseHeaders:
      - X-Org-Id
```

### 8.5.3 配置 TLS

```yaml
# tls-certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: inference-tls
  namespace: GPURun-system
spec:
  secretName: inference-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - inference.platform.com
    - console.platform.com
```

---

## 8.6 部署定时计费服务

```yaml
# billing-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: billing-deduction
  namespace: GPURun-system
spec:
  schedule: "*/5 * * * *"  # 每 5 分钟
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: billing
              image: ${GPURun_IMAGE}/api:latest
              command: ["node", "dist/billing-cron.js"]
              envFrom:
                - secretRef:
                    name: GPURun-db
          restartPolicy: OnFailure
```

---

## 8.7 配置 HPA（自动扩缩）

```yaml
# gpus-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gpus-app-hpa
  namespace: GPURun-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gpus-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## 8.8 验证检查清单

| 检查项 | 命令 | 预期结果 |
|--------|------|---------|
| 所有 Pod 运行 | `kubectl get pods -n GPURun-system` | 全部 Running |
| DB 迁移成功 | `psql $DATABASE_URL -c "\dt"` | 表存在 |
| Gpus App | `kubectl port-forward svc/gpus-app 40031:80` | 页面可访问 |
| Web Admin | `kubectl port-forward svc/web-admin 40041:80` | 页面可访问 |
| API Server | `curl http://api-server.GPURun-system.svc/health` | 200 OK |
| Traefik | `kubectl get ingressroute -n traefik` | 路由配置存在 |
| TLS 证书 | `kubectl get certificate -n GPURun-system` | Ready=True |
| 定时计费 | `kubectl get cronjob -n GPURun-system` | billing-deduction 存在 |
