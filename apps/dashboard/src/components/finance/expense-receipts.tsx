"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { useFinanceForm } from "@/components/finance/form-context"
import { FormFeedback } from "@/components/forms/form-feedback"
import { EmptyState } from "@/components/tables/core"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  ControlField,
  Input,
} from "@ewatrade/ui"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  digestExpenseReceipt,
  downloadExpenseReceiptOriginal,
  expenseReceiptIntentIdentity,
  uploadExpenseReceiptOriginal,
} from "./expense-receipt-client"
import {
  type EXPENSE_RECEIPT_CONTENT_TYPES,
  ExpenseReceiptReadGeneration,
  type ExpenseReceiptRecoveryScope,
  associateExpenseReceiptIntentAsset,
  canAttachExpenseReceipt,
  canDownloadExpenseReceipt,
  clearExpenseReceiptCommandId,
  clearExpenseReceiptIntentForAsset,
  expenseReceiptStatus,
  getExpenseReceiptCommandId,
  getExpenseReceiptIntentAsset,
  isExpenseReceiptReadCurrent,
  validateExpenseReceiptFile,
} from "./expense-receipt-state"

type Receipt =
  RouterOutputs["finance"]["expenseReceipts"]["list"]["items"][number]

export function ExpenseReceipts({
  bookId,
  billId,
  cancelled,
}: {
  bookId: string
  billId: string
  cancelled: boolean
}) {
  const { actorUserId, tenantId } = useFinanceForm()
  return (
    <ExpenseReceiptWorkspace
      key={`${actorUserId}:${tenantId}:${bookId}:${billId}:${cancelled ? "cancelled" : "active"}`}
      bookId={bookId}
      billId={billId}
      cancelled={cancelled}
    />
  )
}

