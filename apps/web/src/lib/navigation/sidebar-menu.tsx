import {
  AppWindow,
  Ban,
  BarChart3,
  Building2,
  ClipboardCheck,
  Computer,
  Cpu,
  CreditCard,
  Factory,
  FileCheck2,
  FileText,
  FolderKanban,
  HardDriveDownload,
  HelpCircle,
  ImageIcon,
  Layers,
  LayoutDashboard,
  ListTodo,
  Network,
  Server,
  Settings,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Ticket,
  Timer,
  Users,
  Wallet,
  Zap,
  Landmark,
  SlidersHorizontal,
} from 'lucide-react'
import { DollarSignIcon } from 'lucide-react'
import type { AppRole } from '@/lib/auth/app-role'
import {
  filterMenuItems,
  filterSidebarGroups,
  type MenuItem,
  type MenuSection,
  type SidebarNavGroup,
} from './menu-config'

const ALL_ROLES = ['admin', 'user', 'member'] as AppRole[]
const ADMIN_ONLY: AppRole[] = ['admin']
const ADMIN_MEMBER: AppRole[] = ['admin', 'member']
const ADMIN_USER: AppRole[] = ['admin', 'user']

const navMain: MenuItem[] = [
  { title: '系统卡型', url: '/supplier/gpu-card-types', icon: <Cpu className="size-4" />, roles: ALL_ROLES },
]

const navImageTemplate: MenuItem[] = [
  { title: '基础镜像管理', url: '/platform/images/base', icon: <Layers className="size-4" />, roles: ADMIN_ONLY },
  { title: '自定义镜像审计', url: '/platform/images', icon: <ImageIcon className="size-4" />, roles: ADMIN_ONLY },
  { title: '应用模板管理', url: '/platform/templates/app', icon: <AppWindow className="size-4" />, roles: ADMIN_ONLY },
  { title: '预加载监控', url: '/platform/preload', icon: <HardDriveDownload className="size-4" />, roles: ADMIN_ONLY },
]

const navSupply: MenuItem[] = [
  { title: '资源总览', url: '/supplier/overview', icon: <BarChart3 className="size-4" />, roles: ADMIN_MEMBER },
  { title: '供应商', url: '/supplier/suppliers', icon: <Factory className="size-4" />, roles: ADMIN_MEMBER },
  { title: '入驻审核', url: '/supplier/onboarding', icon: <ClipboardCheck className="size-4" />, roles: ADMIN_ONLY },
  { title: '商务合同', url: '/supplier/contracts', icon: <FileText className="size-4" />, roles: ADMIN_MEMBER },
  { title: '机房管理', url: '/supplier/datacenters', icon: <Server className="size-4" />, roles: ADMIN_MEMBER },
  { title: '机房 SLA', url: '/supplier/sla', icon: <ShieldCheck className="size-4" />, roles: ADMIN_MEMBER },
  { title: '设备管理', url: '/supplier/devices', icon: <Computer className="size-4" />, roles: ADMIN_MEMBER },
  { title: '设备库存', url: '/supplier/inventory', icon: <Cpu className="size-4" />, roles: ADMIN_MEMBER },
  { title: '裸金属订单', url: '/supplier/bare-metal-orders', icon: <ShoppingCart className="size-4" />, roles: ADMIN_MEMBER },
  { title: '计划批次', url: '/supplier/online-tasks', icon: <ListTodo className="size-4" />, roles: ADMIN_MEMBER },
  { title: '自动上架配置', url: '/supplier/auto-onboarding', icon: <Zap className="size-4" />, roles: ADMIN_MEMBER },
  { title: '网关节点审核', url: '/supplier/gateway-nodes', icon: <Network className="size-4" />, roles: ADMIN_MEMBER },
  { title: '发票申请审核', url: '/supplier/invoice-requests', icon: <FileCheck2 className="size-4" />, roles: ADMIN_MEMBER },
  { title: '平台对账', url: '/supplier/reconciliation', icon: <Scale className="size-4" />, roles: ADMIN_MEMBER },
]

function sectionOf(items: MenuItem[], urls: string[]): MenuItem[] {
  return urls.map((url) => {
    const item = items.find((entry) => entry.url === url)
    if (!item) throw new Error(`未在菜单项中找到 ${url}`)
    return item
  })
}

const navCrm: MenuItem[] = [
  { title: '工作台', url: '/crm/workbench', icon: <LayoutDashboard className="size-4" />, roles: ADMIN_USER },
  { title: '客户管理', url: '/crm/customers', icon: <Building2 className="size-4" />, roles: ADMIN_USER },
  { title: '实名审核', url: '/crm/identity-reviews', icon: <ShieldCheck className="size-4" />, roles: ADMIN_USER },
  { title: '计费租户', url: '/crm/tenants', icon: <Wallet className="size-4" />, roles: ADMIN_USER },
  { title: '租户黑名单', url: '/crm/tenant-blacklist', icon: <Ban className="size-4" />, roles: ALL_ROLES },
  { title: '平台项目', url: '/crm/projects', icon: <FolderKanban className="size-4" />, roles: ADMIN_USER },
  {
    title: '算力券模板',
    url: '/crm/discount-templates',
    icon: <Ticket className="size-4" />,
    roles: ADMIN_ONLY,
  },
  { title: '员工', url: '/crm/staff', icon: <Users className="size-4" />, roles: ADMIN_ONLY },
]

