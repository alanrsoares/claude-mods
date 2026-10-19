const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2')
const trim = (s: string) => (s.length > 1 ? s.replace(/\/+$/, '') : s)

const LEADING_CD = /^\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)\s*/

/** Removes leading `cd <cwd> &&` chains that point at the directory already in force. */
export const stripCd = (command: string, cwd: string) => {
  let out = command
  for (;;) {
    const m = LEADING_CD.exec(out)
    if (!m || trim(unquote(m[1] ?? '')) !== trim(cwd)) return out
    out = out.slice(m[0].length)
  }
}

// A lone `cat file`, `grep pat file` or `sed -i ...`: no pipe, chain, redirect or substitution.
const LONE = /^[^|&;<>`$()\n]+$/
const REDIRECTS: [RegExp, string][] = [
  [/^\s*cat\s+\S/, 'Use the Read tool instead of cat.'],
  [/^\s*(?:e|f)?grep\s+\S/, 'Use the Grep tool instead of grep.'],
  [/^\s*sed\s+(?:-[a-zA-Z]*i|--in-place)\b/, 'Use the Edit tool instead of sed -i.'],
]

export const redirectFor = (command: string) =>
  LONE.test(command) ? REDIRECTS.find(([re]) => re.test(command))?.[1] : undefined
