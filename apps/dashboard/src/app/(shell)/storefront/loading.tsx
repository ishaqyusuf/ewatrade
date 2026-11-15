import { Skeleton } from "@ewatrade/ui"

export default function Loading() {
  return (
    <div
      className="mx-auto grid w-full max-w-3xl gap-4 pt-4 md:pt-6"
      aria-busy="true"
    >
      <Skeleton className="h-52 rounded-[var(--ui-radius-surface)]" />
      <Skeleton className="h-[360px] rounded-[var(--ui-radius-surface)]" />
    </div>
  )
}
