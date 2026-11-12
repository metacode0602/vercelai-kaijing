export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown
}

export type JsonRpcSuccess = {
  jsonrpc: "2.0"
  id: JsonRpcId
  result: unknown
}

export type JsonRpcFailure = {
  jsonrpc: "2.0"
  id: JsonRpcId
  error: { code: number; message: string; data?: unknown }
}

export const MCP_PROTOCOL_VERSION = "2025-03-26"

export function isJsonRpcNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined && typeof request.method === "string"
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } }
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result }
}

export function parseJsonRpc(body: unknown): JsonRpcRequest | JsonRpcRequest[] | null {
  if (!body || typeof body !== "object") return null
  return body as JsonRpcRequest | JsonRpcRequest[]
}
