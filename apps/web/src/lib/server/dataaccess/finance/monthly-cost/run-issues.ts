export type MonthlyCostRunIssueLevel = 'warning' | 'error'

export type MonthlyCostRunIssueRow = Record<string, string | null | undefined>

export type MonthlyCostRunIssueDto = {
  level: MonthlyCostRunIssueLevel
  code: string
  message: string
  row: MonthlyCostRunIssueRow | null
}

export type MonthlyCostRunIssuesPayload = {
  v: 1
  issues: MonthlyCostRunIssueDto[]
}

export function createRunIssue(
  level: MonthlyCostRunIssueLevel,
  code: string,
  message: string,
  row?: MonthlyCostRunIssueRow | null,
): MonthlyCostRunIssueDto {
  return { level, code, message, row: row ?? null }
}

export function serializeRunIssues(issues: MonthlyCostRunIssueDto[]): string {
  const payload: MonthlyCostRunIssuesPayload = { v: 1, issues }
  return JSON.stringify(payload)
}

export function parseRunIssues(raw: string | null | undefined): {
  issues: MonthlyCostRunIssueDto[]
  warningCount: number
  errorCount: number
} {
  if (!raw) {
    return { issues: [], warningCount: 0, errorCount: 0 }
  }
  try {
    const parsed = JSON.parse(raw) as MonthlyCostRunIssuesPayload
    if (parsed?.v !== 1 || !Array.isArray(parsed.issues)) {
      return { issues: [], warningCount: 0, errorCount: 0 }
    }
    const issues = parsed.issues
    return {
      issues,
      warningCount: issues.filter((i) => i.level === 'warning').length,
      errorCount: issues.filter((i) => i.level === 'error').length,
    }
  } catch {
    return {
      issues: [
        createRunIssue('error', 'LEGACY_SUMMARY', raw, null),
      ],
      warningCount: 0,
      errorCount: 1,
    }
  }
}

export function countRunIssues(issues: MonthlyCostRunIssueDto[]): {
  warningCount: number
  errorCount: number
} {
  return {
    warningCount: issues.filter((i) => i.level === 'warning').length,
    errorCount: issues.filter((i) => i.level === 'error').length,
  }
}
