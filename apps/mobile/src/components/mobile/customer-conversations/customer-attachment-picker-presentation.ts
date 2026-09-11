import type { StoreConversationAttachmentKind } from "@ewatrade/utils"

type CustomerAttachmentPickerItem = {
  accessibilityLabel: string
  description: string
  kind: "document" | "image"
  label: string
}

export function resolveCustomerAttachmentPickerPresentation(input: {
  attachmentKinds: StoreConversationAttachmentKind[]
  documentAvailable: boolean
  requestLabel: string
}): {
  description: string
  items: CustomerAttachmentPickerItem[]
  title: string
} {
  const items: CustomerAttachmentPickerItem[] = []

  if (input.attachmentKinds.includes("image")) {
    items.push({
      accessibilityLabel: `Choose Photo. Choose an image from this device. Attach to ${input.requestLabel}.`,
      description: "Choose an image from this device",
      kind: "image",
      label: "Photo",
    })
  }

  if (input.documentAvailable && input.attachmentKinds.includes("document")) {
    items.push({
      accessibilityLabel: `Choose PDF document. Choose a private PDF file. Attach to ${input.requestLabel}.`,
      description: "Choose a private PDF file",
      kind: "document",
      label: "PDF document",
    })
  }

  return {
    description: `Choose what to attach to ${input.requestLabel}.`,
    items,
    title: "Share privately",
  }
}
