/**
 * Metal market data access layer.
 * Queries supplier_device + gpu_card_type + data_center + supplier_card_list_price
 * to produce MetalDevice[] compatible with the existing frontend components.
 *
 * Pricing source: supplier_card_list_price (listPricePerHour, effective_from/to)
 * instead of deviceSpec JSONB.
 */

import { eq, and, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  supplierDevice,
  gpuCardType,
  dataCenter,
  supplierCardListPrice,
} from "@workspace/db"
import type { MetalDevice, MetalPricing, NetworkMode } from "@/lib/metal-market-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceSpec {
  networkMode?: string
  vcpu?: number
  memoryGb?: number
  systemDiskGb?: number
  dataDiskGb?: number
  maxCuda?: string
  driverVersion?: string
  availableUntil?: string
  availableHours?: number
  displayName?: string
}

export interface MetalDeviceQueryResult {
  deviceId: string
  gpuModelKey: string
  displayName: string
  region: string
  networkMode: string
  gpuCount: number
  vcpu: number
  memoryGb: number
  systemDiskGb: number
  dataDiskGb: number
  maxCuda: string
  driverVersion: string
  pricing: MetalPricing
  availableUntil: string
  availableHours: number
  stock: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDeviceSpec(raw: string | null): DeviceSpec {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as DeviceSpec
  } catch {
    return {}
  }
}

function toMetalDevice(
  row: {
    id: string
    gpuCount: number | null
    deviceSpec: string | null
    gpuModelName: string | null
    gpuModelCode: string | null
    dcName: string | null
    dcBareMetalRegion: string | null
    dataCenterId: string | null
    gpuCardTypeId: string | null
    listPricePerHour: string | null
  },
  stock: number,
): MetalDevice {
  const spec = parseDeviceSpec(row.deviceSpec)
  const gpuCount = row.gpuCount ?? 1

  // 从 supplier_card_list_price 获取单卡小时价，推算各周期价格
  const listPricePerHour = Number(row.listPricePerHour ?? 0)
  const pricing: MetalPricing =
    listPricePerHour > 0
      ? {
          hourly: listPricePerHour * gpuCount,
          daily: listPricePerHour * gpuCount * 24,
          weekly: listPricePerHour * gpuCount * 24 * 7,
          monthly: listPricePerHour * gpuCount * 24 * 30,
        }
      : spec.networkMode
        ? { hourly: 0, daily: 0, weekly: 0, monthly: 0 }
        : { hourly: 0, daily: 0, weekly: 0, monthly: 0 }

  return {
    id: row.id,
    dataCenterId: row.dataCenterId ?? undefined,
    gpuCardTypeId: row.gpuCardTypeId ?? undefined,
    gpuModelKey: row.gpuModelCode ?? row.gpuModelName ?? "unknown",
    displayName:
      spec.displayName ??
      `${row.gpuModelName ?? "GPU"} / ${spec.memoryGb ?? "?"} GB`,
    region: row.dcBareMetalRegion ?? row.dcName ?? "unknown",
    networkMode: (spec.networkMode ?? "standalone") as NetworkMode,
    gpuCount,
    maxCuda: spec.maxCuda ?? "12.4",
    driverVersion: spec.driverVersion ?? "550.127.08",
    vcpu: spec.vcpu ?? 64,
    memoryGb: spec.memoryGb ?? 512,
    systemDiskGb: spec.systemDiskGb ?? 200,
    dataDiskGb: spec.dataDiskGb ?? 1000,
    pricing,
    stock,
    availableUntil: spec.availableUntil ?? "2026-12-31 23:59",
    availableHours: spec.availableHours ?? 720,
  }
}

// ---------------------------------------------------------------------------
// Query: list all available bare metal devices
// ---------------------------------------------------------------------------

