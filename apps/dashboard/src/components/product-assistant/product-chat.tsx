"use client"
import { SetupChat } from "@/components/setup-assistant/setup-chat"
import { SetupPrerequisites } from "@/components/setup-assistant/setup-prerequisites"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { setupProductPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { Button } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import type { ComponentProps } from "react"
import { useState } from "react"
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
    value === undefined
      ? "Needed"
      : new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
        }).format(value / 100)
  return (
    <div className="flex h-[min(700px,calc(100svh-12rem))] min-h-96 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={busy || data.running || create.isPending}
        >
          Back to form
        </Button>
        <AssistantAllowance compact />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
          {data.runFailure ? (
            <output className="border-b p-3 text-sm">
              The reply could not finish. Your draft is safe. Send your message
              again or use Back to form.
            </output>
          ) : null}
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
        </div>
        <aside
          className="min-h-0 overflow-y-auto rounded-lg border bg-muted/20 p-4"
          aria-label="Live product draft"
        >
          <SetupPrerequisites
            prerequisites={data.prerequisites}
            onTermsAccepted={() =>
              void queryClient.invalidateQueries({
                queryKey: trpc.productAssistant.state.queryKey({
                  conversationId: data.conversation.id,
                }),
              })
            }
            onFinanceReady={() =>
              void queryClient.invalidateQueries({
                queryKey: trpc.productAssistant.state.queryKey({
                  conversationId: data.conversation.id,
                }),
              })
            }
          />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Live product draft
          </p>
          <h2 className="mt-3 text-lg font-semibold">
            {payload?.name ?? (data.snapshot.form.name || "Your product")}
          </h2>
          {data.possibleMatches.length ? (
            <div className="mt-3 space-y-2 text-sm">
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
          <dl className="mt-4 space-y-3 text-sm">
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
            {payload?.usage !== "INTERNAL_USE" ? (
              <div>
                <dt className="text-muted-foreground">Price per stock unit</dt>
                <dd>{money(payload?.priceMinor)}</dd>
              </div>
            ) : null}
            {payload?.sellingUnits?.map((unit) => (
              <div key={unit.name}>
                <dt className="text-muted-foreground">
                  {unit.name} · {unit.containsQuantity} {payload.unitName}
                </dt>
                <dd>{money(unit.priceMinor)}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted-foreground">Opening stock</dt>
              <dd>{payload?.openingStock ?? "Not supplied"}</dd>
            </div>
            {payload?.description ? (
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd>{payload.description}</dd>
              </div>
            ) : null}
            {data.snapshot.photoAssetIds.length ? (
              <div>
                <dt>Photo</dt>
                <dd>Your selected photo is kept.</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-5 text-xs text-muted-foreground">
            Review these details before creating. Nothing is added until you
            press Create product.
          </p>
          {data.requiresForm ? (
            <p className="mt-3 text-sm">
              Your advanced details are preserved. Use Back to form to finish
              creating this product.
            </p>
          ) : !data.ready ? (
            <p className="mt-3 text-sm">
              Continue the chat to complete the missing details.
            </p>
          ) : null}
          {create.error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {create.error.message} Your draft is safe. Retry to check the
              saved result.
            </p>
          ) : null}
          <Button
            className="mt-4 w-full"
            disabled={
              !data.ready ||
              busy ||
              data.running ||
              create.isPending ||
              (data.possibleMatches.length > 0 &&
                separateName !== payload?.name)
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
        </aside>
      </div>
    </div>
  )
}
