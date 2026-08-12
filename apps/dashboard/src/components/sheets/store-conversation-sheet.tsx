"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { StoreConversationHeader } from "@/components/store-conversations/conversation-header"
import {
  StoreConversationFormProvider,
  newStoreConversationCommandId,
  useStoreConversationForms,
} from "@/components/store-conversations/form-context"
import {
  getStoreConversationQueueInput,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { useTRPC } from "@/trpc/client"
import type { StoreConversationMessageProjection } from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"

export function StoreConversationSheet({ storeId }: { storeId: string }) {
  return (
    <StoreConversationFormProvider>
      <StoreConversationSheetContent storeId={storeId} />
    </StoreConversationFormProvider>
  )
}

function StoreConversationSheetContent({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useStoreConversationParams()
  const { assignmentForm, replyForm, resetAssignment, resetReply } =
    useStoreConversationForms()
  const conversationId = params.conversationId
  const open = Boolean(conversationId && params.conversationSheet === "detail")
  const resolvedStoreId = params.store ?? storeId
  const queueInput = getStoreConversationQueueInput(params, storeId)
  const timelineInput = open
    ? {
        conversationId: conversationId as string,
        limit: 50,
        storeId: resolvedStoreId,
      }
    : null
  const attendantInput = { storeId: resolvedStoreId }
  const timeline = useQuery(
    trpc.serviceCommerce.storeConversationTimeline.queryOptions(
      timelineInput ?? {
        conversationId: "not-selected",
        limit: 50,
        storeId: resolvedStoreId,
      },
      { enabled: open, retry: false },
    ),
  )
  const attendants = useQuery(
    trpc.serviceCommerce.eligibleStoreConversationAttendants.queryOptions(
      attendantInput,
      { enabled: open, retry: false },
    ),
  )
  const [claimOperationId, setClaimOperationId] = useState(() =>
    newStoreConversationCommandId("claim"),
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [olderMessages, setOlderMessages] = useState<
    StoreConversationMessageProjection[]
  >([])
  const [olderCursor, setOlderCursor] = useState<number | null | undefined>()
  const [loadingOlder, setLoadingOlder] = useState(false)
  const previouslyOpen = useRef(open)
  const previousConversationId = useRef(conversationId)
  const previousBaseSequence = useRef<number | null>(null)
  const paginationScopeRef = useRef("")
  paginationScopeRef.current = `${open}:${conversationId ?? ""}:${
    timeline.data?.conversation.lastMessageSequence ?? ""
  }`

  useEffect(() => {
    if (previouslyOpen.current && !open) {
      resetReply()
      resetAssignment()
      setClaimOperationId(newStoreConversationCommandId("claim"))
      setNotice(null)
      setOlderMessages([])
      setOlderCursor(undefined)
      setLoadingOlder(false)
    }
    previouslyOpen.current = open
  }, [open, resetAssignment, resetReply])

  useEffect(() => {
    if (previousConversationId.current !== conversationId) {
      setOlderMessages([])
      setOlderCursor(undefined)
      setLoadingOlder(false)
    }
    previousConversationId.current = conversationId
  }, [conversationId])

  useEffect(() => {
    const sequence = timeline.data?.conversation.lastMessageSequence ?? null
    if (
      previousBaseSequence.current !== null &&
      sequence !== previousBaseSequence.current
    ) {
      setOlderMessages([])
      setOlderCursor(undefined)
      setLoadingOlder(false)
    }
    previousBaseSequence.current = sequence
  }, [timeline.data?.conversation.lastMessageSequence])

  const refresh = async () => {
    const invalidations = [
      queryClient.invalidateQueries({
        exact: true,
        queryKey:
          trpc.serviceCommerce.storeConversationQueue.queryKey(queueInput),
      }),
      queryClient.invalidateQueries({
        exact: true,
        queryKey:
          trpc.serviceCommerce.eligibleStoreConversationAttendants.queryKey(
            attendantInput,
          ),
      }),
    ]
    if (timelineInput) {
      invalidations.push(
        queryClient.invalidateQueries({
          exact: true,
          queryKey:
            trpc.serviceCommerce.storeConversationTimeline.queryKey(
              timelineInput,
            ),
        }),
      )
    }
    await Promise.all(invalidations)
  }
  const onError = (error: { message: string }) => setNotice(error.message)
  const claim = useMutation(
    trpc.serviceCommerce.claimStoreConversation.mutationOptions({
      onError,
      onSuccess: async () => {
        setClaimOperationId(newStoreConversationCommandId("claim"))
        setNotice("Conversation claimed.")
        await refresh()
      },
    }),
  )
  const reply = useMutation(
    trpc.serviceCommerce.replyToStoreConversation.mutationOptions({
      onError,
      onSuccess: async () => {
        resetReply()
        setNotice("Reply sent.")
        await refresh()
      },
    }),
  )
  const handoff = useMutation(
    trpc.serviceCommerce.handoffStoreConversation.mutationOptions({
      onError,
      onSuccess: async () => {
        resetAssignment()
        setNotice("Conversation handed off.")
        await refresh()
      },
    }),
  )
  const reassign = useMutation(
    trpc.serviceCommerce.reassignStoreConversation.mutationOptions({
      onError,
      onSuccess: async () => {
        resetAssignment()
        setNotice("Conversation reassigned.")
        await refresh()
      },
    }),
  )
  const release = useMutation(
    trpc.serviceCommerce.releaseStoreConversation.mutationOptions({
      onError,
      onSuccess: async () => {
        resetAssignment()
        setNotice("Conversation returned to the queue.")
        await refresh()
      },
    }),
  )

  const activeRequests = useMemo(
    () =>
      timeline.data?.requests.filter(
        (request) => request.lifecycle === "active",
      ) ?? [],
    [timeline.data?.requests],
  )
  useEffect(() => {
    if (activeRequests.length === 1 && !replyForm.getValues("request")) {
      const request = activeRequests[0]
      if (request) {
        replyForm.setValue(
          "request",
          `${request.kind}:${request.id}:${request.revision}`,
        )
      }
    }
  }, [activeRequests, replyForm])
  useEffect(() => {
    if (
      timeline.data?.permissions.canReassign &&
      !timeline.data.permissions.canRelease &&
      assignmentForm.getValues("action") !== "reassign"
    ) {
      assignmentForm.setValue("action", "reassign")
    }
  }, [assignmentForm, timeline.data?.permissions])

  const pending =
    claim.isPending ||
    reply.isPending ||
    handoff.isPending ||
    reassign.isPending ||
    release.isPending
  const assignmentAction = assignmentForm.watch("action")

  const close = async () => {
    await refresh()
    resetReply()
    resetAssignment()
    setClaimOperationId(newStoreConversationCommandId("claim"))
    setNotice(null)
    await params.setSelection(null)
  }

  const nextOlderCursor =
    olderCursor === undefined ? timeline.data?.nextCursor : olderCursor
  const loadOlderMessages = async () => {
    if (!timelineInput || !nextOlderCursor || loadingOlder) return
    const paginationScope = paginationScopeRef.current
    setLoadingOlder(true)
    setNotice(null)
    try {
      const page = await queryClient.fetchQuery(
        trpc.serviceCommerce.storeConversationTimeline.queryOptions(
          {
            ...timelineInput,
            beforeSequence: nextOlderCursor,
          },
          { retry: false },
        ),
      )
      if (paginationScopeRef.current !== paginationScope) return
      setOlderMessages((messages) => [...page.messages, ...messages])
      setOlderCursor(page.nextCursor)
    } catch {
      if (paginationScopeRef.current !== paginationScope) return
      setNotice("Older messages are temporarily unavailable. Try again.")
    } finally {
      if (paginationScopeRef.current === paginationScope) {
        setLoadingOlder(false)
      }
    }
  }

  return (
    <DashboardSheet
      description="Read the Store timeline, claim primary ownership, reply to the exact Request, or transfer work with an auditable reason."
      onClose={close}
      open={open}
      title="Conversation"
    >
      {timeline.isLoading ? (
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      ) : null}
      {timeline.isError ? (
        <div
          className="rounded-lg border border-destructive/30 p-4"
          role="alert"
        >
          <p className="font-medium">This conversation is unavailable.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Refresh the authorized Store timeline and try again.
          </p>
          <Button
            className="mt-3"
            onClick={() => void timeline.refetch()}
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {timeline.data ? (
        <div className="grid gap-5">
          <StoreConversationHeader
            assignmentLabel={timeline.data.assignment.label}
            escalationOpen={timeline.data.escalations.some(
              (item) => item.state === "open",
            )}
            slaState={timeline.data.sla.state}
            storeName={timeline.data.conversation.storeName}
          />

          <section aria-label="Conversation messages" className="grid gap-3">
            {nextOlderCursor ? (
              <Button
                disabled={loadingOlder}
                onClick={() => void loadOlderMessages()}
                type="button"
                variant="outline"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </Button>
            ) : null}
            {[...olderMessages, ...timeline.data.messages].map((message) => (
              <article
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                  message.author.kind === "customer"
                    ? "justify-self-start bg-muted"
                    : "justify-self-end bg-primary text-primary-foreground"
                }`}
                key={message.id}
              >
                <p className="text-xs font-medium opacity-70">
                  {message.author.label}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">
                  {message.text}
                </p>
              </article>
            ))}
          </section>

          {!timeline.data.assignment.membershipId ? (
            <Button
              disabled={pending}
              onClick={() => {
                setNotice(null)
                claim.mutate({
                  clientOperationId: claimOperationId,
                  conversationId: timeline.data.conversation.id,
                  expectedAssignmentRevision: timeline.data.assignment.revision,
                  storeId: resolvedStoreId,
                })
              }}
            >
              Claim conversation
            </Button>
          ) : null}

          {timeline.data.permissions.canReply ? (
            <form
              className="grid gap-3 border-t border-border pt-5"
              onSubmit={replyForm.handleSubmit((values) => {
                const [kind, id, revision] = values.request.split(":")
                if (!kind || !id || !revision) return
                setNotice(null)
                reply.mutate({
                  clientOperationId: values.clientOperationId,
                  conversationId: timeline.data.conversation.id,
                  expectedAssignmentRevision: timeline.data.assignment.revision,
                  expectedLastMessageSequence:
                    timeline.data.conversation.lastMessageSequence,
                  request: {
                    id,
                    kind: kind as
                      | "commerce_inquiry"
                      | "prescription_request"
                      | "service_request",
                    revision: Number(revision),
                  },
                  storeId: resolvedStoreId,
                  text: values.text,
                })
              })}
            >
              <label className="grid gap-1 text-sm font-medium">
                Request
                <select
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  {...replyForm.register("request")}
                >
                  <option value="">Choose the exact Request</option>
                  {activeRequests.map((request) => (
                    <option
                      key={`${request.kind}:${request.id}`}
                      value={`${request.kind}:${request.id}:${request.revision}`}
                    >
                      {request.label} · {request.status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Reply
                <textarea
                  className="min-h-28 resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                  maxLength={2_000}
                  placeholder="Write a clear Store response"
                  {...replyForm.register("text")}
                />
              </label>
              <Button disabled={pending} type="submit">
                Send reply
              </Button>
            </form>
          ) : null}

          {timeline.data.permissions.canRelease ||
          timeline.data.permissions.canReassign ? (
            <form
              className="grid gap-3 border-t border-border pt-5"
              onSubmit={assignmentForm.handleSubmit((values) => {
                setNotice(null)
                const common = {
                  clientOperationId: values.clientOperationId,
                  conversationId: timeline.data.conversation.id,
                  expectedAssignmentRevision: timeline.data.assignment.revision,
                  reason: values.reason,
                  storeId: resolvedStoreId,
                }
                if (values.action === "release") {
                  release.mutate(common)
                } else if (values.action === "reassign") {
                  reassign.mutate({
                    ...common,
                    toMembershipId: values.targetMembershipId,
                  })
                } else {
                  handoff.mutate({
                    ...common,
                    toMembershipId: values.targetMembershipId,
                  })
                }
              })}
            >
              <h3 className="font-medium">Assignment</h3>
              <label className="grid gap-1 text-sm font-medium">
                Action
                <select
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  {...assignmentForm.register("action")}
                >
                  {timeline.data.permissions.canRelease ? (
                    <>
                      <option value="handoff">Hand off</option>
                      <option value="release">Return to queue</option>
                    </>
                  ) : null}
                  {timeline.data.permissions.canReassign ? (
                    <option value="reassign">Reassign</option>
                  ) : null}
                </select>
              </label>
              {assignmentAction !== "release" ? (
                <label className="grid gap-1 text-sm font-medium">
                  Attendant
                  <select
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    {...assignmentForm.register("targetMembershipId")}
                  >
                    <option value="">Choose an active attendant</option>
                    {attendants.data
                      ?.filter(
                        (attendant) =>
                          attendant.membershipId !==
                          timeline.data.assignment.membershipId,
                      )
                      .map((attendant) => (
                        <option
                          key={attendant.membershipId}
                          value={attendant.membershipId}
                        >
                          {attendant.label}
                        </option>
                      ))}
                  </select>
                  {assignmentForm.formState.errors.targetMembershipId ? (
                    <span className="text-xs text-destructive">
                      {
                        assignmentForm.formState.errors.targetMembershipId
                          .message
                      }
                    </span>
                  ) : null}
                </label>
              ) : null}
              <label className="grid gap-1 text-sm font-medium">
                Reason
                <select
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                  {...assignmentForm.register("reason")}
                >
                  <option value="customer_request">Customer request</option>
                  <option value="membership_unavailable">
                    Membership unavailable
                  </option>
                  <option value="operational_recovery">
                    Operational recovery
                  </option>
                  <option value="shift_change">Shift change</option>
                  <option value="specialist_handoff">Specialist handoff</option>
                  <option value="workload_balance">Workload balance</option>
                </select>
              </label>
              <Button disabled={pending} type="submit" variant="outline">
                Apply assignment change
              </Button>
            </form>
          ) : null}

          {notice ? (
            <output className="text-sm text-muted-foreground">{notice}</output>
          ) : null}
        </div>
      ) : null}
    </DashboardSheet>
  )
}
