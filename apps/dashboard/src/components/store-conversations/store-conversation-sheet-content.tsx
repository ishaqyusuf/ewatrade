"use client"
import {
  Button,
  ControlField,
  FieldGroup,
  FormActions,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"

import { createMessageFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { getStoreConversationAssignmentOptions } from "@/components/store-conversations/assignment-options"
import { ConversationAccountTerms } from "@/components/store-conversations/conversation-account-terms"
import { ConversationAttachment } from "@/components/store-conversations/conversation-attachment"
import { StoreConversationHeader } from "@/components/store-conversations/conversation-header"
import { ConversationModerationForm } from "@/components/store-conversations/conversation-moderation-form"
import { ConversationReportForm } from "@/components/store-conversations/conversation-report-form"
import {
  type StoreConversationAssignmentFormValues,
  type StoreConversationReplyFormValues,
  newStoreConversationCommandId,
  useStoreConversationForms,
} from "@/components/store-conversations/form-context"
import type { getStoreConversationQueueInput } from "@/hooks/use-store-conversation-params"
import { useTRPC } from "@/trpc/client"
import {
  type StoreConversationMessageProjection,
  storeConversationWhatsAppObservedStatusLabel,
} from "@ewatrade/service-commerce"

import { mergeStoreConversationSequence } from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { useStoreConversationRealtime } from "../store-conversations/use-store-conversation-realtime"

export function StoreConversationSheetContent({
  storeId,
  conversationId,
  queueInput,
}: {
  storeId: string
  conversationId: string
  queueInput: ReturnType<typeof getStoreConversationQueueInput>
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { assignmentForm, replyForm, resetAssignment, resetReply } =
    useStoreConversationForms()
  const resolvedStoreId = storeId
  const timelineInput = { conversationId, limit: 50, storeId: resolvedStoreId }
  const attendantInput = { storeId: resolvedStoreId }
  const timeline = useQuery(
    trpc.serviceCommerce.storeConversationTimeline.queryOptions(timelineInput, {
      retry: false,
    }),
  )
  const attendants = useQuery(
    trpc.serviceCommerce.eligibleStoreConversationAttendants.queryOptions(
      attendantInput,
      { retry: false },
    ),
  )
  const [claimOperationId, setClaimOperationId] = useState(() =>
    newStoreConversationCommandId("claim"),
  )
  const [hydrated, setHydrated] = useState(false)
  const [legalCanPost, setLegalCanPost] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [olderMessages, setOlderMessages] = useState<
    StoreConversationMessageProjection[]
  >([])
  const [realtimeMessages, setRealtimeMessages] = useState<
    StoreConversationMessageProjection[]
  >([])
  const [olderCursor, setOlderCursor] = useState<number | null | undefined>()
  const [loadingOlder, setLoadingOlder] = useState(false)
  const replyQuickFillSnapshot =
    useRef<StoreConversationReplyFormValues | null>(null)
  const assignmentQuickFillSnapshot =
    useRef<StoreConversationAssignmentFormValues | null>(null)
  const [canUndoReplyQuickFill, setCanUndoReplyQuickFill] = useState(false)
  const [canUndoAssignmentQuickFill, setCanUndoAssignmentQuickFill] =
    useState(false)
  const previousBaseSequence = useRef<number | null>(null)
  const paginationScopeRef = useRef("")
  paginationScopeRef.current = `${conversationId}:${
    timeline.data?.conversation.lastMessageSequence ?? ""
  }`

  useEffect(() => setHydrated(true), [])

  useEffect(() => {
    const sequence = timeline.data?.conversation.lastMessageSequence ?? null
    if (
      previousBaseSequence.current !== null &&
      sequence !== previousBaseSequence.current
    ) {
      setOlderMessages([])
      setRealtimeMessages([])
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
        replyQuickFillSnapshot.current = null
        setCanUndoReplyQuickFill(false)
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
        assignmentQuickFillSnapshot.current = null
        setCanUndoAssignmentQuickFill(false)
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
        assignmentQuickFillSnapshot.current = null
        setCanUndoAssignmentQuickFill(false)
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
        assignmentQuickFillSnapshot.current = null
        setCanUndoAssignmentQuickFill(false)
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
  const eligibleAttendants = useMemo(
    () =>
      attendants.data?.filter(
        (attendant) =>
          attendant.membershipId !== timeline.data?.assignment.membershipId,
      ) ?? [],
    [attendants.data, timeline.data?.assignment.membershipId],
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
  const visibleMessages = useMemo(
    () =>
      mergeStoreConversationSequence(
        [...olderMessages, ...(timeline.data?.messages ?? [])],
        realtimeMessages,
      ),
    [olderMessages, realtimeMessages, timeline.data?.messages],
  )
  useStoreConversationRealtime({
    conversationId: conversationId ?? null,
    enabled: Boolean(timeline.data),
    messages: visibleMessages,
    onMessages: (messages) =>
      setRealtimeMessages((current) =>
        mergeStoreConversationSequence(current, messages),
      ),
    onNotice: setNotice,
    storeId: resolvedStoreId,
  })

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
    <>
      {!hydrated || timeline.isLoading ? (
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      ) : null}
      {hydrated && timeline.isError ? (
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
            appearance="form"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {hydrated && timeline.data ? (
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
                appearance="form"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </Button>
            ) : null}
            {visibleMessages.map((message) => (
              <article
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                  message.author.kind === "customer"
                    ? "justify-self-start bg-muted"
                    : "justify-self-end bg-primary text-primary-foreground"
                }`}
                key={message.id}
              >
                {message.attachments.length === 0 ? (
                  <>
                    <p className="text-xs font-medium opacity-70">
                      {message.author.label} · {message.channel}
                      {message.whatsAppObservation
                        ? ` · ${storeConversationWhatsAppObservedStatusLabel(
                            message.whatsAppObservation.status,
                          )}`
                        : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words">
                      {message.text}
                    </p>
                  </>
                ) : null}
                {message.attachments.map((attachment) => (
                  <ConversationAttachment
                    attachment={attachment}
                    conversationId={timeline.data.conversation.id}
                    key={attachment.id}
                    onPrepareRecovery={
                      attachment.recovery
                        ? () => {
                            replyForm.setValue(
                              "text",
                              attachment.recovery === "contact_store"
                                ? "We need to review this attachment with you. Please reply so we can help."
                                : "Please upload a new copy of this attachment in the same Request.",
                            )
                            const request = activeRequests.find(
                              (candidate) =>
                                candidate.id === message.request?.id &&
                                candidate.kind === message.request?.kind,
                            )
                            if (request) {
                              replyForm.setValue(
                                "request",
                                `${request.kind}:${request.id}:${request.revision}`,
                              )
                            }
                          }
                        : undefined
                    }
                    storeId={resolvedStoreId}
                  />
                ))}
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
              appearance="form"
            >
              Claim conversation
            </Button>
          ) : null}

          {timeline.data.permissions.canReply ? (
            <ConversationAccountTerms onAllowedChange={setLegalCanPost} />
          ) : null}

          {timeline.data.permissions.canReply ? (
            <form
              className="border-t border-border pt-5"
              onSubmit={replyForm.handleSubmit((values) => {
                if (!legalCanPost) return
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
              <FieldGroup className="min-w-0 grid gap-3">
                <QaDashboardQuickFill
                  canUndo={canUndoReplyQuickFill}
                  formId="dashboard.store-conversation.reply"
                  isDirty={replyForm.formState.isDirty}
                  onFill={(context) => {
                    const request = activeRequests[0]
                    if (!request) {
                      setNotice(
                        "An active Request is required before filling a reply draft.",
                      )
                      return
                    }
                    replyQuickFillSnapshot.current = replyForm.getValues()
                    replyForm.reset({
                      clientOperationId: newStoreConversationCommandId("reply"),
                      request: `${request.kind}:${request.id}:${request.revision}`,
                      text: createMessageFixture(context).message,
                    })
                    setCanUndoReplyQuickFill(true)
                    setNotice(null)
                  }}
                  onUndo={() => {
                    if (!replyQuickFillSnapshot.current) return
                    replyForm.reset(replyQuickFillSnapshot.current)
                    replyQuickFillSnapshot.current = null
                    setCanUndoReplyQuickFill(false)
                  }}
                />
                <ControlField label={<>Request</>}>
                  <FormSelectControl
                    control={replyForm.control}
                    name={"request"}
                    options={[
                      { value: "", label: <>Choose the exact Request</> },
                      ...(activeRequests.map((request) => ({
                        value: `${request.kind}:${request.id}:${request.revision}`,
                        label: (
                          <>
                            {request.label} ·{" "}
                            {request.status.replaceAll("_", " ")}
                          </>
                        ),
                      })) ?? []),
                    ]}
                  />
                </ControlField>
                <ControlField label={<>Reply</>}>
                  <Textarea
                    maxLength={2_000}
                    placeholder="Write a clear Store response"
                    {...replyForm.register("text")}
                  />
                </ControlField>
                <FormActions>
                  <SubmitButton
                    isSubmitting={pending}
                    disabled={pending || !legalCanPost}
                    type="submit"
                  >
                    Send reply
                  </SubmitButton>
                </FormActions>
              </FieldGroup>
            </form>
          ) : null}

          {timeline.data.permissions.canRelease ||
          timeline.data.permissions.canReassign ? (
            <form
              className="border-t border-border pt-5"
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
              <FieldGroup className="min-w-0 grid gap-3">
                <h3 className="font-medium">Assignment</h3>
                <QaDashboardQuickFill
                  canUndo={canUndoAssignmentQuickFill}
                  formId="dashboard.store-conversation.assignment"
                  isDirty={assignmentForm.formState.isDirty}
                  onFill={() => {
                    const target = eligibleAttendants[0]
                    const canRelease = timeline.data.permissions.canRelease
                    const canReassign = timeline.data.permissions.canReassign
                    if (!target && !canRelease) {
                      setNotice(
                        "An eligible attendant is required before filling this assignment draft.",
                      )
                      return
                    }
                    assignmentQuickFillSnapshot.current =
                      assignmentForm.getValues()
                    assignmentForm.reset({
                      action: target
                        ? canReassign && !canRelease
                          ? "reassign"
                          : "handoff"
                        : "release",
                      clientOperationId:
                        newStoreConversationCommandId("assignment"),
                      reason: target
                        ? "workload_balance"
                        : "operational_recovery",
                      targetMembershipId: target?.membershipId ?? "",
                    })
                    setCanUndoAssignmentQuickFill(true)
                    setNotice(null)
                  }}
                  onUndo={() => {
                    if (!assignmentQuickFillSnapshot.current) return
                    assignmentForm.reset(assignmentQuickFillSnapshot.current)
                    assignmentQuickFillSnapshot.current = null
                    setCanUndoAssignmentQuickFill(false)
                  }}
                />
                <ControlField label={<>Action</>}>
                  <FormSelectControl
                    control={assignmentForm.control}
                    name={"action"}
                    options={getStoreConversationAssignmentOptions(
                      timeline.data.permissions,
                    ).map((option) => ({
                      value: option.value,
                      label: <>{option.label}</>,
                    }))}
                  />
                </ControlField>
                {assignmentAction !== "release" ? (
                  <ControlField
                    label={<>Attendant</>}
                    error={
                      assignmentForm.formState.errors.targetMembershipId
                        ?.message
                    }
                  >
                    <FormSelectControl
                      control={assignmentForm.control}
                      name={"targetMembershipId"}
                      options={[
                        { value: "", label: <>Choose an active attendant</> },
                        ...(eligibleAttendants.map((attendant) => ({
                          value: attendant.membershipId,
                          label: attendant.label,
                        })) ?? []),
                      ]}
                    />
                  </ControlField>
                ) : null}
                <ControlField label={<>Reason</>}>
                  <FormSelectControl
                    control={assignmentForm.control}
                    name={"reason"}
                    options={[
                      {
                        value: "customer_request",
                        label: <>Customer request</>,
                      },
                      {
                        value: "membership_unavailable",
                        label: <>Membership unavailable</>,
                      },
                      {
                        value: "operational_recovery",
                        label: <>Operational recovery</>,
                      },
                      { value: "shift_change", label: <>Shift change</> },
                      {
                        value: "specialist_handoff",
                        label: <>Specialist handoff</>,
                      },
                      {
                        value: "workload_balance",
                        label: <>Workload balance</>,
                      },
                    ]}
                  />
                </ControlField>
                <FormActions>
                  <SubmitButton
                    isSubmitting={pending}
                    disabled={pending}
                    type="submit"
                    variant="outline"
                  >
                    Apply assignment change
                  </SubmitButton>
                </FormActions>
              </FieldGroup>
            </form>
          ) : null}

          <ConversationReportForm
            conversationId={timeline.data.conversation.id}
            key={`${resolvedStoreId}:${timeline.data.conversation.id}`}
            onMessage={setNotice}
            storeId={resolvedStoreId}
          />

          {timeline.data.permissions.canModerate ? (
            <ConversationModerationForm
              conversationId={timeline.data.conversation.id}
              moderation={timeline.data.conversation.moderation}
              onChanged={refresh}
              onMessage={setNotice}
              storeId={resolvedStoreId}
            />
          ) : null}

          {notice ? (
            <output className="text-sm text-muted-foreground">{notice}</output>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
