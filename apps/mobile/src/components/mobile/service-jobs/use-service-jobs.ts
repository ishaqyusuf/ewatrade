import { useServiceCommand } from "./use-service-command"
import { useServiceActions } from "./use-service-actions"
import { useServiceStatusEditor } from "./service-status-sheet"
import { useServicePaymentEditor } from "./service-payment-sheet"
import { useServiceEvidenceChooser } from "./service-evidence-sheet"
import {
  useServiceHistory,
  type ServiceHistoryKind,
} from "./service-history-sheet"
import { useServiceTextEditor } from "./service-text-sheet"
import type { ServicePaymentKind } from "./service-payment-model"
import { prepareServiceIntake } from "./service-intake-command"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { projectServiceIntake } from "./service-intake-model"
import { useAuthContext } from "@/hooks/use-auth"
import {
  createMessageFixture,
  createServiceFixture,
} from "@/internal-tooling/fixture-recipes"
import { LIST_PAGE_SIZE, shouldShowListSearch } from "@/lib/list-pagination"
import { canManageMobileOperations, isSalesRepRole } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { QaFixtureContext } from "@ewatrade/utils/qa-fixtures"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import * as ImagePicker from "expo-image-picker"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  retainEvidenceAsset,
  discardRetainedEvidence,
} from "./service-evidence-files"
import {
  serviceOfferings,
  actions,
  type WorkJob,
  type PendingEvidence,
} from "./service-jobs-model"

