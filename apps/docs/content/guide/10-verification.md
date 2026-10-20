# 第十章：部署验证与调优

> 所有组件部署完成后的端到端验证、性能调优、常见问题排查。**包含裸金属设备纳管和订单全流程验证**。

---

## 10.1 端到端功能验证

### 10.1.1 验证流程

```
1. 用户注册登录 → 创建组织
2. 充值余额
3. 提交 GPU 云服务器任务
4. 确认任务在 IDC 集群运行
5. 停止实例
6. 查看账单
7. 提交批处理任务
8. 创建推理服务
```

### 10.1.2 自动化验证脚本

```bash
#!/bin/bash
# e2e-verify.sh — 端到端验证脚本
set -euo pipefail

API_BASE="https://api.platform.com"

echo "=== 1. 验证平台 API 健康 ==="
curl -sf ${API_BASE}/health || { echo "FAIL: API not reachable"; exit 1; }
echo "PASS: API healthy"

echo ""
echo "=== 2. 验证 Karmada 集群 ==="
karmada get clusters
karmada_ready=$(karmada get clusters -o json | jq '[.items[] | select(.status.conditions[] | select(.type=="Ready" and .status=="True"))] | length')
echo "PASS: ${karmada_ready} clusters ready"

echo ""
echo "=== 3. 验证 IDC GPU 节点 ==="
for ctx in idc-a-beijing idc-b-shanghai; do
  gpu_nodes=$(kubectl --context=$ctx get nodes -l nvidia.com/gpu.present=true --no-headers 2>/dev/null | wc -l)
  echo "  ${ctx}: ${gpu_nodes} GPU nodes"
done

echo ""
echo "=== 4. 验证 Capsule 多租户 ==="
for ctx in idc-a-beijing idc-b-shanghai; do
  tenants=$(kubectl --context=$ctx get tenants -A --no-headers 2>/dev/null | wc -l)
  echo "  ${ctx}: ${tenants} tenants"
done

echo ""
echo "=== 5. 验证 Volcano 调度 ==="
for ctx in idc-a-beijing idc-b-shanghai; do
  queues=$(kubectl --context=$ctx get queues --no-headers 2>/dev/null | wc -l)
  echo "  ${ctx}: ${queues} queues"
done

echo ""
echo "=== 6. 验证 GPU 测试任务 ==="
# 使用 SkyPilot 提交测试任务
sky launch --cloud kubernetes --gpus A100:1 --num-nodes 1 \
  --yaml-str 'run: nvidia-smi' 2>&1 | tee /tmp/sky-test.log
if grep -q "RUNNING" /tmp/sky-test.log; then
  echo "PASS: GPU test task Running"
else
  echo "WARN: GPU test task status unclear, check logs"
fi

echo ""
echo "=== 7. 验证监控 ==="
# Prometheus
prom_up=$(kubectl --context=central get pods -n monitoring -l app.kubernetes.io/name=prometheus --no-headers 2>/dev/null | wc -l)
echo "  Prometheus pods: ${prom_up}"

# DCGM Exporter
for ctx in idc-a-beijing idc-b-shanghai; do
  dcgm=$(kubectl --context=$ctx get pods -n monitoring -l app.kubernetes.io/name=dcgm-exporter --no-headers 2>/dev/null | wc -l)
  echo "  ${ctx} DCGM pods: ${dcgm}"
done

# Grafana
grafana=$(kubectl --context=central get pods -n monitoring -l app.kubernetes.io/name=grafana --no-headers 2>/dev/null | wc -l)
echo "  Grafana pods: ${grafana}"

echo ""
echo "=== 8. 验证裸金属基础设施 ==="
# SSH Gateway
ssh_gw=$(kubectl --context=central get pods -n GPURun-system -l app=ssh-gw --no-headers 2>/dev/null | wc -l)
echo "  SSH Gateway pods: ${ssh_gw}"

# Edge Agent
for ctx in idc-a-beijing idc-b-shanghai; do
  agent=$(kubectl --context=$ctx get pods -n GPURun-system -l app=GPURun-agent --no-headers 2>/dev/null | wc -l)
  echo "  ${ctx} Edge Agent pods: ${agent}"
done

# Btrfs 快照（在裸金属设备上验证）
echo "  Btrfs subvolumes on bare metal devices:"
# ssh root@<bare-metal-ip> "btrfs subvolume list /mnt/system"

# IPMI 连通性（可选 - 仅有 BMC 时验证）
echo "  IPMI connectivity (optional):"
# ipmitool -H <bmc-ip> -U admin -P <pass> power status

# IPMI Exporter（可选 - 仅有 BMC 时部署）
ipmi_exporter=$(kubectl --context=central get pods -n monitoring -l app=ipmi-exporter --no-headers 2>/dev/null | wc -l)
echo "  IPMI Exporter pods: ${ipmi_exporter}"

echo ""
echo "=== 验证完成 ==="
```

