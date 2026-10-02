export const DEFAULT_SERVICE_WORK_QUEUE_SORT = [
  { field: "priority", direction: "desc" },
  { field: "createdAt", direction: "asc" },
] as const

export const DEFAULT_SERVICE_WORK_QUEUE_ID_DIRECTION = "asc" as const
