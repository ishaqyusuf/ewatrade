import { X509Certificate, createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const expected = new Map([
  [
    "AppleIncRootCertificate.cer",
    "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",
  ],
  [
    "AppleRootCA-G2.cer",
    "c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050",
  ],
  [
    "AppleRootCA-G3.cer",
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",
  ],
])

/** Validate the exact trust material that Bun embeds in the API artifact. */
export function verifyBundledAppleRoots(
  contents = readFileSync(
    path.join(root, "apps/api/src/billing/apple-root-certificates.json"),
    "utf8",
  ),
) {
  const bundle = JSON.parse(contents)
  if (!Array.isArray(bundle) || bundle.length !== expected.size)
    throw new Error("Apple root certificate bundle is incomplete.")
  const seen = new Set()
  for (const entry of bundle) {
    const digest = expected.get(entry?.name)
    if (typeof entry?.derBase64 !== "string" || !digest || seen.has(entry.name))
      throw new Error("Apple root certificate bundle is invalid.")
    seen.add(entry.name)
    const der = Buffer.from(entry.derBase64, "base64")
    if (
      der.toString("base64") !== entry.derBase64 ||
      createHash("sha256").update(der).digest("hex") !== digest
    )
      throw new Error("Apple root certificate fingerprint mismatch.")
    const certificate = new X509Certificate(der)
    if (
      certificate.subject !== certificate.issuer ||
      !certificate.verify(certificate.publicKey)
    )
      throw new Error("Apple root certificate signature is invalid.")
  }
  return true
}
