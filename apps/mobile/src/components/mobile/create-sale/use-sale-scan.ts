import { useTRPC } from "@/trpc/client"
import { useQueryClient } from "@tanstack/react-query"
import { requireOptionalNativeModule } from "expo"
import { useEffect, useRef, useState } from "react"
import { saleOfferingChoices } from "./create-sale-model"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import {
  type SaleScanMatch,
  type SaleScanNotice,
  saleScanMatchName,
  scannedQuantity,
  scannedSaleChoice,
} from "./sale-scan-model"

const UNDO_MS = 5_000

export type SaleScanAdded = {
  offeringId: string
  name: string
  quantity: string
  /** Quantity before this scan; null when the scan added the line. */
  previous: string | null
}

/**
 * Workshop Mobile Quality 02 Create sale v2, direction 01: the scan key in
 * Search items. A scan identifies one exact offering (Business-scoped lookup)
 * and adds it, or one more of it; it never records the sale or opens a link.
 */
export function useSaleScan(model: CreateSaleViewModel) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const latest = useRef(model)
  latest.current = model
  const session = useRef(0)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice] = useState<SaleScanNotice | null>(null)
  const [choices, setChoices] = useState<{
    code: string
    matches: SaleScanMatch[]
  } | null>(null)
  const [added, setAdded] = useState<SaleScanAdded | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  // Older development binaries can still search by name until rebuilt.
  const cameraAvailable = Boolean(requireOptionalNativeModule("ExpoCamera"))

  useEffect(() => {
    if (!added) return
    const timer = setTimeout(() => setAdded(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [added])
  useEffect(
    () => () => {
      session.current++
    },
    [],
  )

  async function apply(match: SaleScanMatch, current: number) {
    const sale = latest.current
    let choice = scannedSaleChoice(match.offeringId, sale.allRows)
    if (!choice) {
      const item = await queryClient.fetchQuery(
        trpc.catalog.getItem.queryOptions({ itemId: match.catalogItemId }),
      )
      if (session.current !== current) return
      choice = scannedSaleChoice(
        match.offeringId,
        saleOfferingChoices(
          [item],
          // Same cached read the sale uses to build its choices.
          (
            await queryClient.fetchQuery(
              trpc.tenant.featureAvailability.queryOptions(),
            )
          ).storeId,
          latest.current.itemKind,
        ),
      )
    }
    // Both dependent reads can outlive closing/reopening the scanner or its owner.
    if (session.current !== current) return
    const now = latest.current
    if (!choice || "reason" in choice) {
      setNotice({
        kind: "unavailable",
        reason: choice && "reason" in choice ? choice.reason : undefined,
      })
      return
    }
    if (now.actionsLocked) return
    const name = saleScanMatchName(match)
    const line = now.selectedLines.find(
      (entry) => entry.offering?.id === choice.row.id,
    )
    if (line) {
      const quantity = scannedQuantity(line.quantity)
      now.updateQuantity(line.id, quantity)
      setAdded({
        offeringId: choice.row.id,
        name,
        quantity,
        previous: line.quantity,
      })
    } else {
      now.addOffering(choice.row)
      setAdded({
        offeringId: choice.row.id,
        name,
        quantity: "1",
        previous: null,
      })
    }
    // The added line must be visible, not hidden by an old search.
    if (now.productSearch) now.setProductSearch("")
  }

  // Docked scanning keeps reading: lookups run one after another so a quick
  // second scan cannot cancel the first.
  const queue = useRef<Promise<void>>(Promise.resolve())
  function read(code: string) {
    const run = queue.current.then(() => lookup(code))
    queue.current = run.catch(() => {})
    return run
  }

  async function lookup(code: string) {
    const current = ++session.current
    // A new scan replaces the last scan's notice.
    setNotice(null)
    try {
      const result = await queryClient.fetchQuery({
        ...trpc.catalog.findByCode.queryOptions({ code }),
        staleTime: 0,
      })
      if (session.current !== current) return
      if (result.status === "found") await apply(result.match, current)
      else if (result.status === "ambiguous")
        setChoices({ code: result.code, matches: result.matches })
      else
        setNotice({
          kind: result.status,
          code: "code" in result ? result.code : undefined,
        })
    } catch {
      if (session.current === current) setNotice({ kind: "failed" })
    }
  }

  return {
    available: cameraAvailable && !model.isOffline && !model.actionsLocked,
    scanning,
    notice,
    choices,
    added,
    focusRequest,
    open() {
      session.current++
      setNotice(null)
      setChoices(null)
      setAdded(null)
      setScanning(true)
    },
    close() {
      session.current++
      setScanning(false)
    },
    read,
    choose(match: SaleScanMatch) {
      const current = session.current
      setChoices(null)
      void apply(match, current).catch(() => {
        if (session.current === current) setNotice({ kind: "failed" })
      })
    },
    dismissChoices() {
      setChoices(null)
    },
    searchByName() {
      session.current++
      setScanning(false)
      setChoices(null)
      setNotice(null)
      setFocusRequest((value) => value + 1)
    },
    dismissNotice() {
      setNotice(null)
    },
    undo() {
      const sale = latest.current
      if (!added) return
      const line = sale.selectedLines.find(
        (entry) => entry.offering?.id === added.offeringId,
      )
      if (line) {
        if (added.previous === null) sale.removeOffering(line.id)
        else sale.updateQuantity(line.id, added.previous)
      }
      setAdded(null)
    },
  }
}

export type SaleScan = ReturnType<typeof useSaleScan>
