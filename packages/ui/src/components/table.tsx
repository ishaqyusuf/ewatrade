import type { ComponentProps } from "react"
import { cn } from "../lib/utils"

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  )
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead className={cn("border [&_tr]:border-b", className)} {...props} />
  )
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("border [&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

export function TableFooter({ className, ...props }: ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "bg-primary font-medium text-primary-foreground",
        className,
      )}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b", className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-12 w-auto border-r px-4 text-left align-middle font-medium text-muted-foreground last:border-r-0 [&:has([role=checkbox])]:pr-0 [&:nth-last-child(2)]:border-r-0",
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "overflow-hidden border-r px-4 py-2 align-middle last:border-r-0 [&:has([role=checkbox])]:pr-0 [&:nth-last-child(2)]:border-r-0",
        className,
      )}
      {...props}
    />
  )
}

export function TableCaption({
  className,
  ...props
}: ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}