---

## 10.2 多租户隔离验证

### 10.2.1 命名空间隔离

```bash
# 验证租户 A 无法访问租户 B 的 Pod
kubectl --context=idc-a-beijing exec -n tenant-alice <pod-a> -- \
  wget -qO- --timeout=5 http://tenant-bob-service:80 2>&1 || echo "PASS: Network blocked"

# 验证同租户 Pod 可以互通
kubectl --context=idc-a-beijing exec -n tenant-alice <pod-a> -- \
  wget -qO- --timeout=5 http://tenant-alice-service:80 && echo "PASS: Intra-tenant allowed"
```

### 10.2.2 ResourceQuota 验证

```bash
# 验证租户无法创建超过配额的 GPU Pod
kubectl --context=idc-a-beijing run over-quota --image=nvidia/cuda:12.4.0-base \
  -n tenant-alice --requests=nvidia.com/gpu=100 --limits=nvidia.com/gpu=100 2>&1
# 预期: Error: exceeded quota
```

### 10.2.3 SkyPilot 租户归属验证

```bash
# 提交任务并验证 metadata 正确注入
sky launch --cloud kubernetes --gpus A100:1 --yaml-str \
  'run: cat /etc/pod-metadata/platform.org-id' 2>&1
# 预期输出: org_abc123 (对应租户)
```

---

## 10.3 跨 IDC 调度验证

```bash
# 提交任务到指定 IDC
sky launch --cloud kubernetes --gpus A100:1 \
  --yaml-str 'run: hostname' --context idc-a-beijing

# 验证任务运行在正确 IDC
sky status
# 预期: cluster 显示 idc-a-beijing

# 提交跨 IDC 任务（让 SkyPilot 选择最优 IDC）
sky launch --cloud kubernetes --gpus A100:1 \
  --yaml-str 'run: hostname && echo "Deployed to $(kubectl config current-context)"'
```

---

## 10.4 裸金属设备纳管验证

### 10.4.1 设备入库验证

```bash
# 1. 验证 Agent 能 SSH 到裸金属设备
ssh root@<bare-metal-ip> "nvidia-smi"
# 预期: GPU 信息表格

# 2. 验证 Btrfs 快照完整性
ssh root@<bare-metal-ip> "btrfs subvolume list /mnt/system"
# 预期: 显示 @base, @snap_pytorch, @snap_miniconda, @snap_cudadev

# 3. 验证 IPMI 连通（可选 - 仅有 BMC 时验证）
# ipmitool -H <bmc-ip> -U admin -P <pass> power status
# 预期: Power is on

# 4. 验证设备在平台上架
# 平台 → 设备管理 → 查看设备列表
# 预期: 设备状态为 "网关直连裸金属上架中" 或 "预留闲置中"
```

### 10.4.2 设备角色验证

```bash
# 验证 compute 角色设备在 K8s 弹性池中
# 平台 → 资源池 → elastic_pool → 查看设备列表

# 验证 bare_metal 角色设备在裸金属专用池中
# 平台 → 资源池 → dedicated_pool → 查看设备列表

# 验证 convertible 角色设备可跨池
# 平台 → 设备管理 → 切换角色 → 验证池归属变更
```

---

## 10.5 裸金属订单全流程验证

### 10.5.1 下单 → 交付 → SSH 访问

```bash
# 1. 用户在 gpus 平台选择裸金属配置
#    - GPU 型号: H100 80GB
#    - 数量: 1 台
#    - 计费周期: hour
#    - SSH 公钥: ssh-rsa AAAA...

# 2. 平台自动交付
#    - 余额检查 → 设备分配 → 创建 Btrfs @inst-{id} → 配置 SSH

# 3. 用户获取 SSH 连接信息
#    - ssh-gw.platform.com:2222
#    - Token: <JWT>

# 4. 用户 SSH 连接
ssh -p 2222 user@ssh-gw.platform.com -o ProxyCommand="ssh-gw-proxy --token=<JWT> --target=<device-ip>"

# 5. 验证 GPU 可用
nvidia-smi
# 预期: H100 80GB 显示
```

### 10.5.2 续费验证

