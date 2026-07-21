import { Text as BaseText } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"

const CATALOG_TEXT_SCALE: Record<string, string> = {
  "leading-5": "leading-[30px]",
  "leading-8": "leading-[48px]",
  "text-[10px]": "text-[15px]",
  "text-[11px]": "text-[17px]",
  "text-xs": "text-lg",
  "text-sm": "text-[21px]",
  "text-base": "text-2xl",
  "text-lg": "text-[27px]",
  "text-xl": "text-3xl",
  "text-2xl": "text-4xl",
}

function scaleCatalogTextClassName(className?: string) {
  const scaledClassName = className
    ?.split(/\s+/)
    .filter(Boolean)
    .map((token) => CATALOG_TEXT_SCALE[token] ?? token)
    .join(" ")

  return cn("text-2xl", scaledClassName)
}

export function CatalogFormText({
  className,
  ...props
}: ComponentProps<typeof BaseText>) {
  return (
    <BaseText className={scaleCatalogTextClassName(className)} {...props} />
  )
}