function ExpenseReceiptWorkspace({
  bookId,
  billId,
  cancelled,
}: {
  bookId: string
  billId: string
  cancelled: boolean
}) {
  const workflow = useDashboardWorkflow()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { actorUserId, tenantId } = useFinanceForm()
  const scope = useMemo(() => ({ bookId, billId }), [bookId, billId])
  const recoveryScope = useMemo<ExpenseReceiptRecoveryScope>(
    () => ({ actorUserId, tenantId, ...scope }),
    [actorUserId, scope, tenantId],
  )
  const receiptQueryKey = useMemo(
    () => trpc.finance.expenseReceipts.pathKey(),
    [trpc],
  )
  const fileInput = useRef<HTMLInputElement>(null)
  const listOptions = trpc.finance.expenseReceipts.list.infiniteQueryOptions(
    { ...scope, limit: 20 },
    {
      enabled: typeof navigator === "undefined" || navigator.onLine,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    },
  )
  const createIntent = useMutation(
    trpc.finance.expenseReceipts.createIntent.mutationOptions(),
  )
  const attach = useMutation(
    trpc.finance.expenseReceipts.attach.mutationOptions(),
  )
  const withdraw = useMutation(
    trpc.finance.expenseReceipts.withdraw.mutationOptions(),
  )
  const operation = useRef<{
    file: File
    started: boolean
    assetId?: string
    bytes?: Uint8Array
    digest?: string
    contentType?: (typeof EXPENSE_RECEIPT_CONTENT_TYPES)[number]
    intentIdentity?: string
  } | null>(null)
  const mounted = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const readGeneration = useRef(new ExpenseReceiptReadGeneration())
  const activeRead = useRef<ReturnType<
    ExpenseReceiptReadGeneration["begin"]
  > | null>(null)
  const [readyRead, setReadyRead] = useState<ReturnType<
    ExpenseReceiptReadGeneration["begin"]
  > | null>(null)
  const readBlocked = useRef(false)
  const readScope = useRef({ actorUserId, tenantId })
  const busy = useRef(false)
  const [file, setFile] = useState<File | null>(null)
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  )
  const [busyAsset, setBusyAsset] = useState<string | null>(null)
  const [transport, setTransport] = useState<"upload" | "download" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmWithdrawal, setConfirmWithdrawal] = useState<Receipt | null>(
    null,
  )
  const activeScope = useRef({
    ...scope,
    actorUserId,
    tenantId,
    cancelled,
    online,
  })
  activeScope.current = { ...scope, actorUserId, tenantId, cancelled, online }
  const query = useInfiniteQuery({
    ...listOptions,
    queryFn: async (queryContext) => {
      const fetchPage = listOptions.queryFn
      if (typeof fetchPage !== "function")
        throw new Error("Receipt query is unavailable.")
      const request = readGeneration.current.begin(
        queryClient.getQueryState(listOptions.queryKey)?.dataUpdatedAt ?? 0,
      )
      activeRead.current = request
      return readGeneration.current.read(
        request,
        () => fetchPage(queryContext),
        () =>
          mounted.current &&
          activeScope.current.online &&
          activeScope.current.actorUserId === actorUserId &&
          activeScope.current.tenantId === tenantId &&
          activeScope.current.bookId === bookId &&
          activeScope.current.billId === billId &&
          activeScope.current.cancelled === cancelled &&
          !queryContext.signal.aborted,
      )
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    networkMode: "online",
  })
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    if (
      readScope.current.actorUserId === actorUserId &&
      readScope.current.tenantId === tenantId
    )
      return
    readScope.current = { actorUserId, tenantId }
    readGeneration.current.invalidate()
    readBlocked.current = false
    activeRead.current = null
    setReadyRead(null)
    controller.current?.abort()
    operation.current = null
    setFile(null)
    void queryClient.cancelQueries({ queryKey: receiptQueryKey })
    queryClient.removeQueries({ queryKey: receiptQueryKey })
    void queryRef.current.refetch()
  }, [actorUserId, queryClient, receiptQueryKey, tenantId])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      readGeneration.current.invalidate()
      activeRead.current = null
      controller.current?.abort()
      void queryClient.cancelQueries({ queryKey: receiptQueryKey })
      queryClient.removeQueries({ queryKey: receiptQueryKey })
    }
  }, [queryClient, receiptQueryKey])

  useEffect(() => {
    const handleOffline = () => {
      readGeneration.current.invalidate()
      activeScope.current.online = false
      readBlocked.current = true
      activeRead.current = null
      setReadyRead(null)
      setOnline(false)
      controller.current?.abort()
      void queryClient.cancelQueries({ queryKey: receiptQueryKey })
      queryClient.removeQueries({ queryKey: receiptQueryKey })
    }
    const handleOnline = () => {
      setOnline(true)
      void queryRef.current.refetch()
    }
    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [queryClient, receiptQueryKey])

  useEffect(() => {
    const blocked =
      !online ||
      query.fetchStatus === "paused" ||
      (query.isError && !query.isFetching)
    if (blocked) {
      if (!readBlocked.current || activeRead.current)
        readGeneration.current.invalidate()
      readBlocked.current = true
      activeRead.current = null
      setReadyRead(null)
      return
    }
    readBlocked.current = false
    if (query.isFetching) {
      setReadyRead(null)
      return
    }
    const request = activeRead.current
    if (
      query.isSuccess &&
      query.isFetchedAfterMount &&
      request &&
      readGeneration.current.accepts(request, query.dataUpdatedAt)
    )
      setReadyRead(request)
  }, [
    online,
    query.dataUpdatedAt,
    query.fetchStatus,
    query.isError,
    query.isFetchedAfterMount,
    query.isFetching,
    query.isSuccess,
  ])

  const isFresh = isExpenseReceiptReadCurrent({
    online,
    fetchedAfterMount: query.isFetchedAfterMount,
    fetchStatus: query.fetchStatus,
    isFetching: query.isFetching,
    isError: query.isError,
    requestCurrent: Boolean(
      readScope.current.actorUserId === actorUserId &&
        readScope.current.tenantId === tenantId &&
        readyRead &&
        activeRead.current === readyRead &&
        readGeneration.current.accepts(readyRead, query.dataUpdatedAt),
    ),
  })
  const receiptItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  )
  const receipts = isFresh ? receiptItems : []
  useEffect(() => {
    if (!isFresh) return
    for (const receipt of receiptItems) {
      if (receipt.attachmentState === "ATTACHED") {
        clearExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "attach",
          receipt.id,
        )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          receipt.id,
        )
      }
      if (receipt.attachmentState === "WITHDRAWN") {
        clearExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "withdraw",
          receipt.id,
        )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          receipt.id,
        )
      }
      if (
        receipt.bytesDeletedAt !== null ||
        receipt.uploadState === "CLEANUP_PENDING" ||
        receipt.uploadState === "DELETED"
      )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          receipt.id,
        )
    }
  }, [isFresh, receiptItems, recoveryScope])
  const assertCurrent = (signal?: AbortSignal) => {
    signal?.throwIfAborted()
    if (
      !mounted.current ||
      activeScope.current.bookId !== bookId ||
      activeScope.current.billId !== billId ||
      activeScope.current.actorUserId !== actorUserId ||
      activeScope.current.tenantId !== tenantId ||
      activeScope.current.cancelled !== cancelled ||
      !activeScope.current.online
    )
      throw new Error("The expense changed. Reopen it before continuing.")
  }

  function chooseFile(next: File | undefined) {
    if (!next || busy.current) return
    if (operation.current?.started) {
      setError(
        "Retry the same receipt first, or finish it before choosing another file.",
      )
      return
    }
    const invalid = validateExpenseReceiptFile(next)
    if (invalid) {
      setError(invalid)
      return
    }
    operation.current = { file: next, started: false }
    setFile(next)
    setError(null)
  }

  async function uploadSelectedReceipt() {
    const draft = operation.current
    if (!draft || busy.current || cancelled) return
    busy.current = true
    draft.started = true
    setTransport("upload")
    setError(null)
    setBusyAsset(draft.assetId ?? "new")
    const source = { ...scope }
    const activeController = new AbortController()
    controller.current = activeController
    try {
      assertCurrent(activeController.signal)
      if (!draft.bytes || !draft.digest || !draft.contentType) {
        const digested = await digestExpenseReceipt(
          draft.file,
          activeController.signal,
        )
        assertCurrent(activeController.signal)
        draft.bytes = digested.bytes
        draft.digest = digested.digest
        draft.contentType = digested.contentType
      }
      if (!draft.bytes || !draft.digest || !draft.contentType)
        throw new Error(
          "Receipt bytes could not be prepared. Retry the same file.",
        )
      if (!draft.intentIdentity) {
        draft.intentIdentity = await expenseReceiptIntentIdentity({
          fileName: draft.file.name,
          contentType: draft.contentType,
          sizeBytes: draft.bytes.byteLength,
          contentDigest: draft.digest,
        })
        assertCurrent(activeController.signal)
      }
      if (!draft.assetId)
        draft.assetId =
          getExpenseReceiptIntentAsset(
            window.localStorage,
            recoveryScope,
            draft.intentIdentity,
          ) ?? undefined
      if (!draft.assetId) {
        const commandId = getExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "intent",
          draft.intentIdentity,
        )
        assertCurrent(activeController.signal)
        const intent = await createIntent.mutateAsync({
          ...source,
          clientCommandId: commandId,
          originalFileName: draft.file.name,
          contentDigest: draft.digest,
          contentType: draft.contentType,
          sizeBytes: draft.bytes.byteLength,
        })
        assertCurrent(activeController.signal)
        draft.assetId = intent.id
        associateExpenseReceiptIntentAsset(
          window.localStorage,
          recoveryScope,
          draft.intentIdentity,
          intent.id,
        )
      }
      if (!draft.assetId)
        throw new Error(
          "Receipt upload could not be confirmed. Retry the same file.",
        )
      const assetId = draft.assetId
      const beforeUpload = await queryClient.fetchQuery(
        trpc.finance.expenseReceipts.get.queryOptions(
          { ...source, assetId },
          { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
        ),
      )
      assertCurrent(activeController.signal)
      if (beforeUpload.attachmentState === "ATTACHED") {
        clearExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "attach",
          assetId,
        )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          assetId,
        )
        draft.bytes = undefined
        setFile(null)
        operation.current = null
        await query.refetch()
        return
      }
      assertCurrent(activeController.signal)
      const uploaded = await uploadExpenseReceiptOriginal({
        ...source,
        assetId,
        contentType: draft.contentType,
        bytes: draft.bytes,
        signal: activeController.signal,
      })
      assertCurrent(activeController.signal)
      const approved = await queryClient.fetchQuery(
        trpc.finance.expenseReceipts.get.queryOptions(
          { ...source, assetId },
          { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
        ),
      )
      assertCurrent(activeController.signal)
      if (
        uploaded.uploadState !== "VERIFIED" ||
        !canAttachExpenseReceipt(approved)
      ) {
        setError(
          approved.safetyState === "REJECTED"
            ? "This receipt did not pass safety review and cannot be attached."
            : "The original is verified. Attachment will be available after safety review clears it.",
        )
      } else {
        const commandId = getExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "attach",
          assetId,
        )
        assertCurrent(activeController.signal)
        await attach.mutateAsync({
          ...source,
          assetId,
          clientCommandId: commandId,
        })
        assertCurrent(activeController.signal)
        clearExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "attach",
          assetId,
        )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          assetId,
        )
      }
      draft.bytes = undefined
      setFile(null)
      operation.current = null
      assertCurrent()
      await query.refetch()
      assertCurrent(activeController.signal)
    } catch (failure) {
      let reconciled = false
      if (draft.assetId) {
        try {
          assertCurrent(activeController.signal)
          const fresh = await queryClient.fetchQuery(
            trpc.finance.expenseReceipts.get.queryOptions(
              { ...source, assetId: draft.assetId },
              { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
            ),
          )
          assertCurrent(activeController.signal)
          if (fresh.attachmentState === "ATTACHED") {
            clearExpenseReceiptCommandId(
              window.localStorage,
              recoveryScope,
              "attach",
              draft.assetId,
            )
            clearExpenseReceiptIntentForAsset(
              window.localStorage,
              recoveryScope,
              draft.assetId,
            )
            draft.bytes = undefined
            setFile(null)
            operation.current = null
            reconciled = true
          }
        } catch {
          // Preserve the receipt and command identities if reconciliation fails.
        }
      }
      if (mounted.current && !reconciled)
        setError(
          activeController.signal.aborted
            ? "Receipt transfer stopped. Retry the same original file."
            : failure instanceof Error
              ? failure.message
              : "Receipt upload failed. Retry the same file.",
        )
    } finally {
      busy.current = false
      if (mounted.current) setTransport(null)
      if (controller.current === activeController) controller.current = null
      if (mounted.current) setBusyAsset(null)
    }
  }

  async function attachReceipt(receipt: Receipt) {
    if (busy.current || !isFresh) return
    busy.current = true
    setError(null)
    setBusyAsset(receipt.id)
    try {
      assertCurrent()
      const fresh = await queryClient.fetchQuery(
        trpc.finance.expenseReceipts.get.queryOptions(
          { ...scope, assetId: receipt.id },
          { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
        ),
      )
      assertCurrent()
      if (!canAttachExpenseReceipt(fresh)) {
        if (fresh.attachmentState === "ATTACHED") {
          clearExpenseReceiptCommandId(
            window.localStorage,
            recoveryScope,
            "attach",
            receipt.id,
          )
          clearExpenseReceiptIntentForAsset(
            window.localStorage,
            recoveryScope,
            receipt.id,
          )
          await query.refetch()
          return
        }
        setError(
          "Receipt status changed. Refresh the list before attaching it.",
        )
        await query.refetch()
        return
      }
      const clientCommandId = getExpenseReceiptCommandId(
        window.localStorage,
        recoveryScope,
        "attach",
        receipt.id,
      )
      assertCurrent()
      await attach.mutateAsync({
        ...scope,
        assetId: receipt.id,
        clientCommandId,
      })
      assertCurrent()
      clearExpenseReceiptCommandId(
        window.localStorage,
        recoveryScope,
        "attach",
        receipt.id,
      )
      clearExpenseReceiptIntentForAsset(
        window.localStorage,
        recoveryScope,
        receipt.id,
      )
      await query.refetch()
    } catch (failure) {
      let reconciled = false
      try {
        assertCurrent()
        const fresh = await queryClient.fetchQuery(
          trpc.finance.expenseReceipts.get.queryOptions(
            { ...scope, assetId: receipt.id },
            { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
          ),
        )
        assertCurrent()
        if (fresh.attachmentState === "ATTACHED") {
          clearExpenseReceiptCommandId(
            window.localStorage,
            recoveryScope,
            "attach",
            receipt.id,
          )
          clearExpenseReceiptIntentForAsset(
            window.localStorage,
            recoveryScope,
            receipt.id,
          )
          reconciled = true
        }
      } catch {
        // Keep the command ID for an exact retry when fresh reconciliation fails.
      }
      if (mounted.current && !reconciled)
        setError(
          failure instanceof Error
            ? failure.message
            : "Receipt could not be attached.",
        )
      if (mounted.current) await query.refetch()
    } finally {
      busy.current = false
      if (mounted.current) setBusyAsset(null)
    }
  }

  async function withdrawReceipt(receipt: Receipt) {
    if (busy.current || !isFresh) return
    busy.current = true
    setError(null)
    setBusyAsset(receipt.id)
    try {
      assertCurrent()
      const fresh = await queryClient.fetchQuery(
        trpc.finance.expenseReceipts.get.queryOptions(
          { ...scope, assetId: receipt.id },
          { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
        ),
      )
      assertCurrent()
      if (fresh.attachmentState === "WITHDRAWN") {
        clearExpenseReceiptCommandId(
          window.localStorage,
          recoveryScope,
          "withdraw",
          receipt.id,
        )
        clearExpenseReceiptIntentForAsset(
          window.localStorage,
          recoveryScope,
          receipt.id,
        )
        setConfirmWithdrawal(null)
        await query.refetch()
        return
      }
      if (fresh.attachmentState !== "ATTACHED") {
        setError(
          "Receipt status changed. Refresh the list before withdrawing it.",
        )
        await query.refetch()
        return
      }
      const clientCommandId = getExpenseReceiptCommandId(
        window.localStorage,
        recoveryScope,
        "withdraw",
        receipt.id,
      )
      assertCurrent()
      await withdraw.mutateAsync({
        ...scope,
        assetId: receipt.id,
        clientCommandId,
      })
      assertCurrent()
      clearExpenseReceiptCommandId(
        window.localStorage,
        recoveryScope,
        "withdraw",
        receipt.id,
      )
      setConfirmWithdrawal(null)
      await query.refetch()
    } catch (failure) {
      let reconciled = false
      try {
        assertCurrent()
        const fresh = await queryClient.fetchQuery(
          trpc.finance.expenseReceipts.get.queryOptions(
            { ...scope, assetId: receipt.id },
            { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
          ),
        )
        assertCurrent()
        if (fresh.attachmentState === "WITHDRAWN") {
          clearExpenseReceiptCommandId(
            window.localStorage,
            recoveryScope,
            "withdraw",
            receipt.id,
          )
          clearExpenseReceiptIntentForAsset(
            window.localStorage,
            recoveryScope,
            receipt.id,
          )
          setConfirmWithdrawal(null)
          reconciled = true
        }
      } catch {
        // Keep the command ID for an exact retry when fresh reconciliation fails.
      }
      if (mounted.current && !reconciled)
        setError(
          failure instanceof Error
            ? failure.message
            : "Receipt could not be withdrawn.",
        )
      if (mounted.current) await query.refetch()
    } finally {
      busy.current = false
      if (mounted.current) setBusyAsset(null)
    }
  }

  async function downloadReceipt(receipt: Receipt) {
    if (busy.current || !isFresh) return
    busy.current = true
    setError(null)
    setBusyAsset(receipt.id)
    const activeController = new AbortController()
    controller.current = activeController
    workflow.track("expense_receipt_download", "started")
    setTransport("download")
    try {
      assertCurrent(activeController.signal)
      const fresh = await queryClient.fetchQuery(
        trpc.finance.expenseReceipts.get.queryOptions(
          { ...scope, assetId: receipt.id },
          { staleTime: 0, gcTime: 0, retry: false, networkMode: "online" },
        ),
      )
      assertCurrent(activeController.signal)
      if (!canDownloadExpenseReceipt(fresh)) {
        workflow.track("expense_receipt_download", "blocked")
        setError("Receipt access changed. Refresh the list before downloading.")
        await query.refetch()
        return
      }
      await downloadExpenseReceiptOriginal({
        ...scope,
        assetId: receipt.id,
        contentType: fresh.contentType,
        signal: activeController.signal,
        assertCurrent: () => assertCurrent(activeController.signal),
      })
      workflow.track("expense_receipt_download", "completed")
    } catch (failure) {
      workflow.track(
        "expense_receipt_download",
        activeController.signal.aborted ? "cancelled" : "failed",
      )
      if (mounted.current)
        setError(
          activeController.signal.aborted
            ? "Receipt download stopped. Request a fresh download when ready."
            : failure instanceof Error
              ? failure.message
              : "Receipt download failed.",
        )
    } finally {
      busy.current = false
      if (mounted.current) setTransport(null)
      if (controller.current === activeController) controller.current = null
      if (mounted.current) setBusyAsset(null)
    }
  }

  return (
    <section
      className="grid gap-4 border-t border-border pt-5"
      aria-labelledby="expense-receipts-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="expense-receipts-heading" className="font-medium">
            Receipts
          </h4>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Private evidence for this expense. Receipts do not change its amount
            or payment history.
          </p>
        </div>
        <Button
          appearance="form"
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
        {controller.current ? (
          <Button
            appearance="form"
            variant="outline"
            size="sm"
            onClick={() => controller.current?.abort()}
          >
            Cancel {transport === "download" ? "download" : "upload"}
          </Button>
        ) : null}
      </div>

      {cancelled ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            This expense is cancelled. Existing receipt evidence remains
            available; new receipts are disabled.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {query.isError ? (
        <FormFeedback appearance="dashboard">
          {query.error.message}
          <Button
            appearance="form"
            variant="link"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </FormFeedback>
      ) : null}

      {!cancelled ? (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <ControlField
              label="Receipt file"
              description="JPEG, PNG, WebP, HEIC, HEIF or PDF · up to 10 MB"
            >
              <Input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                className="sr-only"
                disabled={
                  Boolean(busyAsset) || Boolean(operation.current?.started)
                }
                onChange={(event) => {
                  chooseFile(event.currentTarget.files?.[0])
                  event.currentTarget.value = ""
                }}
              />
            </ControlField>
            {file ? (
              <p className="mt-2 truncate text-sm" title={file.name}>
                {file.name}
              </p>
            ) : null}
            {transport === "upload" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Uploading the original…
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              appearance="form"
              variant="outline"
              size="sm"
              disabled={
                Boolean(busyAsset) || Boolean(operation.current?.started)
              }
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </Button>
            {file ? (
              <Button
                appearance="form"
                size="sm"
                disabled={Boolean(busyAsset)}
                onClick={() => void uploadSelectedReceipt()}
              >
                {busyAsset === "new" ||
                (busyAsset && operation.current?.assetId === busyAsset)
                  ? "Uploading…"
                  : operation.current?.assetId
                    ? "Retry same receipt"
                    : "Upload receipt"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">
          {online ? "Loading receipts…" : "Connect to view receipt details."}
        </p>
      ) : null}
      {!query.isPending && query.isFetching ? (
        <p className="text-sm text-muted-foreground">Updating receipt list…</p>
      ) : null}
      {isFresh && receipts.length === 0 && !cancelled ? (
        <EmptyState
          appearance="form"
          title="No receipts yet"
          description="Add a private original to keep evidence with this expense."
          actionLabel="Choose receipt"
          onAction={() => fileInput.current?.click()}
        />
      ) : null}
      {isFresh && receipts.length === 0 && cancelled ? (
        <p className="text-sm text-muted-foreground">
          No receipts have been added.
        </p>
      ) : null}
      {receipts.length > 0 ? (
        <ul
          className="divide-y divide-border border-y border-border"
          aria-label="Expense receipts"
        >
          {receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              allowAttach={!cancelled}
              busy={busyAsset === receipt.id}
              onAttach={() => void attachReceipt(receipt)}
              onDownload={() => void downloadReceipt(receipt)}
              onWithdraw={() => setConfirmWithdrawal(receipt)}
            />
          ))}
        </ul>
      ) : null}
      {isFresh && query.hasNextPage ? (
        <div>
          <Button
            appearance="form"
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load older receipts"}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(confirmWithdrawal)}
        onOpenChange={(open) => {
          if (!open && !busyAsset) setConfirmWithdrawal(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Withdraw this receipt?</AlertDialogTitle>
          <AlertDialogDescription>
            It will no longer be attached to this expense. The original evidence
            is retained for financial records.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyAsset)}>
              Keep receipt
            </AlertDialogCancel>
            {confirmWithdrawal ? (
              <Button
                appearance="form"
                variant="destructive"
                disabled={Boolean(busyAsset)}
                onClick={() => void withdrawReceipt(confirmWithdrawal)}
              >
                {busyAsset === confirmWithdrawal.id
                  ? "Withdrawing…"
                  : "Withdraw receipt"}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ReceiptRow({
  receipt,
  allowAttach,
  busy,
  onAttach,
  onDownload,
  onWithdraw,
}: {
  receipt: Receipt
  allowAttach: boolean
  busy: boolean
  onAttach: () => void
  onDownload: () => void
  onWithdraw: () => void
}) {
  const status = expenseReceiptStatus(receipt)
  return (
    <li className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p
          className="truncate text-sm font-medium"
          title={receipt.originalFileName}
        >
          {receipt.originalFileName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatReceiptSize(receipt.sizeBytes)} ·{" "}
          {new Date(receipt.createdAt).toLocaleDateString("en-NG")} · {status}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {allowAttach && canAttachExpenseReceipt(receipt) ? (
          <Button
            appearance="form"
            size="sm"
            disabled={busy}
            onClick={onAttach}
          >
            {busy ? "Attaching…" : "Attach"}
          </Button>
        ) : null}
        {canDownloadExpenseReceipt(receipt) ? (
          <Button
            appearance="form"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onDownload}
          >
            {busy ? "Working…" : "Download original"}
          </Button>
        ) : null}
        {receipt.attachmentState === "ATTACHED" ? (
          <Button
            appearance="form"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onWithdraw}
          >
            Withdraw
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function formatReceiptSize(bytes: number) {
  if (bytes < 1_000) return `${bytes} bytes`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
