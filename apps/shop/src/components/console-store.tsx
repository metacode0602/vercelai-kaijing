"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import {
  genId,
  type CommitmentType,
} from "@/lib/gpu-data"
import type { DeployBillingMethod } from "@/lib/server-market-data"
import type { MetalBillingMethod } from "@/lib/metal-market-data"

export interface Instance {
  id: string
  name: string
  type: "instance" | "serverless"
  gpu: string
  gpuCount: number
  region: string
  billing: string
  image: string
  status: "running" | "deploying" | "stopping" | "stopped"
  pricePerHour: number
  createdAt: string
  // instance specifics
  sshEnabled?: boolean
  sshKey?: string
  diskSize?: number
  volumeId?: string | null
  ports?: string
  templateLabel?: string
  templateMode?: "preset" | "custom"
  registrySource?: "platform" | "custom"
  envVars?: string
  startCommand?: string
  // serverless specifics
  minWorkers?: number
  maxWorkers?: number
  idleTimeout?: number
  maxConcurrency?: number
  cudaVersion?: string
  requestTimeout?: number
  appName?: string
  gpuId?: string
  regionId?: string
  regionAllowlist?: string[]
  commitment?: CommitmentType | "subscription"
  subscriptionDays?: number
}

export interface ServerInstance {
  id: string
  name: string
  offeringId: string
  status: "running" | "deploying" | "stopping" | "stopped"
  billing: DeployBillingMethod
  gpuCount: number
  diskExpandEnabled: boolean
  extraDiskGb: number
  volumeId: string | null
  imageId: string
  imageVersion: string
  sshEnabled: boolean
  sshKey: string
  ports: string
  createdAt: string
}

export interface MetalInstance {
  id: string
  name: string
  deviceId: string
  status: "running" | "deploying" | "stopped"
  billing: MetalBillingMethod
  quantity: number
  rentalDuration: number
  autoRenew: boolean
  voucherId: string | null
  unitPrice: number
  payableAmount: number
  availableUntil: string
  availableHours: number
  envTemplateId: string
  sshKey: string
  sshHost: string
  sshPort: number
  sshUser: string
  ports: string
  createdAt: string
}

export interface Volume {
  id: string
  name: string
  region: string
  size: number
  endpoint: string
  bucket: string
  accessKey: string
  used: number
  status: "ready" | "creating"
  createdAt: string
}

interface StoreState {
  instances: Instance[]
  serverInstances: ServerInstance[]
  metalInstances: MetalInstance[]
  volumes: Volume[]
  addInstance: (i: Omit<Instance, "id" | "createdAt" | "status">) => Instance
  addServerInstance: (
    i: Omit<ServerInstance, "id" | "createdAt" | "status">,
  ) => ServerInstance
  addMetalInstance: (
    i: Omit<
      MetalInstance,
      "id" | "createdAt" | "status" | "sshHost" | "sshPort" | "sshUser"
    >,
  ) => MetalInstance
  updateInstance: (id: string, patch: Partial<Omit<Instance, "id" | "createdAt" | "type">>) => void
  updateServerInstance: (
    id: string,
    patch: Partial<Omit<ServerInstance, "id" | "createdAt">>,
  ) => void
  updateMetalInstance: (
    id: string,
    patch: Partial<Omit<MetalInstance, "id" | "createdAt">>,
  ) => void
  addVolume: (v: Omit<Volume, "id" | "createdAt" | "status" | "used" | "endpoint" | "accessKey" | "bucket">) => Volume
  removeInstance: (id: string) => void
  removeServerInstance: (id: string) => void
  removeMetalInstance: (id: string) => void
  removeVolume: (id: string) => void
  setInstanceStatus: (id: string, status: Instance["status"]) => void
  setServerInstanceStatus: (id: string, status: ServerInstance["status"]) => void
  setMetalInstanceStatus: (id: string, status: MetalInstance["status"]) => void
}

const StoreContext = createContext<StoreState | null>(null)

const now = () => new Date().toISOString()

const seedInstances: Instance[] = [
  {
    id: "inst-7fa2c1",
    name: "comfyui-prod",
    type: "instance",
    gpu: "RTX 4090 24GB",
    gpuCount: 1,
    region: "美国西部 (US-WEST-01)",
    billing: "按需",
    image: "gpurun/comfyui:latest",
    status: "running",
    pricePerHour: 0.67,
    createdAt: now(),
    sshEnabled: true,
    sshKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... demo@gpucloud",
    diskSize: 60,
    volumeId: null,
    ports: "8188,22",
    templateLabel: "ComfyUI",
    templateMode: "preset",
    registrySource: "platform",
    envVars: "COMFYUI_PORT=8188",
    startCommand: "",
  },
  {
    id: "ep-3b9d40",
    name: "vllm-llama3",
    type: "serverless",
    gpu: "H100 SXM 80GB",
    gpuId: "h100-sxm",
    gpuCount: 1,
    region: "美国东部 (US-EAST-01)",
    regionId: "us-east",
    billing: "按量",
    commitment: "on-demand",
    image: "vllm/vllm-openai:latest",
    status: "running",
    pricePerHour: 2.59,
    createdAt: now(),
    templateLabel: "vLLM",
    templateMode: "preset",
    envVars: "MODEL=meta-llama/Meta-Llama-3-8B-Instruct",
    startCommand: "",
    ports: "8000",
    diskSize: 50,
    volumeId: null,
    minWorkers: 0,
    maxWorkers: 3,
    idleTimeout: 30,
    maxConcurrency: 1,
    cudaVersion: "12.4",
    requestTimeout: 120,
    appName: "llama3-inference",
  },
]

