#!/bin/bash

# 配置变量
PROJECT_ID="open-shop"

# --- DEBUG 控制开关 ---
# 设置为 "true" 会输出详细的调试信息
# 设置为 "false" (默认) 只输出必要信息
DEBUG_MODE="false"
# -----------------------

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m' # 新增洋红色
NC='\033[0m' # No Color

# 验证必要的环境变量
if [ -z "$PROJECT_ID" ] || [ -z "$VERCEL_ACCESS_TOKEN" ]; then
  echo -e "${RED}错误: 请设置 PROJECT_ID 和 VERCEL_ACCESS_TOKEN${NC}"
  exit 1
fi

echo -e "${YELLOW}开始获取项目部署列表...${NC}"

# 构建获取项目详细信息的 API URL
PROJECT_DETAILS_API_URL="https://api.vercel.com/v9/projects/${PROJECT_ID}"
if [ -n "$TEAM_ID" ]; then
  PROJECT_DETAILS_API_URL="${PROJECT_DETAILS_API_URL}?teamId=${TEAM_ID}"
fi

if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "DEBUG: PROJECT_DETAILS_API_URL = $PROJECT_DETAILS_API_URL"
fi

# 获取项目详细信息以找到当前生产部署 ID
PROJECT_DETAILS_RESPONSE=$(curl -s "${PROJECT_DETAILS_API_URL}" \
  -H "Authorization: Bearer ${VERCEL_ACCESS_TOKEN}")

if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "DEBUG: PROJECT_DETAILS_RESPONSE (truncated) = ${PROJECT_DETAILS_RESPONSE:0:500}..."
fi

if echo "$PROJECT_DETAILS_RESPONSE" | grep -q '"error"'; then
  echo -e "${RED}获取项目详细信息失败:${NC}"
  echo "$PROJECT_DETAILS_RESPONSE"
  exit 1
fi

CURRENT_PRODUCTION_DEPLOYMENT_ID=$(echo "$PROJECT_DETAILS_RESPONSE" | jq -r '.targets.production.id // empty')

if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "DEBUG: CURRENT_PRODUCTION_DEPLOYMENT_ID = '$CURRENT_PRODUCTION_DEPLOYMENT_ID'"
  echo "DEBUG: Hex dump of CURRENT_PRODUCTION_DEPLOYMENT_ID: $(echo -n "$CURRENT_PRODUCTION_DEPLOYMENT_ID" | od -c)"
fi

