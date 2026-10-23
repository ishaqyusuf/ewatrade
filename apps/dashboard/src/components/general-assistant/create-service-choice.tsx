"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import {
  type CatalogCreateHandoff,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

export type AddedServiceChoice = {
  offeringId: string
  itemId: string
  itemName: string
}

/** The menu selection is the explicit save action; preparing or opening the menu never writes. */
export function CreateServiceChoice({
  handoff,
  priceMinor,
  onAdded,
}: {
  handoff: CatalogCreateHandoff
  priceMinor: number
  onAdded?: (choice: AddedServiceChoice) => void
}) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setParams } = useCatalogItemParams()
  const [services, setServices] = useState<Array<{ id: string; name: string }>>(
    [],
  )
  const [cursor, setCursor] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<AddedServiceChoice | null>(null)
  const busy = useRef(false)
  const operationIds = useRef(new Map<string, string>())

  const addedCallback = useRef(onAdded)
  addedCallback.current = onAdded
  // Saved chats retain their original read-only draft; reconcile a later saved choice on reopen.
  useEffect(() => {
    let cancelled = false
    const generation = getDataCacheGeneration()
    const tenantId = handoff.origin.tenantId
    const storeId = handoff.origin.storeId
    const name = handoff.name
    setPending(true)
    busy.current = true
    void (async () => {
      try {
        const current = await client.tenant.current.query()
        if (
          cancelled ||
          generation !== getDataCacheGeneration() ||
          current.tenant.id !== tenantId ||
          current.activeStore?.id !== storeId
        )
          return
        const page = await client.catalog.listItemsPage.query({
          kind: "service",
          query: name.split(" · ")[0],
          searchOrder: "stable",
          limit: 50,
        })
        if (
          cancelled ||
          generation !== getDataCacheGeneration() ||
          page.nextCursor
        )
          return
        const matches = page.items
          .filter((item) => item.status === "active")
          .flatMap((item) =>
            item.variants
              .filter((variant) => variant.status === "active")
              .flatMap((variant) =>
                variant.offerings
                  .filter(
                    (offering) =>
                      offering.status === "active" &&
                      offering.pricingPolicy === "fixed" &&
                      offering.fixedPriceMinor === priceMinor &&
                      serviceNameKey(offering.name) === serviceNameKey(name) &&
                      offering.stores.some(
                        (store) =>
                          store.storeId === storeId && store.isAvailable,
                      ),
                  )
                  .map((offering) => ({
                    offeringId: offering.id,
                    itemId: item.id,
                    itemName: item.name,
                  })),
              ),
          )
        const match = matches.length === 1 ? matches[0] : undefined
        if (match) {
          setAdded(match)
          addedCallback.current?.(match)
        }
      } catch {
        // A read failure cannot establish absence or save anything. The menu rechecks scope on use.
      } finally {
        if (!cancelled) {
          busy.current = false
          setPending(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    client,
    handoff.origin.tenantId,
    handoff.origin.storeId,
    handoff.name,
    priceMinor,
  ])

  async function scope() {
    const generation = getDataCacheGeneration()
    const current = await client.tenant.current.query()
    if (
      generation !== getDataCacheGeneration() ||
      current.tenant.id !== handoff.origin.tenantId ||
      current.activeStore?.id !== handoff.origin.storeId
    )
      throw Error("Select the original business and Store, then try again.")
    return generation
  }
  async function load(more = false) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const generation = await scope()
      const page = await client.catalog.listItemsPage.query({
        kind: "service",
        status: "active",
        searchOrder: "stable",
        limit: 50,
        ...(more && cursor ? { cursor } : {}),
      })
      if (generation !== getDataCacheGeneration()) return
      setServices((previous) =>
        more
          ? [
              ...previous,
              ...page.items.map((item) => ({ id: item.id, name: item.name })),
            ]
          : page.items.map((item) => ({ id: item.id, name: item.name })),
      )
      setCursor(page.nextCursor ?? null)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Services could not be loaded.",
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  async function create(itemId?: string) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const generation = await scope()
      if (!itemId) {
        await setParams({
          catalogItem: "create",
          catalogEditItem: null,
          catalogCreateKind: "service",
          catalogCreateMode: "form",
          catalogCreateName: handoff.name,
          catalogCreatePrice: String(priceMinor),
          catalogCreateWork: "tracked",
          catalogConversation: null,
        })
        return
      }
      let clientOperationId = operationIds.current.get(itemId)
      if (!clientOperationId) {
        clientOperationId = crypto.randomUUID()
        operationIds.current.set(itemId, clientOperationId)
      }
      const result = await client.catalog.addServiceChoice.mutate({
        itemId,
        originTenantId: handoff.origin.tenantId,
        storeId: handoff.origin.storeId,
        name: handoff.name,
        priceMinor,
        clientOperationId,
      })
      if (generation !== getDataCacheGeneration()) return
      setAdded(result)
      onAdded?.(result)
      await queryClient.invalidateQueries(trpc.catalog.pathFilter())
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This choice could not be added. Try again.",
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <div className="grid justify-items-start gap-2">
      {added ? (
        <output className="text-xs text-muted-foreground">
          Added to {added.itemName}
        </output>
      ) : (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) void load()
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
              />
            }
          >
            {pending ? "Working…" : "Create"}
            <span aria-hidden="true"> ▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            appearance="dashboard"
            align="start"
            className="max-h-72 overflow-y-auto"
          >
            <DropdownMenuItem disabled={pending} onClick={() => void create()}>
              Create separate service
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                Add option to existing service
              </DropdownMenuLabel>
              {services.map((service) => (
                <DropdownMenuItem
                  key={service.id}
                  disabled={pending}
                  onClick={() => void create(service.id)}
                >
                  {service.name}
                </DropdownMenuItem>
              ))}
              {cursor ? (
                <DropdownMenuItem
                  disabled={pending}
                  onClick={(event) => {
                    event.preventDefault()
                    void load(true)
                  }}
                >
                  More services
                </DropdownMenuItem>
              ) : null}
              {!pending && !services.length ? (
                <DropdownMenuItem disabled>
                  No existing services
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {error ? (
        <output className="max-w-72 text-xs text-destructive">{error}</output>
      ) : null}
    </div>
  )
}
