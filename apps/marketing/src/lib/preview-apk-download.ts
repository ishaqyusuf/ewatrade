import { parsePublishedBuild } from "@ewatrade/utils/app-update"

const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
}

export async function previewApkDownload(
  environment: string | undefined,
  readBuild: () => Promise<unknown>,
) {
  if (environment !== "preview") {
    return new Response("Not found", { status: 404, headers })
  }

  try {
    const value = await readBuild()
    const build = value === null ? null : parsePublishedBuild(value)
    if (!build?.active) {
      return new Response("No Android Preview download is available yet.", {
        status: 404,
        headers,
      })
    }

    return new Response(null, {
      status: 307,
      headers: { ...headers, Location: build.artifactUrl },
    })
  } catch {
    return new Response(
      "The Android Preview download is temporarily unavailable. Please try again.",
      {
        status: 503,
        headers: { ...headers, "Retry-After": "60" },
      },
    )
  }
}
