import { isPrescriptionProductionLaunchApproved } from "@ewatrade/db/queries"
import { notFound } from "next/navigation"

export function requirePrescriptionLaunch() {
  if (!isPrescriptionProductionLaunchApproved()) notFound()
}
