import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useAttachmentEntitlement } from "@/hooks/use-attachment-entitlement"
import { getBaseUrl } from "@/lib/base-url"
import { createExpenseReceiptCommands } from "@/lib/expense-receipt-commands"
import { readExpenseReceiptPickedFile } from "@/lib/expense-receipt-picked-file"
import { createExpenseReceiptTransport } from "@/lib/expense-receipt-transport"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  EXPENSE_RECEIPT_CONTENT_TYPES,
  canAttachExpenseReceipt,
  canDownloadExpenseReceipt,
  expenseReceiptStatus,
} from "@ewatrade/utils/expense-receipt-state"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"
import { fetch as nativeFetch } from "expo/fetch"
import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Platform, View } from "react-native"
import { SectionHeader } from "../green-till/kit"
import { deliverReceiptFile } from "../receipts/receipt-file"

type Receipt = RouterOutputs["finance"]["expenseReceipts"]["get"]
type Scope = {
  actorUserId: string
  tenantId: string
  bookId: string
  billId: string
}
type Draft = Awaited<ReturnType<typeof readExpenseReceiptPickedFile>> & {
  identity: string
  contentDigest: string
}
const running = new Set<string>()

/** Private evidence client. Canonical repositories still authorize every effect. */
export function FinanceExpenseReceipts(props: Scope & { cancelled: boolean }) {
  return <ReceiptWorkspace key={JSON.stringify(props)} {...props} />
}