```bash
# 1. 用户手动续费（或等待自动续费）
#    - 平台扣款 → 延长 rentEndsAt → 更新 nextBillingAt

# 2. 验证订单状态
#    - 平台 → 我的订单 → 裸金属 → 查看续费后到期时间

# 3. 验证自动续费 CronJob
kubectl get cronjob -n GPURun-system bare-metal-auto-renew
# 预期: SCHEDULE: */1 * * * *
```

### 10.5.3 停机 → 设备还原验证

```bash
# 1. 用户主动停机（或逾期触发）
#    - 平台调用 Agent device_stop → shutdown -h now

# 2. 验证 SSH 访问断开
ssh -p 2222 user@ssh-gw.platform.com ...
# 预期: Connection refused 或 timeout

# 3. 验证数据清理（Btrfs）
#    - Agent 执行 device_cleanup → 删除 @inst-{id} → 重建模板快照
ssh root@<bare-metal-ip> "btrfs subvolume list /mnt/system"
# 预期: @inst-{id} 已删除，模板快照已重建

# 4. 验证设备回到可分配池
#    - 平台 → 设备管理 → 设备状态为 "网关直连裸金属上架中"
#    - 新订单可分配此设备
```

### 10.5.4 逾期处理验证

```bash
# 1. 创建测试订单，设置较短的 rentEndsAt（如 5 分钟后）
# 2. 等待逾期扫描 CronJob 触发
# 3. 验证订单状态变更: running → overdue → grace → stopped
# 4. 验证 SSH 网关 revoke: 用户无法连接
# 5. 验证 Agent device_stop: 设备关机
# 6. 验证 Btrfs 还原: 用户 subvolume 已删除
# 7. 验证设备释放: 可被新订单分配
```

---

## 10.6 性能调优

### 10.6.1 Kubernetes 调优

```bash
# 1. 调大 Pod 最大数量
# /var/lib/kubelet/config.yaml
maxPods: 220

# 2. 调大 Node 最大 Pod 数（DaemonSet 模式）
# kubelet 参数
--max-pods=220

# 3. 调优 API Server
--max-requests-inflight=400
--max-mutating-requests-inflight=200

# 4. 调优 etcd
--quota-backend-bytes=8589934592  # 8GB
```

### 10.6.2 GPU 节点调优

```bash
# 1. 禁用 PCIe ASPM（影响 GPU 性能）
echo 0 > /sys/module/pcie_aspm/parameters/policy

# 2. 设置 GPU 性能模式
nvidia-smi -ac 1500,1410  # 增加 GPU 时钟频率

# 3. 调大 HugePages
echo 1024 > /proc/sys/vm/nr_hugepages

# 4. 设置 GPU 进程调度策略
nvidia-smi -i 0 -ac 1500,1410
```

### 10.6.3 调度延迟优化

```bash
# SkyPilot 调度延迟目标: < 60s
# 优化点:
# 1. 预拉取镜像（减少 image pull 时间）
# 2. 缩小 Pod 调度范围（nodeAffinity）
# 3. 使用 Volcano 预热队列（deserved > 0）
# 4. Karmada 集群心跳间隔: 30s（默认 60s）
```

---

## 10.7 常见问题排查

### 10.7.1 GPU 节点不被调度

```bash
# 诊断步骤
kubectl get nodes -l nvidia.com/gpu.present=true
kubectl describe node <gpu-node> | grep -A 5 "Taints:"
kubectl get pods --field-selector spec.nodeName=<gpu-node>

# 常见原因:
# 1. 节点有 NoSchedule taint → Pod 需要对应 toleration
# 2. ResourceQuota 超限 → 检查 namespace 配额
# 3. NodeAffinity 不匹配 → 检查节点标签
```

### 10.7.2 Capsule Namespace 创建失败

```bash
# 诊断
kubectl get tenants -n capsule-system
kubectl describe tenant <tenant-name>
kubectl logs -n capsule-system -l control-plane=controller-manager

# 常见原因:
# 1. Capsule CRD 未安装
# 2. 权限不足（RBAC）
# 3. 租户配额超限（namespaceOptions.quota）
```

### 10.7.3 Volcano Gang Scheduling 卡住

```bash
# 诊断
kubectl get vj -n <namespace>
kubectl describe vj <job-name> -n <namespace>
kubectl get events --field-selector reason=FailedScheduling

# 常见原因:
# 1. 队列配额不足 → 增加 queue weight
# 2. minAvailable > 总 GPU → 降低 minAvailable
# 3. 节点资源碎片 → 调整 Pod size
```

### 10.7.4 Edge Agent 无法连接中心 API

