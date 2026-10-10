"use client"
import { SetupChat } from "@/components/setup-assistant/setup-chat"
import {
  type SetupDraftEntity,
  entityEmoji,
  entityPayload,
  entitySummary,
} from "@/components/setup-assistant/setup-format"
import { SetupRecordAvatar } from "@/components/setup-assistant/setup-illustration"
import {
  SetupDraftCardContext,
  type SetupDraftCardHost,
} from "@/components/setup-assistant/setup-message"
import { SetupPrerequisites } from "@/components/setup-assistant/setup-prerequisites"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { setupProductPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { Button, cn } from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils/currency"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import type { ComponentProps, ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { AssistantAllowance } from "./assistant-allowance"

export type ProductChatState = RouterOutputs["productAssistant"]["state"]
export function ProductChat({
  data,
  currencyCode,
  onBack,
  onCreated,
  onAnother,
}: {
  data: ProductChatState
  currencyCode: string
  onBack: () => void
  onCreated: (name: string) => void
  onAnother: () => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [separateName, setSeparateName] = useState<string | null>(null)
  // Assistant messages that could carry the phone draft card, in chat order.
  const [cardHosts, setCardHosts] = useState<
    { messageId: string; staged: boolean }[]
  >([])
  const registerCardHost = useCallback((messageId: string, staged: boolean) => {
    setCardHosts((hosts) =>
      hosts.some((host) => host.messageId === messageId)
        ? hosts.map((host) =>
            host.messageId === messageId ? { messageId, staged } : host,
          )
        : [...hosts, { messageId, staged }],
    )
    return () =>
      setCardHosts((hosts) =>
        hosts.filter((host) => host.messageId !== messageId),
      )
  }, [])
  const [created, setCreated] = useState<{
    recordId: string
    name: string
  } | null>(null)
  const create = useMutation(
    trpc.productAssistant.create.mutationOptions({
      onSuccess: async (result) => {
        setCreated(result)
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: trpc.catalog.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
          queryClient.invalidateQueries({
            queryKey: trpc.tenant.featureAvailability.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.productAssistant.pathKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.setupAssistant.state.queryKey(),
          }),
        ])
        router.refresh()
      },
      onError: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.productAssistant.state.queryKey({
            conversationId: data.conversation.id,
          }),
        })
      },
    }),
  )
  const payload = setupProductPayloadSchema.safeParse(
    data.draft.entities[0]?.payload,
  ).data
  if (created || data.receipt)
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-xl font-semibold">Product created</h2>
        <p>
          {created?.name ?? payload?.name ?? "Your product"} is now in your
          Catalog.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              router.push(
                `/catalog?catalogDetail=${encodeURIComponent(created?.recordId ?? data.receipt ?? "")}`,
              )
            }}
          >
            View product
          </Button>
          <Button variant="outline" onClick={() => router.push("/catalog")}>
            Back to Catalog
          </Button>
          <Button
            onClick={() =>
              onCreated(created?.name ?? payload?.name ?? "Product")
            }
          >
            Done
          </Button>
          <Button variant="outline" onClick={onAnother}>
            Add another product
          </Button>
        </div>
      </div>
    )
  const money = (value: number | undefined) =>
    value === undefined ? "Needed" : formatMinorMoney(value, currencyCode)
  const refreshState = () =>
    void queryClient.invalidateQueries({
      queryKey: trpc.productAssistant.state.queryKey({
        conversationId: data.conversation.id,
      }),
    })
  const draftEntity = data.draft.entities[0] as SetupDraftEntity | undefined
  // The latest message that changed the draft carries the phone card; a draft
  // seeded from the form shows under the newest message until the chat edits it.
  const latestCardId = (
    [...cardHosts].reverse().find((host) => host.staged) ??
    (payload ? cardHosts.at(-1) : undefined)
  )?.messageId
  const draftDetails = (card: boolean) => (
    <>
      <SetupPrerequisites
        prerequisites={data.prerequisites}
        onTermsAccepted={refreshState}
        onFinanceReady={refreshState}
      />
      {card ? (
        <div className="flex items-start gap-2.5">
          {draftEntity && payload ? (
            <SetupRecordAvatar
              payload={entityPayload(draftEntity)}
              emoji={entityEmoji(entityPayload(draftEntity))}
              className="size-8 text-sm"
            />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {payload?.name ?? "Your product"}
            </p>
            {draftEntity && payload ? (
              <p className="text-xs text-muted-foreground">
                {entitySummary(entityPayload(draftEntity), currencyCode)}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live product draft
          </p>
          <h2 className="mt-3 text-lg font-semibold">
            {payload?.name ?? (data.snapshot.form.name || "Your product")}
          </h2>
        </>
      )}
      {data.possibleMatches.length ? (
        <div className={cn("space-y-2 text-sm", card ? "mt-2" : "mt-3")}>
          <p>
            Similar products already exist:{" "}
            {data.possibleMatches.map((item) => item.name).join(", ")}.
          </p>
          <label className="flex gap-2 items-start">
            <input
              type="checkbox"
              checked={separateName === payload?.name}
              onChange={(event) =>
                setSeparateName(
                  event.target.checked ? (payload?.name ?? null) : null,
                )
              }
            />
            Create this as a separate product
          </label>
        </div>
      ) : null}
      <dl
        className={cn(
          "text-sm",
          card
            ? "mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-3 [&_dd]:text-right [&_div]:contents"
            : "mt-4 space-y-3",
        )}
      >
        <div>
          <dt className="text-muted-foreground">Stock unit</dt>
          <dd>{payload?.unitName ?? "Needed"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Usage</dt>
          <dd>
            {payload?.usage === "INTERNAL_USE"
              ? "Internal use"
              : payload?.usage === "BOTH"
                ? "For sale and internal use"
                : "For sale"}
          </dd>
        </div>
        {payload?.usage !== "INTERNAL_USE" && !card ? (
          <div>
            <dt className="text-muted-foreground">Price per stock unit</dt>
            <dd>{money(payload?.priceMinor)}</dd>
          </div>
        ) : null}
        {(card ? undefined : payload?.sellingUnits)?.map((unit) => (
          <div key={unit.name}>
            <dt className="text-muted-foreground">
              {unit.name} · {unit.containsQuantity} {payload?.unitName}
            </dt>
            <dd>{money(unit.priceMinor)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-muted-foreground">Opening stock</dt>
          <dd>{payload?.openingStock ?? "Not supplied"}</dd>
        </div>
        {payload?.description && !card ? (
          <div>
            <dt className="text-muted-foreground">Description</dt>
            <dd>{payload.description}</dd>
          </div>
        ) : null}
        {data.snapshot.photoAssetIds.length && !card ? (
          <div>
            <dt>Photo</dt>
            <dd>Your selected photo is kept.</dd>
          </div>
        ) : null}
      </dl>
      {card ? null : (
        <p className="mt-5 text-xs text-muted-foreground">
          Review these details before creating. Nothing is added until you press
          Create product.
        </p>
      )}
      {data.requiresForm ? (
        <p className={cn(card ? "mt-2 text-xs" : "mt-3 text-sm")}>
          Your advanced details are preserved. Use Back to form to finish
          creating this product.
        </p>
      ) : !data.ready ? (
        <p
          className={cn(
            card ? "mt-2 text-xs text-muted-foreground" : "mt-3 text-sm",
          )}
        >
          Continue the chat to complete the missing details.
        </p>
      ) : null}
      {create.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {create.error.message} Your draft is safe. Retry to check the saved
          result.
        </p>
      ) : null}
      <Button
        className={cn("w-full", card ? "mt-3" : "mt-4")}
        size={card ? "sm" : "default"}
        disabled={
          !data.ready ||
          busy ||
          data.running ||
          create.isPending ||
          (data.possibleMatches.length > 0 && separateName !== payload?.name)
        }
        onClick={() =>
          create.mutate({
            conversationId: data.conversation.id,
            expectedRevision: data.draft.revision,
            createSeparateProduct: separateName === payload?.name,
          })
        }
      >
        {create.isPending ? "Creating…" : "Create product"}
      </Button>
    </>
  )
  const renderDraftCard: SetupDraftCardHost = ({ messageId, staged }) => (
    <PhoneDraftCard
      messageId={messageId}
      staged={staged.length > 0}
      active={messageId === latestCardId}
      register={registerCardHost}
    >
      {draftDetails(true)}
    </PhoneDraftCard>
  )
  return (
    <div className="flex h-[min(700px,calc(100svh-12rem))] min-h-96 flex-col gap-3 max-md:h-full max-md:min-h-0 max-md:gap-0">
      <div className="flex items-center justify-between gap-3 max-md:border-b max-md:px-4 max-md:pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 max-md:-ml-2"
          onClick={onBack}
          disabled={busy || data.running || create.isPending}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} />
          Back to form
        </Button>
        <AssistantAllowance compact />
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border max-md:rounded-none max-md:border-0 max-md:pb-[env(safe-area-inset-bottom)]">
          {data.runFailure ? (
            <output className="border-b p-3 text-sm">
              The reply could not finish. Your draft is safe. Send your message
              again or use Back to form.
            </output>
          ) : null}
          <SetupDraftCardContext.Provider value={renderDraftCard}>
            <SetupChat
              inputLabel="Tell the assistant about your product"
              key={data.conversation.id}
              conversationId={data.conversation.id}
              status="ACTIVE"
              initialMessages={
                data.messages as unknown as ComponentProps<
                  typeof SetupChat
                >["initialMessages"]
              }
              mediaEnabled={false}
              stateQueryKey={trpc.productAssistant.state.queryKey({
                conversationId: data.conversation.id,
              })}
              onBusyChange={setBusy}
            />
          </SetupDraftCardContext.Provider>
        </div>
        <aside
          className="min-h-0 overflow-y-auto rounded-lg border bg-muted/20 p-4 max-md:hidden"
          aria-label="Live product draft"
        >
          {draftDetails(false)}
        </aside>
      </div>
    </div>
  )
}

/** Phones read the live draft from a card in the chat instead of a side panel. */
function PhoneDraftCard({
  messageId,
  staged,
  active,
  register,
  children,
}: {
  messageId: string
  staged: boolean
  active: boolean
  register: (messageId: string, staged: boolean) => () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => register(messageId, staged), [register, messageId, staged])
  // The card appears after the reply finishes streaming; keep it in view if
  // the owner was already reading the end of the chat.
  useEffect(() => {
    const card = ref.current
    const log = card?.closest('[role="log"]')
    if (!active || !card || !log) return
    const gap = log.scrollHeight - log.scrollTop - log.clientHeight
    if (gap <= card.offsetHeight + 160)
      card.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active])
  if (!active) return null
  return (
    <section
      ref={ref}
      aria-label="Live product draft"
      className="rounded-xl border bg-background p-3 md:hidden"
    >
      {children}
    </section>
  )
}
