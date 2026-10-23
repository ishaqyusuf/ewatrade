import { setTimeout as delay } from "node:timers/promises"
import type { DbClient } from "../types"

export const WHATSAPP_TEXT_BURST_MS = 1500
const MAX_MESSAGES = 5
const MAX_TEXT = 8000

/** Only ordinary unquoted text may join a burst; proof/actions/media keep their own turn. */
export function assistantWhatsAppBurstText(content: unknown): string | null {
  if (!content || typeof content !== "object" || Array.isArray(content))
    return null
  const value = content as Record<string, unknown>
  if (
    Object.keys(value).some((key) => key !== "type" && key !== "text") ||
    value.type !== "text" ||
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > MAX_TEXT ||
    /^(?:\d{4,8}|STOP|CANCEL|DISCONNECT|CONNECT|REGISTER|HELP|MENU|YES|NO|CONFIRM|APPROVE|EDIT|RESEND|CONTINUE|NEXT|PREVIOUS)(?:\s|$)/i.test(
      value.text.trim(),
    )
  )
    return null
  return value.text
}

type BurstRow = {
  id: string
  bindingId: string | null
  identityId: string | null
  kind: string
  state: string
  sequence: number
  attempts: number
  receivedAt: Date
  expiresAt: Date
  content: unknown
}

export function assistantWhatsAppTextBurst(
  head: BurstRow,
  candidates: readonly BurstRow[],
  now: Date,
) {
  const original = assistantWhatsAppBurstText(head.content)
  if (
    !original ||
    head.kind !== "TURN" ||
    !head.bindingId ||
    head.identityId !== null ||
    head.state !== "PENDING" ||
    head.attempts !== 0 ||
    head.expiresAt <= now
  )
    return null
  let text = original
  const members: BurstRow[] = []
  for (const row of candidates) {
    const addition = assistantWhatsAppBurstText(row.content)
    if (
      members.length >= MAX_MESSAGES - 1 ||
      row.bindingId !== head.bindingId ||
      row.identityId !== null ||
      row.kind !== "TURN" ||
      row.state !== "PENDING" ||
      row.attempts !== 0 ||
      row.sequence !== head.sequence + members.length + 1 ||
      row.receivedAt < head.receivedAt ||
      row.receivedAt.getTime() - head.receivedAt.getTime() >
        WHATSAPP_TEXT_BURST_MS ||
      row.expiresAt <= now ||
      !addition ||
      text.length + addition.length + 2 > MAX_TEXT
    )
      break
    text += `\n\n${addition}`
    members.push(row)
  }
  return members.length ? { text, originalText: original, members } : null
}

/** Wait outside any transaction. Controls/actions/proof and retries never wait here. */
export async function waitForAssistantWhatsAppTextBurst(
  db: DbClient,
  inboxId: string,
  wait: (ms: number) => Promise<unknown> = delay,
  now = new Date(),
) {
  const row = await db.assistantWhatsAppInbox.findUnique({
    where: { id: inboxId },
    select: {
      kind: true,
      state: true,
      attempts: true,
      bindingId: true,
      identityId: true,
      content: true,
      receivedAt: true,
      expiresAt: true,
    },
  })
  if (
    !row ||
    row.kind !== "TURN" ||
    row.state !== "PENDING" ||
    row.attempts !== 0 ||
    !row.bindingId ||
    row.identityId ||
    row.expiresAt <= now ||
    !assistantWhatsAppBurstText(row.content)
  )
    return
  const remaining =
    row.receivedAt.getTime() + WHATSAPP_TEXT_BURST_MS - now.getTime()
  if (remaining > 0) await wait(Math.min(remaining, WHATSAPP_TEXT_BURST_MS))
}