export function useServiceJobs() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const canManage = canManageMobileOperations(profile?.role)
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [dueAt, setDueAt] = useState("")
  const [instructions, setInstructions] = useState("")
  const [express, setExpress] = useState(false)
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "card" | "cash" | "other" | "pos"
  >("cash")
  const [paymentReference, setPaymentReference] = useState("")
  const [notificationChannel, updateNotificationChannel] = useState<
    "" | "sms" | "whatsapp"
  >("")
  const [customerMessage, setCustomerMessage] = useState("")
  const qaMessageSnapshot = useRef<string | null>(null)
  const [canUndoQaMessage, setCanUndoQaMessage] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [jobNote, setJobNote] = useState("")
  const [pendingIntakeEvidence, setPendingIntakeEvidence] = useState<
    PendingEvidence[]
  >([])
  const quickFillSnapshot = useRef<{
    customerName: string
    customerPhone: string
    dueAt: string
    instructions: string
    quantities: Record<string, string>
  } | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)

  const canOperate = canManage || isSalesRepRole(profile?.role)
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: canOperate && !isOfflineMode,
      retry: false,
    }),
  )
  const storeId = profile?.storeId ?? availability.data?.storeId
  const command = useServiceCommand({
    userId: profile?.id,
    businessId: profile?.businessId,
    storeId,
    canOperate,
    canManage,
  })
  const enabled =
    canOperate && !isOfflineMode && !command.scopeChanged && Boolean(storeId)
  const catalogQuery = useQuery(
    trpc.catalog.listItems.queryOptions(
      { kind: "service" },
      { enabled, retry: false },
    ),
  )
  const jobsQuery = useInfiniteQuery(
    trpc.services.queuePage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        storeId,
        query: isOfflineMode ? undefined : deferredSearch || undefined,
      },
      { enabled, getNextPageParam: (page) => page.nextCursor, retry: false },
    ),
  )
  const settingsQuery = useQuery(
    trpc.services.getSettings.queryOptions(
      { storeId },
      { enabled, retry: false },
    ),
  )
  const jobQuery = useQuery(
    trpc.services.getJob.queryOptions(
      { jobId: selectedJobId ?? "" },
      { enabled: enabled && Boolean(selectedJobId), retry: false },
    ),
  )
  const offerings = useMemo(
    () =>
      canOperate && !command.scopeChanged && storeId
        ? serviceOfferings(catalogQuery.data ?? []).filter(
            (offering) =>
              offering.pricingPolicy === "fixed" &&
              offering.stores.some(
                (store) => store.storeId === storeId && store.isAvailable,
              ),
          )
        : [],
    [catalogQuery.data, storeId, canOperate, command.scopeChanged],
  )
  const loadedJobs = useMemo(
    () =>
      canOperate && !command.scopeChanged && storeId
        ? (jobsQuery.data?.pages.flatMap((page) => page.items) ?? []).filter(
            (job) => job.storeId === storeId,
          )
        : [],
    [jobsQuery.data?.pages, storeId, canOperate, command.scopeChanged],
  )
  const jobs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return !isOfflineMode || !query
      ? loadedJobs
      : loadedJobs.filter((job) =>
          [
            job.orderNumber,
            ...job.lines.flatMap((line) => [
              line.catalogItemName,
              line.offeringName,
              line.variantName,
            ]),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
  }, [isOfflineMode, loadedJobs, search])
  const jobCandidate =
    jobQuery.data ?? loadedJobs.find((job) => job.id === selectedJobId)
  const selectedJob =
    canOperate &&
    !command.scopeChanged &&
    jobCandidate?.storeId === storeId &&
    jobCandidate?.id === selectedJobId
      ? jobCandidate
      : undefined
  const intakeProjection = projectServiceIntake(
    offerings,
    quantities,
    express,
    settingsQuery.data,
  )
  const intakeCreatesTrackedWork =
    intakeProjection.value?.createsTrackedWork ?? false
  const subtotalMinor = intakeProjection.value?.subtotalMinor ?? 0
  const serviceChargeMinor = intakeProjection.value?.serviceChargeMinor ?? 0
  const totalMinor = intakeProjection.value?.totalMinor ?? 0
  const history = useServiceHistory()
  function openHistory(kind: ServiceHistoryKind) {
    if (
      !canOperate ||
      command.scopeChanged ||
      command.locked ||
      captureRef.current ||
      attachmentBusy.current ||
      history.kind ||
      statusEditor.draft ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job
    )
      return
    if (kind === "pending" ? !creating : !selectedJob) return
    history.open(kind)
  }
  function removePendingEvidence(id: string) {
    if (
      !command.canAct() ||
      command.locked ||
      captureRef.current ||
      attachmentBusy.current
    )
      return
    const evidence = pendingIntakeEvidence.find(
      (entry) => entry.clientEvidenceId === id,
    )
    if (!evidence) return
    discardRetainedEvidence(evidence)
    setPendingIntakeEvidence((current) =>
      current.filter((entry) => entry.clientEvidenceId !== id),
    )
  }
  const evidenceChooser = useServiceEvidenceChooser((job, media) => {
    if (job.id !== selectedJob?.id) {
      setError("The selected job changed. Open evidence capture again.")
      return
    }
    void captureEvidence(job, media)
  })
  function openEvidenceChooser(job: WorkJob) {
    if (history.kind) return
    if (
      !requireJob(job) ||
      statusEditor.draft ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job
    )
      return
    evidenceChooser.open(job)
  }
  const textEditor = useServiceTextEditor((draft) => {
    if (draft.job.id !== selectedJob?.id) {
      setError(
        "The selected job changed. Open its note or message action again.",
      )
      return false
    }
    const backToEdit = () => textEditor.open(draft.job, draft.kind, draft)
    if (draft.kind === "note") return addNote(draft.job, draft.body, backToEdit)
    return notifyCustomer(draft.job, draft, backToEdit)
  }, command.canAct)
  function openTextEditor(job: WorkJob, kind: "note" | "message") {
    if (history.kind) return
    if (
      !requireJob(job) ||
      statusEditor.draft ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job
    )
      return
    textEditor.open(job, kind, {
      body: kind === "note" ? jobNote : customerMessage,
      channel: notificationChannel,
    })
  }
  const paymentEditor = useServicePaymentEditor((draft) => {
    if (draft.job.id !== selectedJob?.id) {
      setError("The selected job changed. Open its payment action again.")
      return false
    }
    const backToEdit = () => {
      if (command.canAct()) paymentEditor.open(draft.job, draft.kind, draft)
    }
    if (draft.kind === "payment")
      return recordPayment(draft.job, draft, backToEdit)
    return handoff(draft.job, draft, backToEdit)
  })
  function openPaymentEditor(job: WorkJob, kind: ServicePaymentKind) {
    if (history.kind) return
    if (
      !requireJob(job) ||
      statusEditor.draft ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job
    )
      return
    paymentEditor.open(job, kind)
  }
  const statusEditor = useServiceStatusEditor((draft) => {
    if (draft.jobId !== selectedJob?.id) {
      setError("The selected job changed. Open its work action again.")
      return false
    }
    const job = selectedJob
    return transition(draft.line, draft.action, draft.reason, () => {
      if (job && command.canAct())
        statusEditor.open(job, draft.line, draft.action, draft.reason)
    })
  })
  function requestTransition(
    line: WorkJob["lines"][number],
    action: ReturnType<typeof actions>[number],
  ) {
    if (history.kind) return
    if (
      !selectedJob ||
      !requireJob(selectedJob) ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job ||
      statusEditor.draft
    )
      return
    statusEditor.open(selectedJob, line, action)
  }
  const channelTouched = useRef(false)
  const defaultChannelApplied = useRef(false)
  function setNotificationChannel(value: "" | "sms" | "whatsapp") {
    channelTouched.current = true
    updateNotificationChannel(value)
  }
  useEffect(() => {
    if (!settingsQuery.data || defaultChannelApplied.current) return
    defaultChannelApplied.current = true
    if (!channelTouched.current)
      updateNotificationChannel(
        settingsQuery.data.defaultNotificationChannel ?? "",
      )
  }, [settingsQuery.data])
  const evidenceMutation = useMutation(
    trpc.services.captureEvidence.mutationOptions({ retry: false }),
  )
  const intakeMutation = useMutation(
    trpc.services.createAndConfirmIntake.mutationOptions({ retry: false }),
  )
  const {
    transition,
    addNote,
    assignToMe,
    recordPayment,
    handoff,
    notifyCustomer,
    assignMutation,
    paymentMutation,
    handoffMutation,
    messageMutation,
    noteMutation,
  } = useServiceActions({
    selectedJob,
    storeId,
    userId: profile?.id,
    canManage,
    command,
    requireJob,
    acceptedAction,
    setError,
    amountPaid,
    paymentMethod,
    paymentReference,
    jobNote,
    customerMessage,
    notificationChannel,
    clearPayment: () => {
      setAmountPaid("")
      setPaymentReference("")
    },
    clearNote: () => setJobNote(""),
    clearMessage: () => setCustomerMessage(""),
    onCollected: () => {
      setAmountPaid("")
      setPaymentReference("")
      setSelectedJobId(null)
    },
  })
  type Attachment = RouterInputs["services"]["captureEvidence"]
  const attachmentRef = useRef<Attachment[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const attachmentBusy = useRef(false)
  const [attachmentPosting, setAttachmentPosting] = useState(false)
  const captureRef = useRef(false)
  const [captureBusy, setCaptureBusy] = useState(false)

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.services.queuePage.queryFilter()),
      queryClient.invalidateQueries(trpc.services.getJob.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
      ),
    ])
  }
  function acceptedAction(message: string, apply?: () => void) {
    return {
      message,
      afterAccept: async (isCurrent: () => boolean) => {
        if (!isCurrent()) return
        apply?.()
        setError(null)
        setNotice(message)
        await refresh()
      },
    }
  }
  function requireOnlineServiceWork() {
    if (
      command.canAct() &&
      !command.locked &&
      !captureRef.current &&
      !attachmentBusy.current
    )
      return true
    setError(
      "Return online to the original account and Store, then finish or resume the current action before starting another.",
    )
    return false
  }
  function requireJob(job: WorkJob) {
    if (!requireOnlineServiceWork()) return false
    if (job.storeId !== storeId || jobQuery.isError || jobQuery.isFetching) {
      setError("Reload the current Store's job before changing it.")
      return false
    }
    return true
  }
  function selectJob(id: string | null) {
    if (history.kind) return
    if (
      command.locked ||
      captureRef.current ||
      attachmentBusy.current ||
      statusEditor.draft ||
      paymentEditor.draft ||
      textEditor.draft ||
      evidenceChooser.job
    )
      return
    setSelectedJobId(id)
    setAmountPaid("")
    setPaymentReference("")
    setJobNote("")
    setCustomerMessage("")
    setCanUndoQaMessage(false)
    qaMessageSnapshot.current = null
    setError(null)
  }
  async function attachPendingEvidence(isCurrent: () => boolean) {
    if (attachmentBusy.current) return
    attachmentBusy.current = true
    setAttachmentPosting(true)
    try {
      for (const evidence of [...attachmentRef.current]) {
        if (!isCurrent() || useOperationalModeStore.getState().isOfflineMode)
          break
        try {
          await evidenceMutation.mutateAsync(evidence)
          attachmentRef.current = attachmentRef.current.filter(
            (entry) => entry.clientEvidenceId !== evidence.clientEvidenceId,
          )
        } catch {
          // Keep the same evidence ID and local file for an explicit retry.
        }
        if (isCurrent()) setAttachments([...attachmentRef.current])
      }
      if (isCurrent()) {
        setAttachments([...attachmentRef.current])
        if (attachmentRef.current.length)
          setError(
            "The service order is accepted, but " +
              attachmentRef.current.length +
              " private evidence attachment(s) remain unconfirmed. Retry those attachments; do not create the order again.",
          )
        else setNotice("Service order and private device evidence recorded.")
      }
    } finally {
      attachmentBusy.current = false
      if (command.isMounted()) setAttachmentPosting(false)
    }
  }
  async function retryAttachments() {
    if (!requireOnlineServiceWork() || !attachmentRef.current.length) return
    await attachPendingEvidence(() => command.canAct())
    if (command.canAct())
      await refresh().catch(() =>
        setNotice("Evidence retry finished. Refresh the queue when connected."),
      )
  }
  function submitIntake() {
    if (!requireOnlineServiceWork()) return
    const projection = intakeProjection.value
    if (
      !projection ||
      !storeId ||
      catalogQuery.isError ||
      settingsQuery.isError
    ) {
      setError(
        intakeProjection.error ?? "Reload service prices and Store settings.",
      )
      return
    }
    const prepared = prepareServiceIntake({
      clientIntakeId: "intake-" + Crypto.randomUUID(),
      storeId,
      projection,
      serviceNames: new Map(
        offerings.map((offering) => [offering.id, offering.displayName]),
      ),
      customerName,
      customerPhone,
      dueAt,
      instructions,
      express,
      payment: {
        amount: amountPaid,
        method: paymentMethod,
        reference: paymentReference,
      },
      notificationChannel,
      evidenceCount: pendingIntakeEvidence.length,
    })
    if (!prepared.value) {
      setError(prepared.error)
      return
    }
    const { input, facts } = prepared.value
    const evidence = pendingIntakeEvidence.map((entry) => ({ ...entry }))
    command.stage({
      kind: "intake",
      title: "Review service order",
      facts,
      execute: async () => {
        const result = await intakeMutation.mutateAsync(input)
        return {
          message: result.jobs.length
            ? "Service order and tracked work accepted."
            : "Service order accepted.",
          afterAccept: async (isCurrent) => {
            if (!isCurrent()) return
            setCreating(false)
            setQuantities({})
            setCustomerName("")
            setCustomerPhone("")
            setDueAt("")
            setInstructions("")
            setExpress(false)
            setAmountPaid("")
            setPaymentReference("")
            setShowDetails(false)
            setCanUndoQuickFill(false)
            quickFillSnapshot.current = null
            const job = result.jobs[0]
            setSelectedJobId(job?.id ?? null)
            setError(null)
            setNotice("Service order accepted.")
            if (job && evidence.length) {
              attachmentRef.current = [
                ...attachmentRef.current,
                ...evidence.map((entry) => ({ ...entry, jobId: job.id })),
              ]
              setAttachments([...attachmentRef.current])
              setPendingIntakeEvidence([])
              await attachPendingEvidence(isCurrent)
            } else if (evidence.length) {
              setError(
                "The order is accepted but no tracked job was returned for its local evidence. Keep the files and reconcile the work record; do not create another order.",
              )
            } else setPendingIntakeEvidence([])
            if (isCurrent()) await refresh()
          },
        }
      },
    })
  }
  async function captureLocalEvidence(
    mediaType: "photo" | "video",
    purpose: PendingEvidence["purpose"],
  ): Promise<PendingEvidence | null> {
    if (!requireOnlineServiceWork()) return null
    captureRef.current = true
    setCaptureBusy(true)
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!command.canAct()) return null
      if (!permission.granted) {
        setError("Camera permission is required to capture evidence.")
        return null
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes:
          mediaType === "photo"
            ? ImagePicker.MediaTypeOptions.Images
            : ImagePicker.MediaTypeOptions.Videos,
        quality: 0.7,
        videoMaxDuration: 60,
      })
      const asset = result.assets?.[0]
      if (!command.canAct() || result.canceled || !asset) return null
      const clientEvidenceId = "evidence-" + Crypto.randomUUID()
      return {
        assetReference: retainEvidenceAsset(asset, clientEvidenceId, mediaType),
        capturedAt: new Date(),
        clientEvidenceId,
        label: mediaType === "photo" ? "Work photo" : "Work video",
        mediaType,
        purpose,
        uploadStatus: "local",
      }
    } catch (failure) {
      if (command.canAct())
        setError(
          failure instanceof Error
            ? failure.message
            : "The captured file could not be retained.",
        )
      return null
    } finally {
      captureRef.current = false
      if (command.isMounted()) setCaptureBusy(false)
    }
  }
  async function captureEvidence(job: WorkJob, mediaType: "photo" | "video") {
    if (!requireJob(job)) return
    const evidence = await captureLocalEvidence(mediaType, "progress")
    if (!evidence) return
    const input = { ...evidence, jobId: job.id }
    const staged = command.stage({
      kind: "evidence",
      title: "Review private evidence",
      facts: [
        { label: "Job", value: job.orderNumber },
        { label: "File", value: evidence.label },
        {
          label: "Visibility",
          value: "Private · On this device · Not uploaded",
        },
      ],
      onDiscard: () => discardRetainedEvidence(evidence),
      execute: async () => {
        await evidenceMutation.mutateAsync(input)
        return acceptedAction("Private evidence recorded on this device.")
      },
    })
    if (!staged) discardRetainedEvidence(evidence)
  }
  async function captureIntakeEvidence(mediaType: "photo" | "video") {
    if (!intakeCreatesTrackedWork) {
      setError("Select tracked Service work before adding private evidence.")
      return
    }
    const evidence = await captureLocalEvidence(mediaType, "intake_condition")
    if (!evidence) return
    setPendingIntakeEvidence((current) => [...current, evidence])
    setNotice("Private intake evidence retained on this device.")
  }
  const showQueueSearch =
    !creating &&
    !selectedJobId &&
    (Boolean(search) ||
      shouldShowListSearch(
        Math.max(jobsQuery.data?.pages[0]?.totalCount ?? 0, loadedJobs.length),
      ))
  function fillIntake(context: QaFixtureContext, sequence: number) {
    if (!command.canAct() || command.locked) return
    const offering = offerings[0]
    if (!offering) {
      setError("Add an eligible Service Offering before filling this draft.")
      return
    }
    quickFillSnapshot.current = {
      customerName,
      customerPhone,
      dueAt,
      instructions,
      quantities,
    }
    const fixture = createServiceFixture(context, sequence)
    setQuantities({ [offering.id]: "1" })
    setCustomerName(fixture.customerName)
    setCustomerPhone(fixture.customerPhone)
    setDueAt(fixture.dueAt.toISOString().slice(0, 16).replace("T", " "))
    setInstructions(fixture.description)
    setShowDetails(true)
    setCanUndoQuickFill(true)
    setError(null)
  }

  function undoIntakeFill() {
    if (!command.canAct() || command.locked) return
    if (!quickFillSnapshot.current) return
    setCustomerName(quickFillSnapshot.current.customerName)
    setCustomerPhone(quickFillSnapshot.current.customerPhone)
    setDueAt(quickFillSnapshot.current.dueAt)
    setInstructions(quickFillSnapshot.current.instructions)
    setQuantities(quickFillSnapshot.current.quantities)
    quickFillSnapshot.current = null
    setCanUndoQuickFill(false)
  }

  function fillMessage(context: QaFixtureContext) {
    if (!command.canAct() || command.locked) return
    qaMessageSnapshot.current = customerMessage
    setCustomerMessage(createMessageFixture(context).message)
    setCanUndoQaMessage(true)
  }

  function undoMessageFill() {
    if (!command.canAct() || command.locked) return
    if (qaMessageSnapshot.current === null) return
    setCustomerMessage(qaMessageSnapshot.current)
    qaMessageSnapshot.current = null
    setCanUndoQaMessage(false)
  }

  return {
    history,
    openHistory,
    removePendingEvidence,
    evidenceChooser,
    openEvidenceChooser,
    textEditor,
    openTextEditor,
    paymentEditor,
    openPaymentEditor,
    statusEditor,
    command,
    canOperate,
    storeId,
    scopeChanged: command.scopeChanged,
    contextError: availability.error?.message ?? null,
    contextPending: availability.isPending,
    retryContext: availability.refetch,
    jobQuery,
    selectedJobId,
    attachmentCount: attachments.length,
    attachmentPosting,
    retryAttachments,
    captureBusy,
    locked:
      command.locked ||
      Boolean(statusEditor.draft) ||
      Boolean(paymentEditor.draft) ||
      Boolean(textEditor.draft) ||
      Boolean(evidenceChooser.job) ||
      Boolean(history.kind) ||
      captureBusy ||
      attachmentPosting,
    intakeProjection,
    catalogQuery,
    profile,
    canManage,
    isOfflineMode,
    creating,
    setCreating,
    search,
    setSearch,
    quantities,
    setQuantities,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    dueAt,
    setDueAt,
    instructions,
    setInstructions,
    express,
    setExpress,
    amountPaid,
    setAmountPaid,
    paymentMethod,
    setPaymentMethod,
    paymentReference,
    setPaymentReference,
    notificationChannel,
    setNotificationChannel,
    customerMessage,
    setCustomerMessage,
    canUndoQaMessage,
    showDetails,
    setShowDetails,
    selectedJob,
    setSelectedJobId: selectJob,
    error: error ?? command.error,
    notice,
    jobNote,
    setJobNote,
    pendingIntakeEvidence,
    setPendingIntakeEvidence,
    canUndoQuickFill,
    settingsQuery,
    offerings,
    jobsQuery,
    jobs,
    intakeCreatesTrackedWork,
    subtotalMinor,
    serviceChargeMinor,
    totalMinor,
    evidenceMutation,
    intakeMutation,
    assignMutation,
    paymentMutation,
    handoffMutation,
    messageMutation,
    noteMutation,
    submitIntake,
    transition: requestTransition,
    addNote,
    assignToMe,
    recordPayment,
    handoff,
    notifyCustomer,
    captureEvidence,
    captureIntakeEvidence,
    showQueueSearch,
    fillIntake,
    undoIntakeFill,
    fillMessage,
    undoMessageFill,
  }
}
export type ServiceJobsModel = ReturnType<typeof useServiceJobs>
