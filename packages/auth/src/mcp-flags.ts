/** MCP 必须同时打开进程开关与组织开关才会对外暴露。 */
export function isMcpExposed(input: {
  envEnabled: boolean
  organizationEnabled: boolean
}): boolean {
  return input.envEnabled && input.organizationEnabled
}
