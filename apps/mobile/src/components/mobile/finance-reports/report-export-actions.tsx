import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useEffect, useRef, useState } from "react"
import { Platform, View } from "react-native"
import { saveFinanceCsv, shareFinanceCsv } from "./report-share"

export function ReportExportActions({
  filename,
  build,
}: { filename: string; build: (cancelled: () => boolean) => Promise<string> }) {
  const stopped = useRef(false)
  const busy = useRef(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(
    () => () => {
      stopped.current = true
    },
    [],
  )
  async function run(save: boolean) {
    if (busy.current) return
    busy.current = true
    stopped.current = false
    setWorking(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const csv = await build(() => stopped.current)
      if (stopped.current) return
      const result = await (save ? saveFinanceCsv : shareFinanceCsv)(
        csv,
        filename,
      )
      if (!stopped.current) setMessage(result)
    } catch (failure) {
      if (!stopped.current)
        setError(
          failure instanceof Error ? failure.message : "Unable to prepare CSV.",
        )
    } finally {
      busy.current = false
      if (!stopped.current) setWorking(false)
    }
  }
  return (
    <View className="gap-3">
      <ActionButton
        variant="outline"
        disabled={working}
        onPress={() => void run(false)}
      >
        {working
          ? "Preparing full snapshot…"
          : Platform.OS === "web"
            ? "Download CSV"
            : Platform.OS === "ios"
              ? "Share CSV file"
              : "Share CSV text"}
      </ActionButton>
      {Platform.OS === "android" ? (
        <ActionButton
          variant="outline"
          disabled={working}
          onPress={() => void run(true)}
        >
          Save CSV file
        </ActionButton>
      ) : null}
      {working ? (
        <ActionButton
          variant="outline"
          onPress={() => {
            stopped.current = true
            setWorking(false)
          }}
        >
          Cancel export
        </ActionButton>
      ) : null}
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      {message ? <StatusBanner message={message} tone="muted" /> : null}
    </View>
  )
}
