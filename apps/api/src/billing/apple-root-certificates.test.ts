import { expect, test } from "bun:test"
import { X509Certificate, createHash } from "node:crypto"
import { appleRootCertificates } from "./apple-root-certificates"

test("Apple verification roots are pinned, valid and isolated from callers", () => {
  const roots = appleRootCertificates()
  expect(roots).toHaveLength(3)
  expect(
    roots.map((root) => createHash("sha256").update(root).digest("hex")),
  ).toEqual([
    "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",
    "c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050",
    "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179",
  ])
  for (const root of roots) {
    const certificate = new X509Certificate(root)
    expect(certificate.verify(certificate.publicKey)).toBe(true)
  }

  const first = roots[0]
  if (!first) throw new Error("Missing first Apple root")
  first[0] = 0
  expect(appleRootCertificates()[0]?.[0]).not.toBe(0)
})
