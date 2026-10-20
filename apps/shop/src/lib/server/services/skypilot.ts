/**
 * SkyPilot REST API wrapper for Serverless deployment.
 *
 * MVP: 直接调用 SkyPilot Serve REST API。
 * 后续可替换为 SDK 或 gRPC。
 */

const SKYPILOT_BASE_URL = process.env.SKYPILOT_API_URL ?? "http://localhost:8000"
const SKYPILOT_TOKEN = process.env.SKYPILOT_API_TOKEN ?? ""

interface SkyPilotRequestInit extends RequestInit {
  timeout?: number
}

async function skypilotFetch<T>(
  path: string,
  options: SkyPilotRequestInit = {},
): Promise<T> {
  const { timeout = 30_000, ...init } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${SKYPILOT_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(SKYPILOT_TOKEN ? { Authorization: `Bearer ${SKYPILOT_TOKEN}` } : {}),
        ...init.headers,
      },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`SkyPilot API ${res.status}: ${body}`)
    }

    return res.json() as Promise<T>
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkyPilotServeStatus {
  name: string
  status: "STARTING" | "RUNNING" | "STOPPING" | "STOPPED" | "FAILED"
  replicas: { ready: number; total: number }
  endpoints: { public?: string; internal?: string }
  region?: string
  uptime_seconds?: number
}

export interface SkyPilotDeployConfig {
  name: string
  image: string
  ports: number[]
  min_replicas: number
  max_replicas: number
  env?: Record<string, string>
  command?: string
  gpu_type?: string
  gpu_count?: number
  region?: string
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * Deploy a new SkyPilot Serve service.
 */
export async function deployService(
  config: SkyPilotDeployConfig,
): Promise<{ name: string; status: string }> {
  return skypilotFetch("/api/v1/serve/deploy", {
    method: "POST",
    body: JSON.stringify({
      name: config.name,
      image: config.image,
      ports: config.ports,
      min_replicas: config.min_replicas,
      max_replicas: config.max_replicas,
      env: config.env,
      command: config.command,
      resources: {
        gpu: config.gpu_type ? `${config.gpu_count ?? 1}x ${config.gpu_type}` : undefined,
      },
      region: config.region,
    }),
    timeout: 60_000,
  })
}

/**
 * Get the status of a SkyPilot Serve service.
 */
export async function getServiceStatus(
  name: string,
): Promise<SkyPilotServeStatus> {
  return skypilotFetch(`/api/v1/serve/status/${encodeURIComponent(name)}`)
}

/**
 * Scale a SkyPilot Serve service.
 */
export async function scaleService(
  name: string,
  minReplicas: number,
  maxReplicas: number,
): Promise<void> {
  await skypilotFetch(`/api/v1/serve/scale/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ min_replicas: minReplicas, max_replicas: maxReplicas }),
  })
}

/**
 * Stop (pause) a SkyPilot Serve service.
 */
export async function stopService(name: string): Promise<void> {
  await skypilotFetch(`/api/v1/serve/stop/${encodeURIComponent(name)}`, {
    method: "POST",
  })
}

/**
 * Start (resume) a SkyPilot Serve service.
 */
export async function startService(name: string): Promise<void> {
  await skypilotFetch(`/api/v1/serve/start/${encodeURIComponent(name)}`, {
    method: "POST",
  })
}

/**
 * Delete a SkyPilot Serve service and all its resources.
 */
export async function deleteService(name: string): Promise<void> {
  await skypilotFetch(`/api/v1/serve/delete/${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
}

/**
 * Get logs for a SkyPilot Serve service.
 */
export async function getServiceLogs(
  name: string,
  replicaIndex?: number,
): Promise<{ logs: string }> {
  const qs = replicaIndex !== undefined ? `?replica=${replicaIndex}` : ""
  return skypilotFetch(`/api/v1/serve/logs/${encodeURIComponent(name)}${qs}`)
}
