import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import {
  STATEMENT_PDF_PRESETS,
  type StatementPdfPreset,
  statementPdfRange,
} from "@ewatrade/order-receipts/statement"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Platform, View } from "react-native"
import { deliverReceiptFile } from "../receipts/receipt-file"

type Preset = Exclude<StatementPdfPreset, "custom">
const PRESETS = STATEMENT_PDF_PRESETS.filter(
  (
    option,
  ): option is (typeof STATEMENT_PDF_PRESETS)[number] & { key: Preset } =>
    option.key !== "custom",
)

function friendlyError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : ""
  if (/native module|is not a function|unavailable/i.test(message))
    return "This phone needs the latest ẸwáTrade update to share files. Update the app, then try again."
  return message || "Couldn’t prepare the statement. Try again."
}

/**
 * The same printable statement PDF as the dashboard, for chosen dates, shared
 * or saved through the Order receipt file path. Online only.
 */
export function StatementPdfActions({
  accountId,
  snapshotSequence,
}: { accountId: string; snapshotSequence: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const [preset, setPreset] = useState<Preset>("lastMonth")
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const busy = useRef(false)
  const run = useRef(0)
  useEffect(
    () => () => {
      run.current += 1
    },
    [],
  )

  async function deliver(action: "save" | "share") {
    if (busy.current) return
    busy.current = true
    const current = ++run.current
    const assertCurrent = () => {
      if (current !== run.current) throw new Error("Statement export stopped.")
    }
    setWorking(true)
    setError("")
    setMessage("")
    try {
      const pdf = await client.fetchQuery(
        trpc.customerLedger.statementPdf.queryOptions(
          { accountId, snapshotSequence, ...statementPdfRange(preset) },
          { staleTime: 0, gcTime: 0, retry: false },
        ),
      )
      assertCurrent()
      const bytes = Uint8Array.from(atob(pdf.pdfBase64), (character) =>
        character.charCodeAt(0),
      )
      const result = await deliverReceiptFile(
        { bytes, filename: pdf.filename, mimeType: "application/pdf" },
        action,
        assertCurrent,
        "statement",
      )
      if (current === run.current) setMessage(result)
    } catch (cause) {
      if (current === run.current) setError(friendlyError(cause))
    } finally {
      busy.current = false
      if (current === run.current) setWorking(false)
    }
  }

  return (
    <View className="gap-3">
      <Text className="text-sm font-bold text-foreground">Statement PDF</Text>
      <View
        className="flex-row flex-wrap gap-2"
        accessibilityRole="radiogroup"
        accessibilityLabel="Dates"
      >
        {PRESETS.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{
              checked: option.key === preset,
              disabled: working,
            }}
            disabled={working}
            className={`rounded-xl border px-4 py-2 ${option.key === preset ? "border-primary bg-accent" : "border-border"}`}
            onPress={() => setPreset(option.key)}
          >
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[140px] flex-1">
          <ActionButton
            variant="outline"
            icon={Platform.OS === "web" ? "Download" : "Share"}
            disabled={working}
            onPress={() =>
              void deliver(Platform.OS === "web" ? "save" : "share")
            }
          >
            {working
              ? "Preparing…"
              : Platform.OS === "web"
                ? "Download PDF"
                : "Share PDF"}
          </ActionButton>
        </View>
        {Platform.OS === "android" ? (
          <View className="min-w-[140px] flex-1">
            <ActionButton
              variant="outline"
              icon="Download"
              disabled={working}
              onPress={() => void deliver("save")}
            >
              Save PDF
            </ActionButton>
          </View>
        ) : null}
      </View>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      {message ? <StatusBanner message={message} tone="muted" /> : null}
    </View>
  )
}