function ReceiptWorkspace({
  cancelled,
  ...scope
}: Scope & { cancelled: boolean }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const access = useAttachmentEntitlement()
  const entitlement = useRef(access.entitlement)
  entitlement.current = access.entitlement
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const alive = useRef(false)
  const generation = useRef(0)
  const initialSession = useRef(getSession())
  const sessionGeneration = useRef(getSessionGeneration())
  const controller = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const [ready, setReady] = useState(false)
  const readGeneration = useRef<number | null>(null)
  const receiptKey = useMemo(
    () =>
      trpc.finance.expenseReceipts.list.infiniteQueryKey({
        bookId: scope.bookId,
        billId: scope.billId,
        limit: 20,
      }),
    [trpc, scope.bookId, scope.billId],
  )
  const options = trpc.finance.expenseReceipts.list.infiniteQueryOptions(
    { bookId: scope.bookId, billId: scope.billId, limit: 20 },
    {
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      retry: false,
      trpc: { abortOnUnmount: true },
      enabled: !offline && ready,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    },
  )
  const receipts = useInfiniteQuery({
    ...options,
    queryFn: async (context) => {
      const token = generation.current
      assertCurrent(token)
      if (typeof options.queryFn !== "function")
        throw new Error("Receipt query unavailable.")
      const result = await options.queryFn(context)
      assertCurrent(token)
      readGeneration.current = token
      return result
    },
  })
  const createIntent = useMutation(
    trpc.finance.expenseReceipts.createIntent.mutationOptions(),
  )
  const attach = useMutation(
    trpc.finance.expenseReceipts.attach.mutationOptions(),
  )
  const withdraw = useMutation(
    trpc.finance.expenseReceipts.withdraw.mutationOptions(),
  )

  useEffect(() => {
    alive.current = true
    setReady(true)
    function retire() {
      generation.current++
      readGeneration.current = null
      controller.current?.abort()
      draftRef.current = null
      setDraft(null)
      void client.cancelQueries({ queryKey: receiptKey })
      client.removeQueries({ queryKey: receiptKey })
    }
    const unsubscribeMode = useOperationalModeStore.subscribe(
      (next, previous) => {
        if (next.isOfflineMode !== previous.isOfflineMode) retire()
      },
    )
    const unsubscribeOnline = onlineManager.subscribe(retire)
    return () => {
      alive.current = false
      generation.current++
      controller.current?.abort()
      draftRef.current = null
      unsubscribeMode()
      unsubscribeOnline()
      void client.cancelQueries({ queryKey: receiptKey })
      client.removeQueries({ queryKey: receiptKey })
    }
  }, [client, receiptKey])

  function assertCurrent(token: number) {
    const session = getSession()
    if (
      !alive.current ||
      token !== generation.current ||
      getSessionGeneration() !== sessionGeneration.current ||
      !session?.token ||
      session.token !== initialSession.current?.token ||
      session.profile.id !== scope.actorUserId ||
      session.profile.businessId !== scope.tenantId ||
      session.profile.businessSlug !==
        initialSession.current?.profile.businessSlug ||
      (session.profile.status !== undefined &&
        session.profile.status !== "ACTIVE") ||
      !["OWNER", "ADMIN"].includes(session.profile.role?.toUpperCase() ?? "") ||
      useOperationalModeStore.getState().isOfflineMode ||
      !onlineManager.isOnline()
    )
      throw new Error(
        "Receipt access changed. Reconnect and reopen this expense.",
      )
  }
  const fresh =
    readGeneration.current === generation.current &&
    getSessionGeneration() === sessionGeneration.current &&
    !offline &&
    onlineManager.isOnline() &&
    receipts.isFetchedAfterMount &&
    !receipts.isFetching &&
    !receipts.isError &&
    receipts.fetchStatus === "idle"
  async function run(
    action: (guard: () => void, signal: AbortSignal) => Promise<void>,
    requiresAttachment = false,
  ) {
    if (busyRef.current || !fresh) return
    busyRef.current = true
    const token = generation.current
    const guard = () => {
      assertCurrent(token)
      if (active.signal.aborted)
        throw new Error("Receipt action was cancelled. Retry the same receipt.")
      if (requiresAttachment && entitlement.current.status !== "allowed")
        throw new Error(
          "Attachment access changed. Refresh this expense before continuing.",
        )
    }
    const key = JSON.stringify(scope)
    const active = new AbortController()
    controller.current = active
    const deadline = setTimeout(() => active.abort(), 90_000)
    setBusy(true)
    setError(null)
    setNotice(null)
    async function execute() {
      guard()
      if (running.has(key))
        throw new Error("Another receipt action is still running.")
      running.add(key)
      try {
        await action(guard, active.signal)
      } finally {
        running.delete(key)
      }
    }
    try {
      if (Platform.OS === "web") {
        if (!navigator.locks)
          throw new Error(
            "Safe receipt submission needs the installed app or dashboard.",
          )
        await navigator.locks.request(
          `expense-receipt:${key}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error("Another receipt action is still running.")
            await execute()
          },
        )
      } else await execute()
      guard()
      await receipts.refetch()
    } catch (failure) {
      if (alive.current && token === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Receipt action failed. Retry the same receipt.",
        )
    } finally {
      clearTimeout(deadline)
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }
  function commands(guard: () => void) {
    return createExpenseReceiptCommands(
      scope,
      AsyncStorage,
      Crypto.randomUUID,
      guard,
    )
  }
  async function current(assetId: string, guard: () => void) {
    guard()
    const result = await client.fetchQuery(
      trpc.finance.expenseReceipts.get.queryOptions(
        { bookId: scope.bookId, billId: scope.billId, assetId },
        { staleTime: 0, gcTime: 0, retry: false },
      ),
    )
    guard()
    return result
  }
  function transport(guard: () => void) {
    guard()
    const session = initialSession.current
    if (!session?.profile.businessSlug)
      throw new Error("Sign in again before accessing receipts.")
    return createExpenseReceiptTransport({
      baseUrl: getBaseUrl(),
      fetch: nativeFetch,
      headers: {
        "x-app-authorization": `Bearer ${session.token}`,
        "x-tenant-slug": session.profile.businessSlug,
        "x-trpc-source": "mobile",
      },
      assertCurrent: guard,
    })
  }
  function pick() {
    void access.attempt(
      () =>
        run(async (guard) => {
          if (cancelled || draftRef.current) return
          const picked = await DocumentPicker.getDocumentAsync({
            type: [...EXPENSE_RECEIPT_CONTENT_TYPES],
            copyToCacheDirectory: true,
            multiple: false,
          })
          // The reader cleans its owned copy even if access changed while the picker was open.
          if (picked.canceled || !picked.assets[0]) return
          const original = await readExpenseReceiptPickedFile({
            asset: picked.assets[0],
            web: Platform.OS === "web",
            cacheUri: Paths.cache.uri,
            openFile: (uri) => new File(uri),
            assertCurrent: guard,
          })
          const buffer = new ArrayBuffer(original.bytes.length)
          new Uint8Array(buffer).set(original.bytes)
          const digest = await Crypto.digest(
            Crypto.CryptoDigestAlgorithm.SHA256,
            buffer,
          )
          guard()
          const contentDigest = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("")
          const identity = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            JSON.stringify([
              original.originalFileName,
              original.contentType,
              original.bytes.length,
              contentDigest,
            ]),
          )
          guard()
          draftRef.current = { ...original, identity, contentDigest }
          setDraft(draftRef.current)
        }, true),
      "document",
    )
  }
  async function attachOriginal(assetId: string, guard: () => void) {
    const receipt = await current(assetId, guard)
    const recovery = commands(guard)
    if (receipt.attachmentState !== "ATTACHED") {
      if (cancelled || !canAttachExpenseReceipt(receipt))
        throw new Error(
          "Receipt must clear safety review before it can be attached.",
        )
      const clientCommandId = await recovery.command("attach", assetId)
      guard()
      await attach.mutateAsync({
        bookId: scope.bookId,
        billId: scope.billId,
        assetId,
        clientCommandId,
      })
      guard()
    }
    if ((await current(assetId, guard)).attachmentState !== "ATTACHED")
      throw new Error(
        "Receipt attachment could not be confirmed. Retry the same receipt.",
      )
    await recovery.complete("attach", assetId)
  }
  function upload() {
    void access.attempt(
      () =>
        run(async (guard, signal) => {
          const original = draftRef.current
          if (!original || cancelled) return
          const recovery = commands(guard)
          const clientCommandId = await recovery.command(
            "intent",
            original.identity,
          )
          guard()
          const intent = await createIntent.mutateAsync({
            bookId: scope.bookId,
            billId: scope.billId,
            clientCommandId,
            originalFileName: original.originalFileName,
            contentType: original.contentType,
            sizeBytes: original.bytes.length,
            contentDigest: original.contentDigest,
          })
          guard()
          await recovery.bind(intent.id, original.identity)
          let receipt = await current(intent.id, guard)
          if (receipt.attachmentState === "WITHDRAWN" || receipt.bytesDeletedAt)
            throw new Error(
              "This original is no longer attachable. Review its retained history.",
            )
          if (receipt.uploadState !== "VERIFIED") {
            await transport(guard).upload(
              { ...scope, assetId: intent.id },
              original.bytes,
              original.contentType,
              signal,
            )
            receipt = await current(intent.id, guard)
          }
          if (
            canAttachExpenseReceipt(receipt) ||
            receipt.attachmentState === "ATTACHED"
          )
            await attachOriginal(intent.id, guard)
          else setNotice(expenseReceiptStatus(receipt))
          guard()
          draftRef.current = null
          setDraft(null)
        }, true),
      "document",
    )
  }
  function withdrawOriginal(receipt: Receipt) {
    const token = generation.current
    Alert.alert(
      "Withdraw receipt?",
      "The original and its history are retained. It will no longer be attached to this expense.",
      [
        { text: "Keep receipt", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: () => {
            if (!alive.current || token !== generation.current) return
            void run(async (guard) => {
              const saved = await current(receipt.id, guard)
              const recovery = commands(guard)
              if (saved.attachmentState !== "WITHDRAWN") {
                if (saved.attachmentState !== "ATTACHED")
                  throw new Error("Refresh this receipt’s current status.")
                const clientCommandId = await recovery.command(
                  "withdraw",
                  receipt.id,
                )
                guard()
                await withdraw.mutateAsync({
                  bookId: scope.bookId,
                  billId: scope.billId,
                  assetId: receipt.id,
                  clientCommandId,
                })
                guard()
              }
              if (
                (await current(receipt.id, guard)).attachmentState !==
                "WITHDRAWN"
              )
                throw new Error(
                  "Receipt withdrawal could not be confirmed. Retry the same receipt.",
                )
              await recovery.complete("withdraw", receipt.id)
            })
          },
        },
      ],
    )
  }
  const items = receipts.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <View className="gap-3">
      <SectionHeader title="Private receipts" />
      {access.sheet ? (
        <StatusBanner
          title="On paid plans"
          message="Receipt attachments are available on paid plans. Existing expense records and history are retained."
          actionLabel="Close"
          onActionPress={access.closeSheet}
        />
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Original images and PDFs stay private. Uploads need safety clearance
        before attachment.
      </Text>
      {error ? <StatusBanner tone="warning" message={error} /> : null}
      {notice ? <StatusBanner message={notice} /> : null}
      {!fresh ? (
        <StatusBanner
          message={
            receipts.isError
              ? "Receipts unavailable."
              : "Checking private receipts…"
          }
          actionLabel="Refresh receipts"
          onActionPress={() => void receipts.refetch()}
        />
      ) : (
        <>
          {items.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              No receipts yet.
            </Text>
          ) : null}
          {items.map((receipt) => (
            <View
              key={receipt.id}
              className="gap-2 rounded-xl border border-border p-3"
            >
              <Text className="text-sm font-semibold">
                {receipt.originalFileName}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {expenseReceiptStatus(receipt)}
              </Text>
              {canAttachExpenseReceipt(receipt) && !cancelled ? (
                <ActionButton
                  variant="outline"
                  disabled={busy}
                  onPress={() =>
                    void access.attempt(
                      () =>
                        run(async (guard) => {
                          await attachOriginal(receipt.id, guard)
                        }, true),
                      "document",
                    )
                  }
                >
                  Attach receipt
                </ActionButton>
              ) : null}
              {canDownloadExpenseReceipt(receipt) ? (
                <>
                  <ActionButton
                    variant="outline"
                    disabled={busy}
                    onPress={() =>
                      void run(async (guard, signal) => {
                        const saved = await current(receipt.id, guard)
                        if (!canDownloadExpenseReceipt(saved))
                          throw new Error(
                            "Receipt access changed. Refresh its status.",
                          )
                        const file = await transport(guard).download(
                          { ...scope, assetId: saved.id },
                          saved.contentType,
                          saved.sizeBytes,
                          signal,
                        )
                        guard()
                        const message = await deliverReceiptFile(
                          file,
                          "save",
                          guard,
                        )
                        guard()
                        setNotice(message)
                      })
                    }
                  >
                    Save original
                  </ActionButton>
                  <ActionButton
                    variant="outline"
                    disabled={busy}
                    onPress={() => withdrawOriginal(receipt)}
                  >
                    Withdraw receipt
                  </ActionButton>
                </>
              ) : null}
            </View>
          ))}
          {receipts.hasNextPage ? (
            <ActionButton
              variant="outline"
              disabled={busy}
              onPress={() => void receipts.fetchNextPage()}
            >
              Older receipts
            </ActionButton>
          ) : null}
          {!cancelled ? (
            draft ? (
              <>
                <Text className="text-sm">{draft.originalFileName}</Text>
                <ActionButton disabled={busy} onPress={upload} isLoading={busy}>
                  Upload original · retry same file
                </ActionButton>
              </>
            ) : (
              <ActionButton
                icon="Image"
                variant="outline"
                disabled={busy}
                onPress={pick}
              >
                Add receipt
              </ActionButton>
            )
          ) : null}
        </>
      )}
    </View>
  )
}
