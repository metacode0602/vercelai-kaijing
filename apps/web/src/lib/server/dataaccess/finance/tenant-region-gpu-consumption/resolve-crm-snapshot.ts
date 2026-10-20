import { db } from '@/lib/db'
import {
  billingTenant,
  crmProject,
  customer,
  projectConversionSetting,
  tenantProjectCost,
} from '@workspace/db/schema'
import { and, eq, inArray, isNull, lte } from 'drizzle-orm'
import { getTenantDisplayNames, listProjectsForPlatformTenant } from '../enrichment'
import type {
  EnrichmentBindingSource,
  ProjectEnrichmentSnapshotItem,
} from './types'

export type TenantCrmSnapshot = {
  tenantId: string | null
  tenantName: string | null
  customerId: string | null
  customerFullName: string | null
  projectId: string | null
  projectName: string | null
  accountManagerStaffId: string | null
  accountManagerName: string | null
  enrichmentBindingSource: EnrichmentBindingSource
  projectEnrichmentSnapshot: ProjectEnrichmentSnapshotItem[]
  customerIncentiveType: 'new_customer' | 'existing_customer'
  customerIncentiveLabel: '新客' | '老客'
  incentiveStartDate: string | null
}

function lastDayOfMonth(usageMonth: string): string {
  const [y, m] = usageMonth.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  return `${usageMonth}-${String(last).padStart(2, '0')}`
}

export { lastDayOfMonth }

async function loadPresetMap(
  tenantId: string,
  asOf: string,
): Promise<Map<string, string>> {
  const presets = await db
    .select()
    .from(tenantProjectCost)
    .where(
      and(
        eq(tenantProjectCost.tenantId, tenantId),
        isNull(tenantProjectCost.effectiveTo),
        lte(tenantProjectCost.effectiveFrom, asOf),
      ),
    )
  const map = new Map<string, string>()
  for (const row of presets) {
    map.set(row.projectId, row.allocationPercent)
  }
  return map
}

async function loadPrimaryTenantProjectIds(
  tenantId: string,
  projectIds: string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set()
  const rows = await db
    .select({ id: crmProject.id })
    .from(crmProject)
    .where(
      and(
        inArray(crmProject.id, projectIds),
        eq(crmProject.primaryTenantId, tenantId),
      ),
    )
  return new Set(rows.map((r) => r.id))
}

function pickSnapshotProject(input: {
  projects: Awaited<ReturnType<typeof listProjectsForPlatformTenant>>
  tenantId: string
  presetMap: Map<string, string>
  primaryProjectIds: Set<string>
}): { projectId: string | null; source: EnrichmentBindingSource } {
  const { projects, presetMap, primaryProjectIds } = input
  if (projects.length === 0) return { projectId: null, source: 'none' }
  if (projects.length === 1) {
    return { projectId: projects[0]!.projectId, source: 'auto_single' }
  }

  const primaryMatches = projects.filter((p) => primaryProjectIds.has(p.projectId))
  if (primaryMatches.length === 1) {
    return { projectId: primaryMatches[0]!.projectId, source: 'multi_project_primary' }
  }

  const hundredPercent = projects.filter(
    (p) => presetMap.get(p.projectId) === '100' || presetMap.get(p.projectId) === '100.0000',
  )
  if (hundredPercent.length === 1) {
    return { projectId: hundredPercent[0]!.projectId, source: 'auto_preset' }
  }

  const configured = projects.filter((p) => presetMap.has(p.projectId))
  if (configured.length === projects.length && configured.length > 0) {
    const sum = configured.reduce((acc, p) => acc + Number(presetMap.get(p.projectId)), 0)
    if (Math.abs(sum - 100) <= 0.0001) {
      let maxProject = configured[0]!
      let maxPercent = Number(presetMap.get(maxProject.projectId))
      for (const p of configured.slice(1)) {
        const pct = Number(presetMap.get(p.projectId))
        if (pct > maxPercent) {
          maxPercent = pct
          maxProject = p
        } else if (pct === maxPercent) {
          return { projectId: null, source: 'multi_project_unresolved' }
        }
      }
      return { projectId: maxProject.projectId, source: 'auto_preset' }
    }
  }

  return { projectId: null, source: 'multi_project_unresolved' }
}

