export type FluxErrorCode = "RUNTIME_NOT_FOUND" | "COMMAND_FAILED" | "CONFIG_INVALID" | "CANCELLED"

export class FluxError extends Error {
  constructor(
    message: string,
    public code: FluxErrorCode,
  ) {
    super(message)
    this.name = "FluxError"
  }
}
