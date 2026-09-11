export type QaSessionAccessClass =
  | "authenticated_global"
  | "platform_admin"
  | "tenant_scoped"

export function isQaDerivedSessionAllowed(
  accessClass: QaSessionAccessClass,
  hasQaScope: boolean,
) {
  return !hasQaScope || accessClass === "tenant_scoped"
}
