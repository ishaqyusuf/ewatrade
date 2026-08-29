import type { HonoRequest } from "hono"

const requestTraces = new WeakMap<
  Request,
  { cfRay: string | null; requestId: string }
>()
export function getRequestTrace(req: HonoRequest) {
  const existing = requestTraces.get(req.raw)
  if (existing) return existing
  const trace = {
    // An inbound correlation value may itself be a customer, order, payment,
    // or bearer identifier, so diagnostics use only server-minted ids.
    requestId: `req_${crypto.randomUUID()}`,
    cfRay: req.header("cf-ray") ?? null,
  }
  requestTraces.set(req.raw, trace)
  return trace
}
