import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { chatAttachmentSource } from "@/lib/order-attachment-upload"
import { Image } from "expo-image"
import { useState } from "react"

type SentFile = {
  attachmentId: string
  kind: string
  fileName: string
  expired?: boolean
}

/**
 * A photo sent in the chat, shown as the picture itself. PDFs, expired files
 * and photos that can't be shown fall back to the file name.
 */
export function ChatSentFile({ file }: { file: SentFile }) {
  const [broken, setBroken] = useState(false)
  if (file.kind === "IMAGE" && !file.expired && !broken)
    return (
      <Image
        accessibilityLabel="Photo you sent"
        cachePolicy="memory"
        contentFit="cover"
        onError={() => setBroken(true)}
        source={chatAttachmentSource(file.attachmentId)}
        style={{
          alignSelf: "flex-end",
          borderRadius: 18,
          height: 240,
          width: 200,
        }}
      />
    )
  return (
    <View className="max-w-[80%] flex-row items-center gap-1.5 self-end rounded-full bg-card px-3 py-1.5">
      <Icon className="size-[13px] text-muted-foreground" name="ReceiptText" />
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {file.expired ? `${file.fileName} · removed` : file.fileName}
      </Text>
    </View>
  )
}

/** A small square of a chat photo; hides itself when there is nothing to show. */
export function ChatPhotoThumb({ attachmentId }: { attachmentId: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <Image
      accessibilityLabel="Photo"
      cachePolicy="memory"
      contentFit="cover"
      onError={() => setBroken(true)}
      source={chatAttachmentSource(attachmentId)}
      style={{ borderRadius: 12, height: 64, width: 64 }}
    />
  )
}
