/**
 * Legacy GPU Cloud console nav — kept for transitional URL compatibility.
 * Not rendered in the default crossborder console sidebar.
 */

export type LegacyGpuNavTitleKey =
  | 'nav.usage'
  | 'nav.apps'
  | 'nav.templates'
  | 'nav.deployInstance'
  | 'nav.myInstances'
  | 'nav.deployServerless'
  | 'nav.myEndpoints'
  | 'nav.deployMetal'
  | 'nav.myMetalInstances'
  | 'nav.preloaded'
  | 'nav.storage'
  | 'nav.tasks'
  | 'nav.settings'
  | 'nav.billing'
  | 'nav.recharge'
  | 'docs'

export type LegacyGpuNavItemConfig = {
  url: string
  titleKey: LegacyGpuNavTitleKey
}

export type LegacyGpuNavGroupConfig = {
  groupKey?: 'groups.instances' | 'groups.serverless' | 'groups.metal' | 'groups.other'
  items: LegacyGpuNavItemConfig[]
}

export const LEGACY_GPU_CONSOLE_NAV_GROUPS: LegacyGpuNavGroupConfig[] = [
  {
    items: [
      { url: '/console/usage', titleKey: 'nav.usage' },
      { url: '/console/apps', titleKey: 'nav.apps' },
      { url: '/console/templates', titleKey: 'nav.templates' },
    ],
  },
  {
    groupKey: 'groups.instances',
    items: [
      { url: '/console/server/list', titleKey: 'nav.deployInstance' },
      { url: '/console/server/instances', titleKey: 'nav.myInstances' },
    ],
  },
  {
    groupKey: 'groups.serverless',
    items: [
      { url: '/console/serverless/deploy', titleKey: 'nav.deployServerless' },
      { url: '/console/serverless/instances', titleKey: 'nav.myEndpoints' },
    ],
  },
  {
    groupKey: 'groups.metal',
    items: [
      { url: '/console/metal/list', titleKey: 'nav.deployMetal' },
      { url: '/console/metal/instances', titleKey: 'nav.myMetalInstances' },
    ],
  },
  {
    groupKey: 'groups.other',
    items: [
      { url: '/console/preloaded', titleKey: 'nav.preloaded' },
      { url: '/console/storage', titleKey: 'nav.storage' },
      { url: '/console/tasks', titleKey: 'nav.tasks' },
    ],
  },
]

export const LEGACY_GPU_FOOTER_NAV: LegacyGpuNavItemConfig[] = [
  { url: '/console/settings', titleKey: 'nav.settings' },
  { url: '/console/billing', titleKey: 'nav.billing' },
  { url: '/console/recharge', titleKey: 'nav.recharge' },
]
