/** Google confirms OAuth token revocation with HTTP 200. Any other response leaves the credential for review. */
export async function revokeGoogleAuthorization(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  })
  if (response.status !== 200)
    throw new Error("Google authorization revocation is not confirmed.")
}
