import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { nativeIssueText } from "./native-validation-copy"

export type NativeStaffInvitationAction = Extract<
  GeneralAction,
  { action: "staff_invitation" }
>
export type NativeInvitationValues = Extract<
  NativeStaffInvitationAction["intent"],
  { kind: "INVITE" }
>["invite"]
export type InvitationStore = { id: string; name: string }
export const invitationRoles = [
  ["CASHIER", "Cashier"],
  ["OPERATOR", "Sales rep"],
  ["MANAGER", "Manager"],
] as const

/** Only current protected Store choices can enter the edited invitation. */
export function nativeStaffInvitationCandidate(
  initial: NativeStaffInvitationAction,
  edits:
    | { kind: "INVITE"; invite: NativeInvitationValues }
    | { kind: "RESEND" | "REVOKE"; reason: string },
  stores: readonly InvitationStore[],
):
  | { ok: true; payload: NativeStaffInvitationAction }
  | { ok: false; error: string } {
  if (initial.intent.kind !== edits.kind)
    return { ok: false, error: "Keep the reviewed invitation operation." }
  let candidate: unknown
  if (initial.intent.kind === "INVITE" && edits.kind === "INVITE") {
    if (
      edits.invite.assignments.some(
        (assignment) =>
          stores.filter((store) => store.id === assignment.storeId).length !==
          1,
      )
    )
      return {
        ok: false,
        error: "Choose a currently accessible Store for every assignment.",
      }
    candidate = {
      ...initial,
      intent: {
        ...initial.intent,
        invite: {
          ...edits.invite,
          name: edits.invite.name?.trim() || undefined,
        },
      },
    }
  } else if (initial.intent.kind !== "INVITE" && edits.kind !== "INVITE") {
    candidate = {
      ...initial,
      intent: { ...initial.intent, reason: edits.reason },
    }
  } else return { ok: false, error: "Check the invitation operation." }
  const result = generalActionSchema.safeParse(candidate)
  return result.success && result.data.action === "staff_invitation"
    ? { ok: true, payload: result.data }
    : {
        ok: false,
        error: result.success
          ? "Check the invitation."
          : nativeIssueText(
              result.error.issues[0] ?? {},
              "Check the invitation.",
            ),
      }
}
