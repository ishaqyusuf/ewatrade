import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { Image, View } from "react-native"

export type SaleOfferingChoice = {
  availableQuantity?: string
  balanceRevision?: number
  catalogItemId: string
  configurationVersionId?: string
  currencyCode: string
  disabledReason?: string
  displayName: string
  fixedPriceMinor: number | null
  id: string
  imageUrl?: string | null
  itemName: string
  kind: "product_unit" | "service"
  offeringName: string
  unitName?: string
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function SaleItemAvatar({
  choice,
  size = "compact",
}: {
  choice: SaleOfferingChoice
  size?: "compact" | "large"
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const avatarClassName =
    size === "large" ? "h-14 w-14 rounded-full" : "h-11 w-11 rounded-full"

  if (choice.imageUrl && failedImageUrl !== choice.imageUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        className={avatarClassName}
        onError={() => setFailedImageUrl(choice.imageUrl ?? null)}
        source={{ uri: choice.imageUrl }}
      />
    )
  }

  const label = initials(choice.itemName)

  return (
    <View
      className={cn(avatarClassName, "items-center justify-center bg-muted")}
    >
      {label ? (
        <Text
          className={cn(
            "font-extrabold text-foreground",
            size === "large" ? "text-sm" : "text-xs",
          )}
        >
          {label}
        </Text>
      ) : (
        <Icon
          className="size-sm text-muted-foreground"
          name={choice.kind === "service" ? "Wrench" : "Warehouse"}
        />
      )}
    </View>
  )
}

export function saleOfferingTitle(choice: SaleOfferingChoice) {
  const unitName = choice.unitName?.trim()
  return unitName ? `${choice.displayName} - ${unitName}` : choice.displayName
}
