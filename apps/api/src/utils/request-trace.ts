import type { HonoRequest } from "hono"

export function getRequestTrace(req: HonoRequest) {
  return {
    requestId: req.header("x-request-id") ?? crypto.randomUUID(),
    cfRay: req.header("cf-ray") ?? null,
  }
}
