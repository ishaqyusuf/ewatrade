import Link from "next/link"

export default function AccessUnavailablePage() {
  return <main className="mx-auto grid max-w-md gap-4 p-8"><h1 className="text-xl font-semibold">No Store access</h1><p>Your Store access has been removed or is unavailable. Contact your business administrator.</p><Link href="/login" className="underline">Return to sign in</Link></main>
}
