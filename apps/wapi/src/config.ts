import { resolve } from "node:path"
import { voiceTargets } from "./targets"

export function config(env: NodeJS.ProcessEnv, root: string) {
  const url = new URL(env.ASSISTANT_WHISPER_URL || "http://127.0.0.1:8787")
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("ASSISTANT_WHISPER_URL must be a loopback HTTP origin.")
  const service = resolve(
    root,
    env.ASSISTANT_WHISPER_SERVICE_DIR || "../al-ghurobaa/services/transcriber",
  )
  return {
    enabled: env.ASSISTANT_VOICE_LOCAL_ENABLED !== "false",
    url,
    service,
    python: resolve(
      service,
      env.ASSISTANT_WHISPER_PYTHON || ".venv311/bin/python",
    ),
    cache: resolve(
      root,
      env.ASSISTANT_WHISPER_CACHE_DIR || "apps/wapi/.cache/whisper",
    ),
    reuseCache: env.ASSISTANT_WHISPER_CACHE_DIR
      ? resolve(root, env.ASSISTANT_WHISPER_CACHE_DIR)
      : undefined,
  }
}

export function publisherProblem(env: NodeJS.ProcessEnv) {
  try {
    voiceTargets(env)
    return null
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid voice publisher configuration."
  }
}