if [ -z "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]; then
  echo -e "${YELLOW}警告: 未能识别当前生产部署，可能项目没有配置生产目标或生产部署不存在。${NC}"
fi

# 构建获取部署列表的 API URL
DEPLOYMENTS_API_URL="https://api.vercel.com/v7/deployments?projectId=${PROJECT_ID}&limit=100"
if [ -n "$TEAM_ID" ]; then
  DEPLOYMENTS_API_URL="${DEPLOYMENTS_API_URL}&teamId=${TEAM_ID}"
fi

# 获取部署列表
DEPLOYMENTS_RESPONSE=$(curl -s "${DEPLOYMENTS_API_URL}" \
  -H "Authorization: Bearer ${VERCEL_ACCESS_TOKEN}")

# 检查请求是否成功
if echo "$DEPLOYMENTS_RESPONSE" | grep -q '"error"'; then
  echo -e "${RED}获取部署列表失败:${NC}"
  echo "$DEPLOYMENTS_RESPONSE"
  exit 1
fi

# --- 关键修改在这里：将 .id 改为 .uid ---
DEPLOYMENTS=$(echo "$DEPLOYMENTS_RESPONSE" | jq -r '.deployments[] | "\(.uid // "MISSING_UID_FROM_API")|\(.meta.githubCommitSha // "N/A")|\(.createdAt // 0)|\(.state // "UNKNOWN")"')
# ----------------------------------------

if [ -z "$DEPLOYMENTS" ]; then
  echo -e "${YELLOW}未找到任何部署${NC}"
  exit 0
fi

# 显示部署列表
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  # │ 线上 │ 状态   │ 创建时间          │ Commit (前8位)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"

INDEX=1
declare -A ID_MAP
declare -A COMMIT_MAP
declare -A CREATED_MAP
declare -A STATUS_MAP

while IFS='|' read -r ID COMMIT CREATED STATE; do
  ID_MAP[$INDEX]="$ID"
  COMMIT_MAP[$INDEX]="${COMMIT:0:8}"
  
  # 格式化创建时间
  CREATED_TIME=$(date -d "@$((CREATED / 1000))" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "$CREATED")
  CREATED_MAP[$INDEX]="$CREATED_TIME"
  STATUS_MAP[$INDEX]="$STATE"
  
  # 状态颜色显示
  STATUS_DISPLAY=""
  if [ "$STATE" = "READY" ]; then
    STATUS_DISPLAY="${GREEN}READY ${NC}"
  elif [ "$STATE" = "ERROR" ]; then
    STATUS_DISPLAY="${RED}ERROR ${NC}"
  else
    STATUS_DISPLAY="${YELLOW}$STATE${NC}"
  fi

  # 标记当前线上部署
  LIVE_MARKER=" "
  if [[ "$DEBUG_MODE" == "true" ]] && [ "$INDEX" -eq 1 ]; then # 只为第一个部署打印详细比较信息
    echo "DEBUG: Inside loop for deployment #1:"
    echo "DEBUG:   Comparing ID: '$ID'"
    echo "DEBUG:   Hex dump of ID: $(echo -n "$ID" | od -c)"
    echo "DEBUG:   with CURRENT_PRODUCTION_DEPLOYMENT_ID: '$CURRENT_PRODUCTION_DEPLOYMENT_ID'"
    echo "DEBUG:   Hex dump of CURRENT_PRODUCTION_DEPLOYMENT_ID: $(echo -n "$CURRENT_PRODUCTION_DEPLOYMENT_ID" | od -c)"
    if [ "$ID" = "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]; then
      echo "DEBUG:   String comparison is TRUE."
    else
      echo "DEBUG:   String comparison is FALSE."
    fi
  fi

  if [ -n "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ] && [ "$ID" != "MISSING_UID_FROM_API" ] && [ "$ID" = "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]; then
    LIVE_MARKER="${MAGENTA}◆${NC}" # 洋红色菱形标记
  fi
  
  printf "%3d │ %-4b │ %-6b │ %-17s │ %s\n" "$INDEX" "$LIVE_MARKER" "$STATUS_DISPLAY" "$CREATED_TIME" "${COMMIT:0:8}"
  ((INDEX++))
done <<< "$DEPLOYMENTS"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"

# 获取用户选择
echo ""
echo -e "${YELLOW}请选择要删除的部署 (输入编号，用空格或逗号分隔，例如: 2 3 5 或 2,3,5)${NC}"
echo -e "${YELLOW}输入 'all' 删除所有非 READY 状态且非当前线上的部署，输入 'q' 取消操作${NC}"
read -p "您的选择: " USER_INPUT

# 处理用户输入
if [ "$USER_INPUT" = "q" ]; then
  echo -e "${YELLOW}操作已取消${NC}"
  exit 0
fi

TO_DELETE=()

if [ "$USER_INPUT" = "all" ]; then
  # 删除所有非 READY 状态且非当前线上的部署
  INDEX=1
  while IFS='|' read -r ID COMMIT CREATED STATE; do
    if [ "$ID" != "MISSING_UID_FROM_API" ] && [ "$STATE" != "READY" ] && [ "$ID" != "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]; then
      TO_DELETE+=("$INDEX")
    fi
    ((INDEX++))
  done <<< "$DEPLOYMENTS"
else
  # 解析用户输入的编号
  # 同时支持空格和逗号分隔
  USER_INPUT=${USER_INPUT//,/ }
  for NUM in $USER_INPUT; do
    if [[ "$NUM" =~ ^[0-9]+$ ]] && [ "$NUM" -gt 0 ] && [ "$NUM" -lt "$INDEX" ]; then
      DEPLOYMENT_ID_TO_CHECK="${ID_MAP[$NUM]}"
      if [ -n "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ] && [ "$DEPLOYMENT_ID_TO_CHECK" = "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]; then
        echo -e "${RED}警告: 部署 [$NUM] 是当前线上服务，不能删除。已跳过。${NC}"
      elif [ "$DEPLOYMENT_ID_TO_CHECK" = "MISSING_UID_FROM_API" ]; then
         echo -e "${RED}警告: 部署 [$NUM] 缺少 UID (MISSING_UID_FROM_API)，无法删除。已跳过。${NC}"
      else
        TO_DELETE+=("$NUM")
      fi
    else
      echo -e "${RED}警告: '$NUM' 不是有效的编号，跳过${NC}"
    fi
  done
fi

# 验证选择
if [ ${#TO_DELETE[@]} -eq 0 ]; then
  echo -e "${YELLOW}没有有效的部署被选中${NC}"
  exit 0
fi

# 显示确认信息
echo ""
echo -e "${YELLOW}=== 确认删除 ===${NC}"
for SEL_INDEX in "${TO_DELETE[@]}"; do
  ID="${ID_MAP[$SEL_INDEX]}"
  COMMIT="${COMMIT_MAP[$SEL_INDEX]}"
  CREATED="${CREATED_MAP[$SEL_INDEX]}"
  STATUS="${STATUS_MAP[$SEL_INDEX]}"
  
  echo "  [$SEL_INDEX] ID: ${ID:0:12}... | 状态: $STATUS | 创建时间: $CREATED | Commit: $COMMIT"
done

echo ""
read -p "确认删除上述部署? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}操作已取消${NC}"
  exit 0
fi

# 执行删除
echo ""
echo -e "${YELLOW}开始删除...${NC}"
DELETED_COUNT=0
FAILED_COUNT=0

for SEL_INDEX in "${TO_DELETE[@]}"; do
  DEPLOYMENT_ID="${ID_MAP[$SEL_INDEX]}"
  
  if [ "$DEPLOYMENT_ID" = "MISSING_UID_FROM_API" ]; then
    echo -e "${RED}警告: 部署 [$SEL_INDEX] 缺少 UID，无法删除。${NC}"
    ((FAILED_COUNT++))
    continue
  fi

  echo -n "删除 [${SEL_INDEX}] ${DEPLOYMENT_ID:0:12}... "
  
  DELETE_RESPONSE=$(curl -s -X DELETE \
    "https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}" \
    -H "Authorization: Bearer ${VERCEL_ACCESS_TOKEN}")
  
  if echo "$DELETE_RESPONSE" | grep -q '"error"'; then
    echo -e "${RED}失败${NC}"
    ERROR_MSG=$(echo "$DELETE_RESPONSE" | jq -r '.error.message // .error // "未知错误"' 2>/dev/null)
    echo "  错误: $ERROR_MSG"
    ((FAILED_COUNT++))
  else
    echo -e "${GREEN}成功${NC}"
    ((DELETED_COUNT++))
  fi
done

# 最终总结
echo ""
echo -e "${YELLOW}=== 删除完成 ===${NC}"
echo -e "成功删除: ${GREEN}${DELETED_COUNT}${NC} 个部署"
if [ $FAILED_COUNT -gt 0 ]; then
  echo -e "删除失败: ${RED}${FAILED_COUNT}${NC} 个部署"
fi