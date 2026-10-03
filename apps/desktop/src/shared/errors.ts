export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_A_DIRECTORY'
  | 'NOT_EMPTY'
  | 'NOT_A_VAULT'
  | 'NO_VAULT'
  | 'PERMISSION_DENIED'
  /** 数据层拒绝的操作：校验失败、重名、找不到页面等 */
  | 'VAULT'
  | 'FORBIDDEN'
  | 'INTERNAL'

export interface ErrorPayload {
  code: ErrorCode
  message: string
}

/** 主进程和界面共用的错误类型；跨 IPC 时序列化成 ErrorPayload */
export class BrainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'BrainError'
    this.code = code
  }
}
