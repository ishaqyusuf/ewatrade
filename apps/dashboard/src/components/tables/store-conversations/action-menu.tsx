"use client"

import { Button } from "@ewatrade/ui"

export function StoreConversationActionMenu({
  onOpen,
}: {
  onOpen: () => void
}) {
  return (
    <Button
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      Open
    </Button>
  )
}
