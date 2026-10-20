import { z } from 'zod'

const bandwidthConfigSchema = z.object({
  bandwidthType: z.string(),
  bandwidthSize: z.string(),
  bandwidthUnit: z.enum(['Mbps', 'Gbps']),
  isps: z.array(z.string()),
  customIspName: z.string(),
  bandwidthExpandable: z.boolean(),
  maxBandwidth: z.string(),
  maxBandwidthUnit: z.enum(['Mbps', 'Gbps']),
  bandwidthExpandCount: z.string(),
  bandwidthExpandStep: z.string(),
  bandwidthExpandStepUnit: z.enum(['Mbps', 'Gbps']),
  extraBandwidthLines: z.string(),
  remark: z.string(),
})

const networkConfigSchema = z.object({
  ipv4Count: z.string(),
  ipv6Option: z.enum(['none', 'single', 'subnet64', 'subnet48']),
  portCount: z.string(),
  portType: z.enum(['rj45', 'sfp-plus', 'qsfp28']),
  vlanConfig: z.enum(['none', 'single', 'multi']),
  vlanCount: z.string(),
  internalIpRange: z.string(),
  remark: z.string(),
})

const storageConfigSchema = z.object({
  storageType: z.string(),
  storageCapacity: z.string(),
  storageUnit: z.enum(['GB', 'TB']),
  raidLevel: z.enum(['none', 'raid1', 'raid5', 'raid10']),
  diskCount: z.string(),
  storageExpandable: z.boolean(),
  maxStorageCapacity: z.string(),
  maxStorageUnit: z.enum(['GB', 'TB']),
  storageExpandDiskCount: z.string(),
  storageExpandDiskSize: z.string(),
  storageExpandDiskUnit: z.enum(['GB', 'TB']),
  remark: z.string(),
})

export const datacenterInfrastructureGetSchema = z.object({
  dataCenterId: z.string().min(1),
})

export const datacenterInfrastructureUpsertSchema = z.object({
  dataCenterId: z.string().min(1),
  bandwidth: bandwidthConfigSchema,
  network: networkConfigSchema,
  storage: storageConfigSchema,
})

export type DatacenterInfrastructureUpsertInput = z.infer<
  typeof datacenterInfrastructureUpsertSchema
>
