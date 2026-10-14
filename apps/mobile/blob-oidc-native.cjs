/** Native uploads use only the server's one-object client token. */
async function getVercelOidcToken() {
  // Match the SDK browser entry's empty OIDC result without importing its
  // unused server verification exports (which require Web Crypto at load time).
  return ""
}

module.exports = { getVercelOidcToken }
