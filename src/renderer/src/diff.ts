export type Part = { type: 'same' | 'add' | 'del'; text: string }

// Word-level LCS diff; emails are short enough that O(n*m) is fine.
export function wordDiff(a: string, b: string): Part[] {
  const A = a.split(/(\s+|[.,!?;:()"])/).filter(Boolean)
  const B = b.split(/(\s+|[.,!?;:()"])/).filter(Boolean)
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const out: Part[] = []
  const push = (type: Part['type'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', A[i++])
    else push('add', B[j++])
  }
  while (i < n) push('del', A[i++])
  while (j < m) push('add', B[j++])
  return mergeHunks(out)
}

// LCS happily matches lone spaces and tiny words between edits, which reads as
// confetti. Fold those into the surrounding change so each hunk is del-then-add.
function mergeHunks(parts: Part[]): Part[] {
  const out: Part[] = []
  let del = ''
  let add = ''
  const flush = () => {
    if (del) out.push({ type: 'del', text: del })
    if (add) out.push({ type: 'add', text: add })
    del = add = ''
  }
  parts.forEach((p, k) => {
    const between = (del || add) && parts[k + 1] && parts[k + 1].type !== 'same'
    if (p.type === 'del') del += p.text
    else if (p.type === 'add') add += p.text
    else if (between && p.text.trim().length <= 2) {
      del += p.text
      add += p.text
    } else {
      flush()
      out.push(p)
    }
  })
  flush()
  return out
}

// Counts hunks: runs of changes separated only by whitespace count as one edit.
export function changeCount(a: string, b: string) {
  let n = 0
  let inHunk = false
  for (const p of wordDiff(a, b)) {
    if (p.type === 'same') {
      if (p.text.trim()) inHunk = false
    } else if (p.text.trim() && !inHunk) {
      n++
      inHunk = true
    }
  }
  return n
}
