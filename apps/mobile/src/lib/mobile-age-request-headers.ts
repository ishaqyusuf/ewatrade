export function mobileAgeRequestHeaders(token: string | null | undefined) {
  return {
    ...(token ? { "x-app-authorization": `Bearer ${token}` } : {}),
    "x-trpc-source": "mobile",
  }
}
