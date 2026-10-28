/**
 * Queries whose input is too large or too private for a GET URL. The private
 * Studio preview sends whole design compositions plus its signed preview session;
 * as a GET (and batched with other queries) the request line can pass the server's
 * header-size limit and come back as an empty-bodied error, which the client then
 * reports as "Unexpected end of JSON input". These go in a POST body instead
 * (the API already allows tRPC method override). Exact path and type only.
 */
const BODY_QUERIES = new Set(["storefront.preview"])

export function isBodyTransportQuery(op: { path: string; type: string }) {
  return op.type === "query" && BODY_QUERIES.has(op.path)
}
