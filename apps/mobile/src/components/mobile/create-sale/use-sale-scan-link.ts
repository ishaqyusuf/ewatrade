import { useAuthContext } from "@/hooks/use-auth"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { router, useFocusEffect } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import type { LinkOption } from "./link-barcode-screen"
import type { SaleScan } from "./use-sale-scan"

const LINKED_TOAST_MS = 3_000

/**
 * Workshop Mobile Quality 02 v3, direction 01: an unknown scan becomes a
 * floating sheet. Catalog editors can open Link barcode (pick, confirm, save)
 * or start a new item with the code filled in. Afterwards the camera reopens
 * and the code is read again, so the item joins the sale through the normal
 * scan path (availability included).
 */
export function useSaleScanLink(model: CreateSaleViewModel, scan: SaleScan) {
  const { profile } = useAuthContext()
  const [code, setCode] = useState<string | null>(null)
  const [linked, setLinked] = useState<string | null>(null)
  const created = useRef<string | null>(null)
  const latest = useRef(scan)
  latest.current = scan
  const canLink =
    canEditMobileCatalog(profile) && !model.isOffline && !model.actionsLocked

  useEffect(() => {
    if (!linked) return
    const timer = setTimeout(() => setLinked(null), LINKED_TOAST_MS)
    return () => clearTimeout(timer)
  }, [linked])

  // Runs on focus changes only, so it fires when the new-item screen closes.
  useFocusEffect(
    useCallback(() => {
      const pending = created.current
      if (!pending) return
      created.current = null
      latest.current.open()
      void latest.current.read(pending)
    }, []),
  )

  return {
    canLink,
    code,
    linked,
    start(next: string) {
      setCode(next)
    },
    /** Closing Link barcode returns to scanning. */
    cancel() {
      setCode(null)
      latest.current.open()
    },
    done(option: LinkOption) {
      const scanned = code
      setCode(null)
      setLinked(`${option.itemName} · ${option.optionName}`)
      latest.current.open()
      if (scanned) void latest.current.read(scanned)
    },
    create(next: string) {
      created.current = next
      router.push(
        `/first-product-setup-modal?kind=product&from=sale&barcode=${encodeURIComponent(next)}` as never,
      )
    },
  }
}

export type SaleScanLink = ReturnType<typeof useSaleScanLink>
