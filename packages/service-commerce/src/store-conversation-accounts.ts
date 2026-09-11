import type {
  StoreConversationAccountInvitationProjection,
  StoreConversationAccountInvitationState,
} from "./schemas/store-conversation-accounts"
import type { StoreConversationListItemProjection } from "./store-conversations"

export type StoreConversationAccountCandidateProjection = {
  conversationId: string
  invitationState: StoreConversationAccountInvitationState | null
  lastActivityAt: Date
  linked: boolean
  state: "active" | "archived" | "restricted"
  storeAvatar: { kind: "initials"; label: string }
  storeName: string
}

export type StoreConversationAccountCandidateListProjection = {
  items: StoreConversationAccountCandidateProjection[]
  nextCursor: string | null
}

export type StoreConversationAccountListProjection = {
  items: StoreConversationListItemProjection[]
  nextCursor: string | null
}

export type StoreConversationAccountLinkProjection = {
  linkedConversationIds: string[]
  replayed: boolean
}

export type StoreConversationAccountDeviceProjection = {
  createdAt: Date
  current: boolean
  deviceId: string
  lastUsedAt: Date
  purpose: "mobile" | "web"
  status: "active" | "expired" | "revoked" | "rotated"
}

export function canSelectStoreConversationAccountCandidate(
  candidate: Pick<
    StoreConversationAccountCandidateProjection,
    "linked" | "state"
  >,
) {
  return candidate.state === "active" && !candidate.linked
}

export function projectStoreConversationAccountInvitation(input: {
  id: string
  state: StoreConversationAccountInvitationState
}): StoreConversationAccountInvitationProjection {
  if (input.state === "linked") {
    return {
      actions: [],
      body: "This conversation is available from your signed-in devices.",
      id: input.id,
      milestone: "first_released_quote",
      state: "linked",
      title: "Conversation linked",
    }
  }
  if (input.state === "dismissed") {
    return {
      actions: [],
      body: "You can continue this conversation as a guest.",
      id: input.id,
      milestone: "first_released_quote",
      state: "dismissed",
      title: "Account invitation dismissed",
    }
  }
  return {
    actions: ["sign_up", "sign_in", "dismiss"],
    body: "Sign in or create an EwaTrade account when you are ready. You can keep using this conversation without an account.",
    id: input.id,
    milestone: "first_released_quote",
    state: "offered",
    title: "Keep this conversation across devices",
  }
}
