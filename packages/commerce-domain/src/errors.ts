export class DomainError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "DomainError"
    this.code = code
  }
}

export class DesktopScopeError extends DomainError {
  constructor(message = "本期工作台仅开放 Daraz 斯里兰卡，ERP 中其他店铺仍可在 Web 使用。") {
    super("desktop_scope", message)
    this.name = "DesktopScopeError"
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super("not_found", message)
    this.name = "NotFoundError"
  }
}

export class ConflictError extends DomainError {
  readonly pendingActionId?: string
  constructor(message: string, pendingActionId?: string) {
    super("conflict", message)
    this.name = "ConflictError"
    this.pendingActionId = pendingActionId
  }
}
