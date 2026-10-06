import { Skeleton } from "@ewatrade/ui"

export function StaffSkeleton() {
  return (
    <div aria-label="Loading staff" className="flex flex-col gap-3">
      {["first", "second", "third"].map((key) => (
        <Skeleton key={key} className="h-24 w-full" />
      ))}
    </div>
  )
}