const navMerchant: MenuItem[] = [
  { title: '商户管理', url: '/merchant', icon: <Store className="size-4" />, roles: ADMIN_USER },
  {
    title: '收款账户审核',
    url: '/merchant/payout-accounts',
    icon: <Landmark className="size-4" />,
    roles: ADMIN_USER,
  },
  {
    title: '财务配置',
    url: '/merchant/finance-config',
    icon: <SlidersHorizontal className="size-4" />,
    roles: ADMIN_ONLY,
  },
  {
    title: '专用收款账户',
    url: '/merchant/receiving-accounts',
    icon: <Landmark className="size-4" />,
    roles: ADMIN_USER,
  },
  {
    title: '转账凭证核销',
    url: '/merchant/transfer-proofs',
    icon: <ClipboardCheck className="size-4" />,
    roles: ADMIN_USER,
  },
  {
    title: '算力券管理',
    url: '/merchant/vouchers',
    icon: <Ticket className="size-4" />,
    roles: ADMIN_USER,
  },
]

const navMarketplace: MenuItem[] = [
  { title: '运营月报', url: '/finance/monthly-report', icon: <BarChart3 className="size-4" />, roles: ADMIN_ONLY },
  { title: '账期管理', url: '/finance', icon: <CreditCard className="size-4" />, roles: ADMIN_ONLY },
  { title: '租户卡时消费', url: '/finance/tenant-region-gpu-consumption', icon: <Wallet className="size-4" />, roles: ADMIN_ONLY },
  { title: '平台定价', url: '/supplier/platform-pricing', icon: <Sparkles className="size-4" />, roles: ADMIN_MEMBER },
  { title: '机房成本', url: '/supplier/unit-costs', icon: <DollarSignIcon className="size-4" />, roles: ADMIN_ONLY },
]

const navScheduling: MenuItem[] = [
  { title: '调度规则', url: '/scheduling/rules', icon: <Timer className="size-4" />, roles: ADMIN_ONLY },
]

const navSecondary: MenuItem[] = [
  { title: '设置', url: '/settings', icon: <Settings className="size-4" />, roles: ALL_ROLES },
  { title: '帮助', url: '/help', icon: <HelpCircle className="size-4" />, roles: ALL_ROLES },
]

const supplySections: MenuSection[] = [
  {
    key: 'supplyVendor',
    label: '资源与合同',
    items: sectionOf(navSupply, [
      '/supplier/overview',
      '/supplier/suppliers',
      '/supplier/onboarding',
      '/supplier/contracts',
    ]),
  },
  {
    key: 'supplyInfra',
    label: '机房与设备',
    items: sectionOf(navSupply, [
      '/supplier/datacenters',
      '/supplier/sla',
      '/supplier/devices',
      '/supplier/inventory',
      '/supplier/bare-metal-orders',
      '/supplier/online-tasks',
      '/supplier/auto-onboarding',
    ]),
  },
  {
    key: 'supplyAudit',
    label: '审核与结算',
    items: sectionOf(navSupply, [
      '/supplier/gateway-nodes',
      '/supplier/invoice-requests',
      '/supplier/reconciliation',
    ]),
  },
]

const crmSections: MenuSection[] = [
  {
    key: 'crmCustomer',
    label: '客户与项目',
    items: navCrm.slice(0, 6),
  },
  {
    key: 'crmOps',
    label: '运营配置',
    items: navCrm.slice(6),
  },
]

const merchantSections: MenuSection[] = [
  {
    key: 'merchantAccount',
    label: '商户与账户',
    items: sectionOf(navMerchant, [
      '/merchant',
      '/merchant/payout-accounts',
      '/merchant/receiving-accounts',
    ]),
  },
  {
    key: 'merchantSettlement',
    label: '资金与权益',
    items: sectionOf(navMerchant, [
      '/merchant/transfer-proofs',
      '/merchant/vouchers',
      '/merchant/finance-config',
    ]),
  },
]

const financeSections: MenuSection[] = [
  {
    key: 'financeIncome',
    label: '收入与账期',
    items: navMarketplace.slice(0, 3),
  },
  {
    key: 'financeCost',
    label: '成本与定价',
    items: navMarketplace.slice(3),
  },
]

/**
 * 侧边栏分组（工作区）。顶部 Select 切换后只渲染当前分组的分段，
 * 分组内仍按「小标题 + 链接列表」分段，权限由每个条目的 roles 决定，空段/空分组自动剔除。
 */
const sidebarGroups: SidebarNavGroup[] = [
  {
    key: 'platform',
    label: '平台总览',
    icon: <LayoutDashboard className="size-4" />,
    prefixes: ['/dashboard/global', '/supplier/gpu-card-types', '/platform', '/scheduling'],
    sections: [
      { key: 'platformOverview', items: navMain },
      { key: 'imageTemplate', label: '镜像与模板', items: navImageTemplate },
      { key: 'scheduling', label: '调度管理', items: navScheduling },
    ],
  },
  {
    key: 'supply',
    label: '算力供应链',
    icon: <Server className="size-4" />,
    prefixes: ['/supplier'],
    sections: supplySections,
  },
  {
    key: 'crm',
    label: '客户经营',
    icon: <Users className="size-4" />,
    prefixes: ['/crm'],
    sections: crmSections,
  },
  {
    key: 'merchant',
    label: '商户运营',
    icon: <Store className="size-4" />,
    prefixes: ['/merchant'],
    sections: merchantSections,
  },
  {
    key: 'finance',
    label: '财务管理',
    icon: <Wallet className="size-4" />,
    prefixes: ['/finance', '/supplier/platform-pricing', '/supplier/unit-costs'],
    sections: financeSections,
  },
]

export function getSidebarGroups(role: AppRole | null) {
  return filterSidebarGroups(sidebarGroups, role)
}

export function getSidebarSecondaryItems(role: AppRole | null) {
  return filterMenuItems(navSecondary, role)
}
