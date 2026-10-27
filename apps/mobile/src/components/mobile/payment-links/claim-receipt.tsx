import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getBaseUrl } from "@/lib/base-url"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { MANUAL_RECEIPT_MAX_BYTES } from "@ewatrade/utils/manual-payments"
import { fetch as nativeFetch } from "expo/fetch"
import { useState } from "react"
import { ActivityIndicator } from "react-native"
import { deliverReceiptFile } from "../receipts/receipt-file"

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function sizeLabel(bytes: number | null) {
  if (!bytes) return ""
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The customer's transfer receipt, read from the API with this session.
 * Opening hands the exact file to the phone's viewer/share sheet.
 */
export function ClaimReceipt({
  contentType,
  orderNumber,
  receiptPath,
  sizeBytes,
}: {
  contentType: string | null
  orderNumber: string
  receiptPath: string | null
  sizeBytes: number | null
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  if (!receiptPath)
    return (
      <View className="min-h-12 flex-row items-center gap-2.5 rounded-[14px] bg-muted px-3 py-2.5">
        <Icon className="size-[18px] text-muted-foreground" name="Image" />
        <Text className="text-xs text-muted-foreground">
          No receipt attached
        </Text>
      </View>
    )
  const uri = `${getBaseUrl()}${receiptPath}`
  const image = Boolean(contentType?.startsWith("image/"))
  async function open() {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      const session = getSession()
      if (!session?.token || !session.profile.businessSlug)
        throw new Error("Sign in again to open this receipt.")
      const generation = getSessionGeneration()
      const assertCurrent = () => {
        if (getSessionGeneration() !== generation)
          throw new Error("Your account changed. Open the payment again.")
      }
      const headers: Record<string, string> = {
        "x-app-authorization": `Bearer ${session.token}`,
        "x-tenant-slug": session.profile.businessSlug,
        "x-trpc-source": "mobile",
        ...(session.profile.storeId
          ? { "x-store-id": session.profile.storeId }
          : {}),
      }
      const response = await nativeFetch(uri, { headers })
      assertCurrent()
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You don't have access to this receipt."
            : "The receipt couldn't be loaded. Try again.",
        )
      const type =
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? ""
      const bytes = new Uint8Array(await response.arrayBuffer())
      assertCurrent()
      if (
        !EXTENSIONS[type] ||
        !bytes.byteLength ||
        bytes.byteLength > MANUAL_RECEIPT_MAX_BYTES
      )
        throw new Error("The receipt couldn't be opened on this phone.")
      await deliverReceiptFile(
        {
          bytes,
          filename: `${orderNumber.replace(/[^a-zA-Z0-9_-]/g, "_")} transfer receipt.${EXTENSIONS[type]}`,
          mimeType: type,
        },
        "share",
        assertCurrent,
      )
    } catch (failure) {
      setProblem(
        failure instanceof Error && failure.message
          ? failure.message
          : "The receipt couldn't be opened.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <View className="gap-2">
      <View className="overflow-hidden rounded-[14px] bg-muted">
        <Pressable
          accessibilityHint="Opens the receipt in your phone's viewer"
          accessibilityLabel="Open the customer's transfer receipt"
          accessibilityRole="button"
          className="min-h-14 flex-row items-center gap-3 px-3 py-2.5"
          disabled={busy}
          haptic
          onPress={() => void open()}
        >
          <Icon
            className="size-[22px] text-foreground"
            name={image ? "Image" : "FileText"}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-foreground">
              Transfer receipt
            </Text>
            <Text className="text-xs text-muted-foreground">
              Added by the customer
              {sizeBytes ? ` · ${sizeLabel(sizeBytes)}` : ""}
            </Text>
          </View>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Icon className="size-[18px] text-muted-foreground" name="Eye" />
          )}
        </Pressable>
      </View>
      {problem ? <StatusBanner tone="destructive" message={problem} /> : null}
    </View>
  )
}
