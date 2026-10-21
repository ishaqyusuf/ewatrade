"use client"

import { useTRPC } from "@/trpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"

type InvitationCommand = "RESEND"

const REASON: Record<InvitationCommand, string> = {
  RESEND: "Resent from the Staff page",
}

const BLOCKER_MESSAGE: Record<string, string> = {
  STAFF_ROLLOUT_UNAVAILABLE: "Invites can’t be changed yet. Try again later.",
  STAFF_INVITATION_CHANGED:
    "This invite has changed. Refresh the page and try again.",
  STAFF_ASSIGNMENTS_UNAVAILABLE:
    "Give them a store in Change access before resending.",
}

/** Resend one pending invite: review it, then save the reviewed command. */
export function useStaffInvitationActions() {
  const trpc = useTRPC()
  const client = useQueryClient()
  const save = useMutation(
    trpc.retailOps.staffInvitationCommandSave.mutationOptions(),
  )
  async function run(kind: InvitationCommand, invitationId: string) {
    const input = { kind, invitationId, reason: REASON[kind] }
    const review = await client.fetchQuery(
      trpc.retailOps.staffInvitationCommandReview.queryOptions(input, {
        staleTime: 0,
      }),
    )
    const blocker = review.blockers[0]
    if (blocker)
      throw new Error(
        BLOCKER_MESSAGE[blocker.code] ??
          "Couldn’t change this invite. Try again.",
      )
    await save.mutateAsync({
      ...input,
      clientCommandId: crypto.randomUUID(),
      expectedReviewHash: review.reviewHash,
    })
    await client.invalidateQueries({
      queryKey: trpc.retailOps.staffInvitations.queryKey(),
    })
  }
  return { run, isPending: save.isPending }
}
