import { previewApkDownload } from "@/lib/preview-apk-download"
import { prisma } from "@ewatrade/db"
import { getMobileBuild } from "@ewatrade/db/app-update"

export const dynamic = "force-dynamic"

export function GET() {
  return previewApkDownload(process.env.APP_ENV, () => getMobileBuild(prisma))
}
