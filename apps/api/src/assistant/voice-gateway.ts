import { timingSafeEqual } from "node:crypto"
import { normalizeGatewayUrl } from "@ewatrade/ai/transcription-contracts"
import {
  publishVoiceGateway,
  readVoiceGateway,
} from "@ewatrade/db/assistant-voice"
import { prisma } from "@ewatrade/db/client"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { z } from "zod"

const registration = z.object({
  url: z.string().max(300),
  generation: z.string().uuid(),
  previousGeneration: z.string().uuid().nullable(),
  environment: z.string().max(30),
})

/** Machine-only registry. No public endpoint reveals the tunnel URL. */
export function registerVoiceGatewayRoutes(
  app: Pick<OpenAPIHono, "put" | "delete" | "get">,
) {
  for (const method of ["get", "put", "delete"] as const)
    app[method]("/api/assistant/voice/gateway", async (context) => {
      context.header("Cache-Control", "private, no-store")
      const secret = process.env.ASSISTANT_VOICE_PUBLISH_SECRET ?? ""
      const supplied = (context.req.header("Authorization") ?? "").replace(
        /^Bearer /,
        "",
      )
      if (
        secret.length < 32 ||
        Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
      )
        return context.json({ error: "Unauthorized" }, 401)
      if (method === "get") {
        const row = await readVoiceGateway(prisma)
        return context.json({ lease: row?.value ?? null })
      }
      if (Number(context.req.header("Content-Length") ?? 0) > 2048)
        return context.json({ error: "Invalid registration" }, 400)
      const reader = context.req.raw.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            size += part.value.byteLength
            if (size > 2048) {
              await reader.cancel()
              return context.json({ error: "Invalid registration" }, 400)
            }
            chunks.push(part.value)
          }
        } finally {
          reader.releaseLock()
        }
      }
      const text = Buffer.concat(chunks).toString("utf8")
      if (text.length > 2048)
        return context.json({ error: "Invalid registration" }, 400)
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch {
        return context.json({ error: "Invalid registration" }, 400)
      }
      const input = registration.safeParse(value)
      if (
        !input.success ||
        !normalizeGatewayUrl(input.data.url) ||
        input.data.environment !== process.env.APP_ENV
      )
        return context.json({ error: "Invalid registration" }, 400)
      const accepted = await publishVoiceGateway(prisma, {
        ...input.data,
        remove: method === "delete",
      })
      return context.json({ accepted }, accepted ? 200 : 409)
    })
}
