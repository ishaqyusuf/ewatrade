import { z } from "zod"

export const environments = ["local", "dev", "preview", "production"] as const
const targetSchema = z
  .object({
    environment: z.enum(environments),
    registryUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value)
        return (
          url.protocol === "https:" &&
          url.pathname === "/api/assistant/voice/gateway" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        )
      }),
    publishSecret: z.string().min(32),
    gatewaySecret: z.string().min(32),
  })
  .strict()
export type VoiceTarget = z.infer<typeof targetSchema>

/** Explicit Mac configuration; never merge other database/environment profiles. */
export function voiceTargets(env: NodeJS.ProcessEnv): VoiceTarget[] {
  let input: unknown
  if (env.ASSISTANT_VOICE_TARGETS_JSON) {
    try {
      input = JSON.parse(env.ASSISTANT_VOICE_TARGETS_JSON)
    } catch {
      throw new Error(
        "ASSISTANT_VOICE_TARGETS_JSON must be a valid JSON target list (credentials hidden).",
      )
    }
  } else {
    input = [
      {
        environment: env.ASSISTANT_VOICE_TARGET_ENV || env.APP_ENV,
        registryUrl: env.ASSISTANT_VOICE_REGISTRY_URL,
        publishSecret: env.ASSISTANT_VOICE_PUBLISH_SECRET,
        gatewaySecret: env.ASSISTANT_VOICE_GATEWAY_SECRET,
      },
    ]
  }
  const parsed = z.array(targetSchema).min(1).max(4).safeParse(input)
  if (!parsed.success)
    throw new Error(
      "Configure ASSISTANT_VOICE_TARGETS_JSON (or ASSISTANT_VOICE_REGISTRY_URL): HTTPS registry endpoints, local/dev/preview/production environments and both 32+ character secrets are required.",
    )
  const targets = parsed.data
  for (const field of [
    "environment",
    "registryUrl",
    "publishSecret",
    "gatewaySecret",
  ] as const) {
    if (new Set(targets.map((target) => target[field])).size !== targets.length)
      throw new Error(
        `Voice targets require distinct ${field} values for environment isolation (credentials hidden).`,
      )
  }
  return targets
}
