export type PayloadBoundOperation = {
  id: string
  key: string
}

export function resolvePayloadBoundOperation(
  current: PayloadBoundOperation | null,
  key: string,
  createId: () => string = () => crypto.randomUUID(),
): PayloadBoundOperation {
  return current?.key === key ? current : { id: createId(), key }
}
