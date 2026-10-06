import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@ewatrade/ui"
export function DetailLoading() {
  return (
    <output className="grid gap-4" aria-label="Loading item details">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </output>
  )
}
export function DetailError({
  message,
  retry,
}: { message: string; retry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not load details</AlertTitle>
      <AlertDescription>
        {message}
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  )
}
export function DetailEmpty({
  title,
  description,
}: { title: string; description: string }) {
  return (
    <Empty className="p-6">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