async function resolveIncentive(projectId: string | null): Promise<{
  customerIncentiveType: 'new_customer' | 'existing_customer'
  customerIncentiveLabel: '新客' | '老客'
  incentiveStartDate: string | null
}> {
  if (!projectId) {
    return {
      customerIncentiveType: 'new_customer',
      customerIncentiveLabel: '新客',
      incentiveStartDate: null,
    }
  }
  const setting = await db.query.projectConversionSetting.findFirst({
    where: eq(projectConversionSetting.projectId, projectId),
    columns: { conversionDate: true },
  })
  if (!setting) {
    return {
      customerIncentiveType: 'new_customer',
      customerIncentiveLabel: '新客',
      incentiveStartDate: null,
    }
  }
  return {
    customerIncentiveType: 'existing_customer',
    customerIncentiveLabel: '老客',
    incentiveStartDate: setting.conversionDate,
  }
}

export async function resolveTenantCrmSnapshot(input: {
  tenantPlatformId: string
  usageMonth: string
}): Promise<TenantCrmSnapshot> {
  const empty: TenantCrmSnapshot = {
    tenantId: null,
    tenantName: null,
    customerId: null,
    customerFullName: null,
    projectId: null,
    projectName: null,
    accountManagerStaffId: null,
    accountManagerName: null,
    enrichmentBindingSource: 'none',
    projectEnrichmentSnapshot: [],
    customerIncentiveType: 'new_customer',
    customerIncentiveLabel: '新客',
    incentiveStartDate: null,
  }

  const projects = await listProjectsForPlatformTenant(input.tenantPlatformId)
  const asOf = lastDayOfMonth(input.usageMonth)

  if (projects.length === 0) {
    const tenant = await db.query.billingTenant.findFirst({
      where: eq(billingTenant.platformTenantId, input.tenantPlatformId),
      columns: { id: true, name: true, customerId: true },
    })
    if (!tenant) return empty
    const customerRow = tenant.customerId
      ? await db.query.customer.findFirst({
          where: eq(customer.id, tenant.customerId),
          columns: { name: true },
        })
      : null
    return {
      ...empty,
      tenantId: tenant.id,
      tenantName: tenant.name,
      customerId: tenant.customerId,
      customerFullName: customerRow?.name ?? null,
    }
  }

  const tenantId = projects[0]!.tenantId
  const tenantRow = await db.query.billingTenant.findFirst({
    where: eq(billingTenant.id, tenantId),
    columns: { customerId: true },
  })
  const [displayNames, presetMap, primaryProjectIds] = await Promise.all([
    getTenantDisplayNames([tenantId]),
    loadPresetMap(tenantId, asOf),
    loadPrimaryTenantProjectIds(
      tenantId,
      projects.map((p) => p.projectId),
    ),
  ])
  const meta = displayNames.get(tenantId)

  const snapshotItems: ProjectEnrichmentSnapshotItem[] = projects.map((p) => ({
    project_id: p.projectId,
    project_name: p.projectName,
    staff_id: p.staffId,
    account_manager_name: p.accountManagerName,
    allocation_percent: presetMap.get(p.projectId) ?? null,
    is_primary_tenant_project: primaryProjectIds.has(p.projectId),
  }))

  const picked = pickSnapshotProject({
    projects,
    tenantId,
    presetMap,
    primaryProjectIds,
  })
  const pickedRow = picked.projectId
    ? projects.find((p) => p.projectId === picked.projectId)
    : null
  const incentive = await resolveIncentive(picked.projectId)

  return {
    tenantId,
    tenantName: meta?.tenantName ?? null,
    customerId: tenantRow?.customerId ?? null,
    customerFullName: meta?.customerFullName ?? null,
    projectId: picked.projectId,
    projectName: pickedRow?.projectName ?? null,
    accountManagerStaffId: pickedRow?.staffId ?? null,
    accountManagerName: pickedRow?.accountManagerName ?? null,
    enrichmentBindingSource: picked.source,
    projectEnrichmentSnapshot: snapshotItems,
    ...incentive,
  }
}
