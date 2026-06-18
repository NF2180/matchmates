import { fuzzyMatchName, type FuzzyCandidate } from './fuzzyMatch'

export interface ParsedTeamAssignment {
  rawName: string
  side: 'A' | 'B'
  matchedPlayer: FuzzyCandidate | null
  matchScore: number | null
}

/**
 * Parses free text like:
 *   "Team A Raj Nitin Vipul"
 *   "Team A: Raj, Nitin, Vipul"
 *   "Team A\nRaj\nNitin\nVipul\n\nTeam B\nRahul\nSiraj"
 *
 * Recognizes a team header line containing "team a"/"team b" (or just
 * "a"/"b" on their own line), then treats subsequent names — separated
 * by commas, newlines, or whitespace — as belonging to that team, until
 * the next team header appears.
 */
export function parseTeamAssignmentText(
  text: string,
  candidates: FuzzyCandidate[]
): ParsedTeamAssignment[] {
  const results: ParsedTeamAssignment[] = []
  let currentSide: 'A' | 'B' | null = null

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
    const headerMatch = line.match(/^team\s*([ab])\b[:-]?\s*(.*)$/i)

    if (headerMatch) {
      currentSide = headerMatch[1].toUpperCase() as 'A' | 'B'
      const rest = headerMatch[2].trim()
      if (rest) {
        addNamesFromSegment(rest, currentSide, candidates, results)
      }
      continue
    }

    const bareHeaderMatch = line.match(/^([ab])$/i)
    if (bareHeaderMatch) {
      currentSide = bareHeaderMatch[1].toUpperCase() as 'A' | 'B'
      continue
    }

    if (currentSide) {
      addNamesFromSegment(line, currentSide, candidates, results)
    }
  }

  return results
}

function addNamesFromSegment(
  segment: string,
  side: 'A' | 'B',
  candidates: FuzzyCandidate[],
  results: ParsedTeamAssignment[]
) {
  const tokens = segment.includes(',')
    ? segment.split(',').map((t) => t.trim()).filter(Boolean)
    : segment.split(/\s+/).map((t) => t.trim()).filter(Boolean)

  for (const token of tokens) {
    const match = fuzzyMatchName(token, candidates)
    results.push({
      rawName: token,
      side,
      matchedPlayer: match?.candidate ?? null,
      matchScore: match?.score ?? null,
    })
  }
}
