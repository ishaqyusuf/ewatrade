import { X509Certificate, createHash } from "node:crypto"
import roots from "./apple-root-certificates.json"

// Pin the exact DER certificates downloaded from Apple's public PKI.
const expectedFingerprints: Record<string, string> = {
  "AppleIncRootCertificate.cer":
    "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",
  "AppleRootCA-G2.cer":
    "c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050",
  "AppleRootCA-G3.cer":
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",
}

let verifiedRoots: Buffer[] | undefined

/** Public DER roots travel inside the API bundle, independent of runtime paths. */
export function appleRootCertificates(): Buffer[] {
  if (verifiedRoots) return verifiedRoots.map((root) => Buffer.from(root))
  if (roots.length !== Object.keys(expectedFingerprints).length)
    throw new Error("Apple root certificate bundle is incomplete.")

  const seen = new Set<string>()
  const verified = roots.map(({ name, derBase64 }) => {
    const expected = expectedFingerprints[name]
    if (!expected || seen.has(name))
      throw new Error("Apple root certificate bundle is invalid.")
    seen.add(name)
    const der = Buffer.from(derBase64, "base64")
    const digest = createHash("sha256").update(der).digest("hex")
    if (der.toString("base64") !== derBase64 || digest !== expected)
      throw new Error("Apple root certificate fingerprint mismatch.")
    const certificate = new X509Certificate(der)
    if (
      certificate.subject !== certificate.issuer ||
      !certificate.verify(certificate.publicKey)
    )
      throw new Error("Apple root certificate signature is invalid.")
    return der
  })
  verifiedRoots = verified
  return verified.map((root) => Buffer.from(root))
}