```bash
# 诊断
systemctl status GPURun-agent
journalctl -u GPURun-agent -f

curl -v https://api.platform.com/api/agent/heartbeat \
  -H "Authorization: Bearer <token>"

# 常见原因:
# 1. 网络不通 → 检查 VPN/防火墙
# 2. Token 过期 → 重新注册
# 3. 证书问题 → 检查 CA 信任链
```

### 10.7.5 SkyPilot 调度超时

```bash
# 诊断
sky status
sky log <job-id>

# 常见原因:
# 1. 目标集群 GPU 全部被占用 → 检查其他 IDC
# 2. kubeconfig 权限不足 → 检查 RBAC
# 3. Namespace 不存在 → Capsule 未同步
```

---

## 10.8 灾难恢复

### 10.8.1 数据库备份

```bash
# CloudNativePG 自动备份
kubectl get backups -n database

# 手动备份
kubectl exec -it GPURun-db-1 -n database -- \
  pg_dump -U GPURun GPURun > /backup/GPURun-$(date +%Y%m%d).sql

# 恢复
psql $DATABASE_URL < /backup/GPURun-20260726.sql
```

### 10.8.2 中心集群恢复

```bash
# 1. 恢复 etcd
etcdctl snapshot restore /backup/etcd-snapshot.db

# 2. 重新 join Karmada
karmadactl join <cluster-name> \
  --kubeconfig=$CENTRAL_KUBECONFIG \
  --cluster-kubeconfig=$IDC_KUBECONFIG
```

### 10.8.3 IDC 集群恢复

```bash
# 1. 重新安装 K8s（或恢复 etcd）
# 2. 安装 GPU Operator
# 3. 安装 Volcano + Capsule
# 4. 重新注册到 Karmada
karmadactl join <cluster-name> ...
```

---

## 10.9 维护窗口操作

### 10.9.1 IDC 集群维护

```bash
# 1. 驱逐集群（停止新调度）
karmada taint cluster idc-a-beijing platform/maintenance=true:NoSchedule

# 2. 等待 Pod 驱逐完成
kubectl --context=idc-a-beijing drain <node> --ignore-daemonsets --delete-emptydir-data

# 3. 执行维护操作

# 4. 恢复集群
karmada untaint cluster idc-a-beijing platform/maintenance
```

### 10.9.2 GPU 驱动升级

```bash
# 1. 排空节点
kubectl --context=$IDC_KUBECONFIG drain <gpu-node> --ignore-daemonsets

# 2. SSH 到节点升级驱动
ssh <gpu-node>
apt-get update && apt-get install -y nvidia-driver-550
reboot

# 3. 验证
ssh <gpu-node> nvidia-smi

# 4. 恢复节点
kubectl --context=$IDC_KUBECONFIG uncordon <gpu-node>
```

---

## 10.10 验证总结清单

| 检查项 | 命令 | 通过标准 |
|--------|------|---------|
| 中心集群健康 | `kubectl get nodes` | 全部 Ready |
| IDC 集群健康 | `kubectl get nodes --context=$IDC` | 全部 Ready |
| GPU 可分配 | `kubectl get node <gpu> -o jsonpath='{.status.allocatable.nvidia\.com/gpu}'` | > 0 |
| Karmada 联邦 | `karmada get clusters` | 全部 Ready |
| Capsule 运行 | `kubectl get tenants` | 租户存在 |
| Volcano 运行 | `kubectl get queues` | 队列存在 |
| SkyPilot 调度 | `sky launch --gpus A100:1 "nvidia-smi"` | 任务成功 |
| 平台 API | `curl $API_BASE/health` | 200 OK |
| 监控采集 | Prometheus 查询 GPU 指标 | 有数据 |
| 告警规则 | Grafana Alerting | 规则激活 |
| 日志聚合 | Loki 查询 | 可查日志 |
| TLS 证书 | `curl https://console.platform.com` | 证书有效 |
| 计费系统 | 手动触发扣款 | 正确扣减 |
| 租户隔离 | 跨租户网络测试 | 不通 |
| 跨 IDC 调度 | 提交任务到不同 IDC | 调度正确 |
| **SSH Gateway** | `ssh -p 2222 user@ssh-gw` | 连接成功 |
| **裸金属 Btrfs** | `btrfs subvolume list /mnt/system` | @base + 模板存在 |
| **裸金属 IPMI** | `ipmitool -H <bmc> power status`（可选） | Power is on / 无 BMC 则跳过 |
| **裸金属订单** | 下单 → 交付 → SSH → 停机 → 还原 | 全流程通过 |
| **逾期处理** | 创建短租期订单 → 等待逾期 | 自动停机 + 还原 |
| **IPMI Exporter** | Prometheus 查询 ipmi 指标（可选） | 有数据 / 无 BMC 则跳过 |
