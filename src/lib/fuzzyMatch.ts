/**
 * Lightweight fuzzy name matching — no external dependencies.
 * Used to match names typed/pasted in free text (e.g. "Team A Raj Nitin")
 * against the actual list of match participants, tolerating typos,
 * partial names, and case differences.
 */

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Classic Levenshtein edit distance
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }
  return dp[m][n]
}

export interface FuzzyCandidate {
  id: string
  name: string
}

export interface FuzzyMatchResult {
  candidate: FuzzyCandidate
  score: number // 0 = perfect match, higher = worse
}

/**
 * Finds the best-matching candidate for a given input name.
 * Returns null if nothing is close enough to be considered a match.
 *
 * Matching strategy, in order of preference:
 *   1. Exact match (case-insensitive) -> score 0
 *   2. One name is a substring of the other (e.g. "Raj" in "Raj Kumar") -> score 1
 *   3. Edit distance within a tolerance scaled to name length -> score = distance
 */
export function fuzzyMatchName(
  input: string,
  candidates: FuzzyCandidate[]
): FuzzyMatchResult | null {
  const normInput = normalize(input)
  if (!normInput) return null

  let best: FuzzyMatchResult | null = null

  for (const candidate of candidates) {
    const normCandidate = normalize(candidate.name)

    if (normCandidate === normInput) {
      return { candidate, score: 0 }
    }

    if (normCandidate.includes(normInput) || normInput.includes(normCandidate)) {
      const result = { candidate, score: 1 }
      if (!best || result.score < best.score) best = result
      continue
    }

    const distance = levenshtein(normInput, normCandidate)
    const tolerance = Math.max(1, Math.floor(Math.max(normInput.length, normCandidate.length) * 0.3))

    if (distance <= tolerance) {
      const result = { candidate, score: distance + 2 } // rank below substring matches
      if (!best || result.score < best.score) best = result
    }
  }

  return best
}