const seedServerInstances: ServerInstance[] = [
  {
    id: "srv-a3f8b2",
    name: "pytorch-dev",
    offeringId: "rtx4090-xinjiang",
    status: "running",
    billing: "on-demand",
    gpuCount: 1,
    diskExpandEnabled: true,
    extraDiskGb: 20,
    volumeId: "vol-1a2b3c",
    imageId: "pytorch",
    imageVersion: "2.11.0-cuda12.8-py3.12.3-devel (2026-05-12)",
    sshEnabled: true,
    sshKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGdemoKeyForServerInstance user@host",
    ports: "8888,22",
    createdAt: now(),
  },
  {
    id: "srv-c7d1e4",
    name: "cpu-batch",
    offeringId: "cpu-sichuan",
    status: "stopped",
    billing: "daily",
    gpuCount: 1,
    diskExpandEnabled: false,
    extraDiskGb: 1,
    volumeId: null,
    imageId: "ubuntu",
    imageVersion: "22.04-cuda12.4 (2026-05-12)",
    sshEnabled: true,
    sshKey: "",
    ports: "22",
    createdAt: now(),
  },
]

const seedVolumes: Volume[] = [
  {
    id: "vol-1a2b3c",
    name: "datasets-shared",
    region: "美国西部 (US-WEST-01)",
    size: 500,
    endpoint: "https://s3.us-west-01.gpucloud.dev",
    bucket: "datasets-shared",
    accessKey: "AKIA7FA2C1XYZ9QW",
    used: 182,
    status: "ready",
    createdAt: now(),
  },
]

const seedMetalInstances: MetalInstance[] = []

function metalSshHost(id: string) {
  const hash = id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return `10.${(hash % 200) + 20}.${(hash % 250) + 1}.${(hash % 250) + 1}`
}

export function ConsoleStoreProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[]>(seedInstances)
  const [serverInstances, setServerInstances] =
    useState<ServerInstance[]>(seedServerInstances)
  const [metalInstances, setMetalInstances] =
    useState<MetalInstance[]>(seedMetalInstances)
  const [volumes, setVolumes] = useState<Volume[]>(seedVolumes)

  const addInstance: StoreState["addInstance"] = (i) => {
    const inst: Instance = {
      ...i,
      id: genId(i.type === "serverless" ? "ep" : "inst"),
      status: "running",
      createdAt: now(),
    }
    setInstances((prev) => [inst, ...prev])
    return inst
  }

  const addVolume: StoreState["addVolume"] = (v) => {
    const id = genId("vol")
    const vol: Volume = {
      ...v,
      id,
      endpoint: `https://s3.${v.region.includes("东部") ? "us-east-01" : v.region.includes("欧洲") ? "eu-central-01" : v.region.includes("亚太") ? "ap-southeast-01" : "us-west-01"}.gpucloud.dev`,
      bucket: v.name,
      accessKey: `AKIA${id.slice(4).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      used: 0,
      status: "ready",
      createdAt: now(),
    }
    setVolumes((prev) => [vol, ...prev])
    return vol
  }

  const addServerInstance: StoreState["addServerInstance"] = (i) => {
    const inst: ServerInstance = {
      ...i,
      id: genId("srv"),
      status: "deploying",
      createdAt: now(),
    }
    setServerInstances((prev) => [inst, ...prev])
    return inst
  }

  const addMetalInstance: StoreState["addMetalInstance"] = (i) => {
    const id = genId("metal")
    const inst: MetalInstance = {
      ...i,
      id,
      sshHost: metalSshHost(id),
      sshPort: 22,
      sshUser: "root",
      status: "running",
      createdAt: now(),
    }
    setMetalInstances((prev) => [inst, ...prev])
    return inst
  }

  const updateInstance: StoreState["updateInstance"] = (id, patch) =>
    setInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )

  const updateServerInstance: StoreState["updateServerInstance"] = (id, patch) =>
    setServerInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )

  const updateMetalInstance: StoreState["updateMetalInstance"] = (id, patch) =>
    setMetalInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    )

  const removeInstance = (id: string) => setInstances((prev) => prev.filter((i) => i.id !== id))
  const removeServerInstance = (id: string) =>
    setServerInstances((prev) => prev.filter((i) => i.id !== id))
  const removeMetalInstance = (id: string) =>
    setMetalInstances((prev) => prev.filter((i) => i.id !== id))
  const removeVolume = (id: string) => setVolumes((prev) => prev.filter((v) => v.id !== id))
  const setInstanceStatus = (id: string, status: Instance["status"]) =>
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  const setServerInstanceStatus = (id: string, status: ServerInstance["status"]) =>
    setServerInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i)),
    )

  const setMetalInstanceStatus = (id: string, status: MetalInstance["status"]) =>
    setMetalInstances((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i)),
    )

  return (
    <StoreContext.Provider
      value={{
        instances,
        serverInstances,
        metalInstances,
        volumes,
        addInstance,
        addServerInstance,
        addMetalInstance,
        updateInstance,
        updateServerInstance,
        updateMetalInstance,
        addVolume,
        removeInstance,
        removeServerInstance,
        removeMetalInstance,
        removeVolume,
        setInstanceStatus,
        setServerInstanceStatus,
        setMetalInstanceStatus,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within ConsoleStoreProvider")
  return ctx
}
