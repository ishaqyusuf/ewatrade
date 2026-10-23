"use client"

import { useCanCreateCatalogItems } from "@/components/catalog-item/catalog-create-access"
import { OpenAssistantReadRecord } from "@/components/open-assistant-read-record"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { getDataCacheGeneration, useTRPCClient } from "@/trpc/client"
import {
  type CatalogCreateHandoff,
  catalogCreateScopeMatches,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { useRef, useState } from "react"
import {
  type AddedServiceChoice,
  CreateServiceChoice,
} from "./create-service-choice"

/** Recheck the original scope and search before opening the existing form. */
export function OpenMissingCatalogItem({
  handoff,
  priceMinor,
  onAdded,
}: {
  handoff: CatalogCreateHandoff
  priceMinor?: number
  onAdded?: (choice: AddedServiceChoice) => void
}) {
  const allowed = useCanCreateCatalogItems()
  const client = useTRPCClient()
  const { setParams } = useCatalogItemParams()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<string | null>(null)
  const busy = useRef(false)
  if (!allowed) return null
  if (handoff.kind === "service" && priceMinor !== undefined)
    return (
      <CreateServiceChoice
        handoff={handoff}
        priceMinor={priceMinor}
        onAdded={onAdded}
      />
    )

  async function open() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    setExisting(null)
    const generation = getDataCacheGeneration()
    try {
      const context = await client.tenant.current.query()
      if (
        generation !== getDataCacheGeneration() ||
        !context.activeStore ||
        !catalogCreateScopeMatches(handoff, {
          tenantId: context.tenant.id,
          storeId: context.activeStore.id,
        })
      ) {
        setError("Select the original business and Store, then try again.")
        return
      }
      const page = await client.catalog.listItemsPage.query({
        query:
          priceMinor === undefined
            ? handoff.name
            : handoff.name.split(" · ")[0],
        kind: handoff.kind,
        searchOrder: "stable",
        limit: priceMinor === undefined ? 1 : 50,
      })
      if (generation !== getDataCacheGeneration()) return
      const existingItem =
        priceMinor === undefined
          ? page.items[0]
          : page.items.find((item) => {
              const wanted = serviceNameKey(handoff.name)
              return [
                item.name,
                ...item.variants.flatMap((variant) => [
                  variant.name,
                  ...variant.offerings.map((offering) => offering.name),
                ]),
              ].some((name) => serviceNameKey(name) === wanted)
            })
      if (existingItem || page.nextCursor) {
        setExisting(existingItem?.id ?? null)
        setError(
          "This search now has a saved match. Check it before adding another item.",
        )
        return
      }
      await setParams({
        catalogItem: "create",
        catalogEditItem: null,
        catalogCreateKind: handoff.kind,
        catalogCreateMode: "form",
        catalogCreateName: handoff.name,
        catalogCreatePrice:
          priceMinor === undefined ? null : String(priceMinor),
        catalogConversation: null,
        catalogCreateWork: priceMinor === undefined ? null : "tracked",
      })
    } catch {
      setError(
        "The catalog could not be checked. Try again before adding this item.",
      )
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <div className="grid max-w-64 justify-items-start gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void open()}
      >
        {pending
          ? "Checking catalog…"
          : handoff.kind === "service"
            ? "Add service"
            : "Add product"}
      </Button>
      {error ? (
        <output className="text-xs text-muted-foreground">{error}</output>
      ) : null}
      {existing ? (
        <OpenAssistantReadRecord
          target={{
            kind: "catalog_item",
            catalogItemId: existing,
            origin: handoff.origin,
          }}
        />
      ) : null}
    </div>
  )
}
