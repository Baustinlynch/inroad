// Smoke test for src/main/claude.ts against the real Agent SDK. With no
// ANTHROPIC_API_KEY it uses this machine's Claude Code sign-in.
//   npx tsx scripts/test-claude.ts [test|research|chat|voice]
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chat, configureClaude, learnVoice, researchAndDraft, testClaude } from '../src/main/claude'

configureClaude({ workspace: mkdtempSync(join(tmpdir(), 'inroad-')), clientApp: 'inroad/test' })
const key = process.env.INROAD_TEST_KEY // deliberately not ANTHROPIC_API_KEY
const which = process.argv[2] ?? 'test'
const voice = { name: 'Jordan', notes: ['Short paragraphs, under ~170 words.', 'Signs off "Cheers," then first name.'], examples: [] }
const log = (p: { kind: string; text: string }) => (p.kind === 'step' ? console.log('  ·', p.text) : process.stdout.write(p.text))

if (which === 'test') {
  const r = await testClaude(key)
  console.log(r)
  assert.ok(r.ok)
}

if (which === 'research') {
  const t = Date.now()
  const r = await researchAndDraft(
    key,
    {
      jobId: 'j1',
      company: 'Cloudflare',
      website: 'cloudflare.com',
      campaignNotes: 'Hack the Harbour 2026, a 48-hour student hackathon in Sydney, 14–16 Nov, ~400 hackers. Asking for sponsorship (Gold $5k with a prize track) or API credits + a workshop.',
      voice,
      senderName: 'Jordan Ellis',
    },
    log,
  )
  if (!r.ok) throw new Error(r.error)
  console.log(`\n✓ research + draft in ${Math.round((Date.now() - t) / 1000)}s`)
  console.log('  brief sections:', r.value.draft.brief.sections.map((s) => s.title))
  console.log('  recipients:', r.value.draft.brief.recipients.map((x) => `${x.name} <${x.email || 'none'}> ${x.confidence}`))
  console.log('  sources:', r.value.draft.brief.sources.length, '| research notes chars:', r.value.research.length)
  console.log('  to:', r.value.draft.to, '| subject:', r.value.draft.subject)
  console.log('\n' + r.value.draft.body)
}

if (which === 'chat') {
  const body = "Hi Priya,\n\nI'm Jordan from Hack the Harbour, a 48-hour student hackathon in Sydney.\n\nWould you be open to sponsoring our event?\n\nCheers,\nJordan"
  const r = await chat(key, { jobId: 'c1', company: 'Lumen Labs', campaignNotes: 'Asking for sponsorship.', voice, subject: 'Sponsoring Hack the Harbour?', body, history: [], message: 'make the ask more casual and specific: Gold tier, $5k' }, log)
  if (!r.ok) throw new Error(r.error)
  console.log('\n✓ chat:', r.value.text)
  console.log('  proposals:', r.value.proposals)
  assert.ok(r.value.proposals.length > 0, 'expected at least one propose_edit call')
  for (const p of r.value.proposals) assert.ok(body.includes(p.old), 'proposal quotes text that exists')
}

if (which === 'voice') {
  const r = await learnVoice(key, {
    voiceName: 'Jordan',
    notes: voice.notes,
    draft: 'Hi Priya,\n\nI hope this email finds you well! I am reaching out regarding an exciting opportunity.\n\nWould you be open to a quick call?\n\nKind regards,\nJordan',
    final: 'Hi Priya,\n\nQuick one from Hack the Harbour.\n\nKeen to jump on a 15-min call?\n\nCheers,\nJordan',
  })
  if (!r.ok) throw new Error(r.error)
  console.log('✓ voice:', r.value)
}
