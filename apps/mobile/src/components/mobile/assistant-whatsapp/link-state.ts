import { parseWhatsAppLinkMessage } from "@ewatrade/assistant/channels/whatsapp"

export function isAssistantWhatsAppConnectUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname === "wa.me" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^\/[1-9]\d{7,14}$/.test(url.pathname) &&
      [...url.searchParams.keys()].length === 1 &&
      Boolean(
        parseWhatsAppLinkMessage(url.searchParams.get("text") ?? undefined),
      )
    )
  } catch {
    return false
  }
}

export function canConfirmAssistantWhatsAppLink(
  input: {
    localId: string
    remoteId: string
    state: string
    revision: number
    maskedSender: string | null
    expiresAt: Date | string
  },
  now = Date.now(),
) {
  return (
    input.localId === input.remoteId &&
    input.state === "awaiting_confirmation" &&
    input.revision > 0 &&
    Boolean(input.maskedSender) &&
    new Date(input.expiresAt).getTime() > now
  )
}

export function isFreshAssistantWhatsAppLinkStatus(
  status: {
    isSuccess: boolean
    isError: boolean
    isFetching: boolean
    isPaused: boolean
    isFetchedAfterMount: boolean
    dataUpdatedAt: number
  },
  linkReceivedAt: number,
) {
  return (
    status.isSuccess &&
    !status.isError &&
    !status.isFetching &&
    !status.isPaused &&
    status.isFetchedAfterMount &&
    status.dataUpdatedAt >= linkReceivedAt
  )
}
