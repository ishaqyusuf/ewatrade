/**
 * Deep search: words in any order, plurals, prefixes, small typos, ranked by
 * how much of the query each record matches. Shared by the API (online) and
 * the apps (saved, offline lists) so both rank the same way.
 */

export type SearchField = { text: string | null | undefined; weight?: number }

export type SearchMatch = {
  /** Share of query words found anywhere in the record, 0 to 1. */
  coverage: number
  /** Ranking score: coverage first, then quality and phrase bonuses. */
  score: number
}

const STOP_WORDS = new Set(["a", "an", "and", "of", "the", "for", "to", "in"])

/** Lower case, strip accents, keep letters and digits. */
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .trim()
}

/** "eggs" → "egg", "boxes" → "box", "dressing" stays. */
export function searchStem(word: string) {
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word))
    return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss"))
    return word.slice(0, -1)
  return word
}

/** Distinct query words, in typed order, without filler words. */
export function searchTokens(query: string, limit = 8) {
  const words = normalizeSearchText(query).split(" ").filter(Boolean)
  const kept = words.filter((word) => !STOP_WORDS.has(word))
  return [...new Set(kept.length ? kept : words)].slice(0, limit)
}

function withinEdits(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      )
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > max) return false
    previous = current
  }
  return (previous[b.length] ?? max + 1) <= max
}

/** How well one query word matches one record word, 0 to 1. */
function wordMatch(token: string, word: string) {
  if (word === token) return 1
  const stemToken = searchStem(token)
  const stemWord = searchStem(word)
  if (stemWord === stemToken) return 0.95
  if (word.startsWith(token) || stemWord.startsWith(stemToken)) return 0.85
  if (token.length >= 3 && word.includes(stemToken)) return 0.6
  if (token.length >= 4) {
    const edits = token.length >= 7 ? 2 : 1
    if (withinEdits(stemToken, stemWord, edits)) return 0.5
    // A typo inside the typed prefix ("brioler" for "broiler chicken").
    if (
      word.length > token.length &&
      withinEdits(stemToken, word.slice(0, stemToken.length), 1)
    )
      return 0.45
  }
  return 0
}

/**
 * Scores a record against a query. Fields carry weights (name 1, the default;
 * secondary details lower). Returns null when no query word matches.
 */
export function searchMatch(
  query: string,
  fields: readonly SearchField[],
): SearchMatch | null {
  const tokens = searchTokens(query)
  if (!tokens.length) return { coverage: 1, score: 0 }
  const prepared = fields
    .filter((field) => field.text)
    .map((field) => {
      const text = normalizeSearchText(field.text ?? "")
      return { text, weight: field.weight ?? 1, words: text.split(" ") }
    })
  let matched = 0
  let quality = 0
  for (const token of tokens) {
    let best = 0
    for (const field of prepared) {
      for (const word of field.words) {
        const value = wordMatch(token, word) * field.weight
        if (value > best) best = value
      }
    }
    if (best > 0) matched += 1
    quality += best
  }
  if (!matched) return null
  const coverage = matched / tokens.length
  const primary = prepared[0]?.text ?? ""
  const phrase = tokens.join(" ")
  let bonus = 0
  if (primary === phrase) bonus += 20
  else if (primary.startsWith(phrase)) bonus += 12
  else if (primary.includes(phrase)) bonus += 6
  return {
    coverage,
    score: coverage * 100 + (quality / tokens.length) * 20 + bonus,
  }
}

/**
 * Filters and orders records by match. Keeps records that match at least
 * `minCoverage` of the query words (half by default), best first; ties keep
 * their original order.
 */
export function rankBySearch<T>(
  records: readonly T[],
  query: string,
  fields: (record: T) => readonly SearchField[],
  { minCoverage = 0.5 }: { minCoverage?: number } = {},
) {
  if (!searchTokens(query).length) return [...records]
  return records
    .map((record, index) => ({
      index,
      match: searchMatch(query, fields(record)),
      record,
    }))
    .filter(
      (entry): entry is typeof entry & { match: SearchMatch } =>
        entry.match !== null && entry.match.coverage >= minCoverage,
    )
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .map((entry) => entry.record)
}
