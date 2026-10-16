export const MAX_WORDS = 25
export const MAX_SENTENCES = 6

export type Report = { long: number; passive: number; dense: number }

// Code, links and paths are exempt from STE100: drop them before counting.
const stripExempt = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, 'x')
    .replace(/https?:\/\/\S+/g, 'x')
    .replace(/\S*\/\S*/g, 'x')
    .replace(/^\s*(#+|[-*>|]|\d+\.)\s*/gm, '')

const PASSIVE = /\b(is|are|was|were|be|been|being)\s+(\w+ed|\w+en|done|made|run|set|shown|built)\b/i

export const lint = (answer: string): Report => {
  const paragraphs = stripExempt(answer).split(/\n{2,}/)
  const report: Report = { long: 0, passive: 0, dense: 0 }

  for (const p of paragraphs) {
    const sentences = p.split(/(?<=[.!?])\s+|\n+/).filter(s => /\w/.test(s))
    if (sentences.length > MAX_SENTENCES) report.dense += 1
    for (const s of sentences) {
      if (s.trim().split(/\s+/).length > MAX_WORDS) report.long += 1
      if (PASSIVE.test(s)) report.passive += 1
    }
  }
  return report
}

export const summary = (r: Report) => {
  const found = [
    r.long && `${r.long} long`,
    r.passive && `${r.passive} passive`,
    r.dense && `${r.dense} dense`,
  ].filter(Boolean)
  return found.length ? `STE ⚠ ${found.join(' · ')}` : 'STE ✓'
}