export async function listMetalDevices(): Promise<MetalDevice[]> {
  // Join supplier_card_list_price to get actual pricing
  // Use latest effective price per (dataCenterId, gpuCardTypeId)
  const rows = await db
    .select({
      id: supplierDevice.id,
      gpuCount: supplierDevice.gpuCount,
      deviceSpec: supplierDevice.deviceSpec,
      externalDeviceId: supplierDevice.externalDeviceId,
      gpuModelName: gpuCardType.name,
      gpuModelCode: gpuCardType.code,
      dcName: dataCenter.name,
      dcBareMetalRegion: dataCenter.bareMetalRegion,
      dataCenterId: dataCenter.id,
      gpuCardTypeId: gpuCardType.id,
      listPricePerHour: supplierCardListPrice.listPricePerHour,
    })
    .from(supplierDevice)
    .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
    .innerJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
    .leftJoin(
      supplierCardListPrice,
      and(
        eq(supplierCardListPrice.dataCenterId, supplierDevice.dataCenterId),
        eq(supplierCardListPrice.gpuCardTypeId, supplierDevice.gpuCardTypeId),
        // 仅取当前生效的价格（effectiveTo IS NULL）
        sql`${supplierCardListPrice.effectiveTo} IS NULL`,
      ),
    )
    .where(
      and(
        eq(supplierDevice.lifecycleStatus, "listed"),
        eq(supplierDevice.inMaintenance, false),
        eq(supplierDevice.listingDisabled, false),
      ),
    )

  // Group by externalDeviceId (mock device config) to compute stock
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.externalDeviceId ?? row.id
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }

  // Map each group to a single MetalDevice with stock = group size
  const devices: MetalDevice[] = []
  for (const [, groupRows] of groups) {
    const representative = groupRows[0]
    devices.push(toMetalDevice(representative, groupRows.length))
  }

  return devices
}

// ---------------------------------------------------------------------------
// Query: get single device by ID
// ---------------------------------------------------------------------------

export async function getMetalDeviceById(
  deviceId: string,
): Promise<MetalDevice | null> {
  const [row] = await db
    .select({
      id: supplierDevice.id,
      gpuCount: supplierDevice.gpuCount,
      deviceSpec: supplierDevice.deviceSpec,
      externalDeviceId: supplierDevice.externalDeviceId,
      gpuModelName: gpuCardType.name,
      gpuModelCode: gpuCardType.code,
      dcName: dataCenter.name,
      dcBareMetalRegion: dataCenter.bareMetalRegion,
      dataCenterId: dataCenter.id,
      gpuCardTypeId: gpuCardType.id,
      listPricePerHour: supplierCardListPrice.listPricePerHour,
    })
    .from(supplierDevice)
    .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
    .innerJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
    .leftJoin(
      supplierCardListPrice,
      and(
        eq(supplierCardListPrice.dataCenterId, supplierDevice.dataCenterId),
        eq(supplierCardListPrice.gpuCardTypeId, supplierDevice.gpuCardTypeId),
        sql`${supplierCardListPrice.effectiveTo} IS NULL`,
      ),
    )
    .where(eq(supplierDevice.id, deviceId))
    .limit(1)

  if (!row) return null

  // Count stock for same config
  const [stockRow] = await db
    .select({ stock: sql<number>`count(*)::int` })
    .from(supplierDevice)
    .where(
      and(
        eq(supplierDevice.externalDeviceId, row.externalDeviceId ?? row.id),
        eq(supplierDevice.lifecycleStatus, "listed"),
        eq(supplierDevice.inMaintenance, false),
        eq(supplierDevice.listingDisabled, false),
      ),
    )

  return toMetalDevice(row, stockRow?.stock ?? 1)
}

// ---------------------------------------------------------------------------
// Query: get device by external_device_id (mock config ID)
// ---------------------------------------------------------------------------

export async function getMetalDeviceByConfigId(
  configId: string,
): Promise<MetalDevice | null> {
  const [row] = await db
    .select({
      id: supplierDevice.id,
      gpuCount: supplierDevice.gpuCount,
      deviceSpec: supplierDevice.deviceSpec,
      externalDeviceId: supplierDevice.externalDeviceId,
      gpuModelName: gpuCardType.name,
      gpuModelCode: gpuCardType.code,
      dcName: dataCenter.name,
      dcBareMetalRegion: dataCenter.bareMetalRegion,
      dataCenterId: dataCenter.id,
      gpuCardTypeId: gpuCardType.id,
      listPricePerHour: supplierCardListPrice.listPricePerHour,
    })
    .from(supplierDevice)
    .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
    .innerJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
    .leftJoin(
      supplierCardListPrice,
      and(
        eq(supplierCardListPrice.dataCenterId, supplierDevice.dataCenterId),
        eq(supplierCardListPrice.gpuCardTypeId, supplierDevice.gpuCardTypeId),
        sql`${supplierCardListPrice.effectiveTo} IS NULL`,
      ),
    )
    .where(eq(supplierDevice.externalDeviceId, configId))
    .limit(1)

  if (!row) return null

  const [stockRow] = await db
    .select({ stock: sql<number>`count(*)::int` })
    .from(supplierDevice)
    .where(
      and(
        eq(supplierDevice.externalDeviceId, configId),
        eq(supplierDevice.lifecycleStatus, "listed"),
        eq(supplierDevice.inMaintenance, false),
        eq(supplierDevice.listingDisabled, false),
      ),
    )

  return toMetalDevice(row, stockRow?.stock ?? 1)
}
