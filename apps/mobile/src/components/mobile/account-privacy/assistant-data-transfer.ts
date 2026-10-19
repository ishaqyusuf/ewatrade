export const ASSISTANT_DATA_MAX_BYTES = 24 * 1024 * 1024

export class AssistantDataTransferError extends Error {
  constructor(
    readonly code:
      | "SIGN_IN"
      | "CANCELLED"
      | "LIMIT"
      | "CHANGED"
      | "SHARED_SCOPE"
      | "PRIVACY"
      | "UNAVAILABLE"
      | "CLEANUP_FAILED",
  ) {
    super(code)
    this.name = "AssistantDataTransferError"
  }
}
type Identity = { userId: string; token: string }
type AssistantDataRequest = {
  method: "GET"
  signal: AbortSignal
  credentials: "omit"
  cache: "no-store"
  redirect: "error"
  headers: Record<string, string>
}
export type AssistantDataFile = { uri: string; remove(): Promise<void> }
export type AssistantDataTransferDependencies = {
  baseUrl: string
  currentIdentity(): Identity | null
  isCurrent(): boolean
  fetch(
    url: string,
    init: AssistantDataRequest,
  ): Promise<Pick<Response, "ok" | "status" | "headers" | "body">>
  createFile(bytes: Uint8Array): Promise<AssistantDataFile>
  share(uri: string, assertCurrent: () => void): Promise<void>
}

function realIdentity(value: Identity | null): value is Identity {
  return Boolean(
    value?.userId &&
      value.token &&
      !value.token.startsWith("local-") &&
      !value.token.startsWith("qas_"),
  )
}
async function boundedBody(
  response: Pick<Response, "headers" | "body">,
  limit: number,
  current: () => void,
) {
  const length = response.headers.get("content-length")
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel().catch(() => undefined)
    throw new AssistantDataTransferError("LIMIT")
  }
  const reader = response.body?.getReader()
  if (!reader) throw new AssistantDataTransferError("UNAVAILABLE")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      current()
      const chunk = await reader.read()
      current()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) throw new AssistantDataTransferError("LIMIT")
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return bytes
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

/** Immediate own-account transfer. Response bytes never enter component/query state. */
export async function shareAssistantData(
  deps: AssistantDataTransferDependencies,
  signal: AbortSignal,
) {
  const identity = deps.currentIdentity()
  if (!realIdentity(identity)) throw new AssistantDataTransferError("SIGN_IN")
  const current = () => {
    const now = deps.currentIdentity()
    if (signal.aborted || !deps.isCurrent())
      throw new AssistantDataTransferError("CANCELLED")
    if (
      !realIdentity(now) ||
      now.userId !== identity.userId ||
      now.token !== identity.token
    )
      throw new AssistantDataTransferError("CHANGED")
  }
  let file: AssistantDataFile | undefined
  let response:
    | Awaited<ReturnType<AssistantDataTransferDependencies["fetch"]>>
    | undefined
  let removal: Promise<void> | undefined
  const remove = async () => {
    if (!file) return
    if (!removal)
      removal = file.remove().catch(() => {
        removal = undefined
        throw new AssistantDataTransferError("CLEANUP_FAILED")
      })
    await removal
  }
  const abort = () => {
    void remove().catch(() => undefined)
  }
  signal.addEventListener("abort", abort)
  try {
    current()
    response = await deps.fetch(
      `${deps.baseUrl.replace(/\/$/, "")}/api/assistant/private-export`,
      {
        method: "GET",
        signal,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        headers: {
          "x-app-authorization": `Bearer ${identity.token}`,
          "x-trpc-source": "mobile",
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
      },
    )
    current()
    if (!response.ok) {
      const bytes = await boundedBody(response, 16 * 1024, current)
      let code: unknown
      try {
        code = JSON.parse(new TextDecoder().decode(bytes)).code
      } catch {
        /* Fixed public errors only. */
      }
      throw new AssistantDataTransferError(
        response.status === 401
          ? "SIGN_IN"
          : response.status === 413
            ? "LIMIT"
            : code === "SHARED_SCOPE_REVIEW_REQUIRED"
              ? "SHARED_SCOPE"
              : code === "PRIVACY_BLOCKED"
                ? "PRIVACY"
                : response.status === 409
                  ? "CHANGED"
                  : response.status === 403
                    ? "PRIVACY"
                    : "UNAVAILABLE",
      )
    }
    if (
      !response.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new AssistantDataTransferError("UNAVAILABLE")
    const bytes = await boundedBody(response, ASSISTANT_DATA_MAX_BYTES, current)
    let manifest: unknown
    try {
      manifest = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      )
    } catch {
      throw new AssistantDataTransferError("UNAVAILABLE")
    }
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !("version" in manifest) ||
      manifest.version !== 1 ||
      !("scope" in manifest) ||
      manifest.scope !== "own_private_assistant" ||
      !("originals" in manifest) ||
      !Array.isArray(manifest.originals) ||
      manifest.originals.length > 200
    )
      throw new AssistantDataTransferError("UNAVAILABLE")
    current()
    file = await deps.createFile(bytes)
    current()
    await deps.share(file.uri, current)
    current()
  } catch (error) {
    if (signal.aborted) throw new AssistantDataTransferError("CANCELLED")
    if (error instanceof AssistantDataTransferError) throw error
    throw new AssistantDataTransferError("UNAVAILABLE")
  } finally {
    signal.removeEventListener("abort", abort)
    await response?.body?.cancel().catch(() => undefined)
    await remove()
  }
}

export function assistantDataTransferMessage(error: unknown) {
  const code =
    error instanceof AssistantDataTransferError ? error.code : "UNAVAILABLE"
  switch (code) {
    case "SIGN_IN":
      return "Sign in again, then return here to download your assistant data."
    case "CANCELLED":
      return "Download cancelled."
    case "LIMIT":
      return "This export is too large for an in-app download. Contact support for help."
    case "CHANGED":
      return "Your account or assistant data changed. Try again from your current account."
    case "SHARED_SCOPE":
      return "Shared assistant data needs a privacy review. Contact support for help."
    case "PRIVACY":
      return "Use your own signed-in account. Downloads are unavailable while account deletion is processing."
    case "CLEANUP_FAILED":
      return "The temporary file could not be removed from this device. Close the app and contact support before sharing again."
    default:
      return "Assistant data could not be downloaded or shared. Check your connection and try again."
  }
}
