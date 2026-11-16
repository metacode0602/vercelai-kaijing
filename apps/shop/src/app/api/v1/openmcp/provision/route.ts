import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { loadAccessSnapshot } from "@/lib/server/dataaccess/roles"
import {
  FederationProvisioningError,
  provisionFederation,
} from "@/lib/server/dataaccess/federation-provisioning"
import { createContextFromRequest } from "@/lib/server/context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAllowedFederationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return process.env.NODE_ENV !== "production" || url.protocol === "https:"
  } catch {
    return false
  }
}

const federationUrl = z
  .string()
  .url()
  .refine(isAllowedFederationUrl, "生产环境必须使用 HTTPS")

const provisionSchema = z.object({
  externalOrgId: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(120),
  denIssuer: federationUrl,
  denJwksUri: federationUrl,
  requestedScopes: z.array(z.string().trim().min(1)).min(1).max(20),
  claims: z.record(z.string(), z.unknown()).optional(),
  roleMapping: z.record(z.string(), z.string()).optional(),
  jitProvisioning: z.boolean().optional(),
})

function jsonError(status: number, error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { status }
  )
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  const allowed = new Set<string>()
  try {
    allowed.add(new URL(request.url).origin)
  } catch {
    return false
  }
  const configured = process.env.BETTER_AUTH_URL?.trim()
  if (configured) {
    try {
      allowed.add(new URL(configured).origin)
    } catch {
      // Invalid BETTER_AUTH_URL is already rejected elsewhere.
    }
  }
  return allowed.has(origin)
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError(403, "forbidden", "跨站请求被拒绝")
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return jsonError(415, "unsupported_media_type", "请求必须使用 application/json")
  }

  const context = await createContextFromRequest(request)
  if (!context.user) {
    return jsonError(401, "unauthorized", "请先登录 OpenShop")
  }
  if (!context.organizationId) {
    return jsonError(403, "organization_required", "请先选择组织")
  }
  const access = await loadAccessSnapshot(
    context.db,
    context.organizationId,
    {
      userId: context.user.id,
      organizationRole: context.organizationRole,
    }
  )
  if (!access.isOwner && !access.permissionSet.has("settings.configure")) {
    return jsonError(
      403,
      "forbidden",
      "需要组织所有者或 settings.configure 权限"
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_request", "请求体不是合法 JSON")
  }
  const parsed = provisionSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "provisioning 参数不合法")
  }

  try {
    const result = await provisionFederation({
      headers: request.headers,
      userId: context.user.id,
      organizationId: context.organizationId,
      requestId:
        request.headers.get("x-request-id")?.trim() || randomUUID(),
      payload: parsed.data,
    })
    return NextResponse.json(result, {
      status: result.oauthClient.clientSecret ? 201 : 200,
    })
  } catch (error) {
    if (error instanceof FederationProvisioningError) {
      return jsonError(error.status, error.code, error.message)
    }
    console.error("[openmcp] federation provisioning failed", error)
    return jsonError(500, "internal_error", "provisioning 失败")
  }
}
