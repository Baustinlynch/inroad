import { createSdkMcpServer, query, tool, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { mkdirSync } from 'node:fs'
import { z } from 'zod'
import type {
  ChatRequest,
  ChatResult,
  ClaudeProgress,
  DraftRequest,
  DraftResult,
  ProposedEdit,
  ResearchRequest,
  ResearchResult,
  Result,
  VoiceInput,
  VoiceLearnRequest,
  VoiceLearnResult,
} from '../shared/api'

// Inroad drives Claude through the Claude Agent SDK (Claude Code as a library).
// With no API key set it uses this machine's Claude Code login; with a key it
// bills that key. 'opus' resolves to the newest Opus the account can use.
const MODEL = 'opus'

type Emit = (p: ClaudeProgress) => void

// Set once at startup (kept free of Electron imports so scripts can test this module).
const config = { workspace: '', clientApp: 'inroad' }
export function configureClaude(c: typeof config) {
  Object.assign(config, c)
  mkdirSync(c.workspace, { recursive: true })
}

// Each run gets an empty working folder and none of the user's own Claude Code
// settings, memory or skills, so it only ever has the tools listed here.
function baseOptions(apiKey: string | undefined, opts: Partial<Options>): Options {
  const cwd = config.workspace
  return {
    model: MODEL,
    cwd,
    settingSources: [],
    persistSession: false,
    // Anything not explicitly allowed is denied, never prompted for.
    permissionMode: 'dontAsk',
    env: {
      ...process.env,
      ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
      CLAUDE_AGENT_SDK_CLIENT_APP: config.clientApp,
    },
    ...opts,
  }
}

const AUTH_ERRORS: Record<string, string> = {
  authentication_failed: 'Claude isn’t signed in. Sign in to Claude Code on this computer, or add an API key in Settings.',
  oauth_org_not_allowed: 'Your Claude organisation doesn’t allow this. Add an API key in Settings instead.',
  billing_error: 'Claude reported a billing problem with this account.',
  rate_limit: 'You’ve hit Claude’s usage limit. Try again later.',
  model_not_found: 'Your Claude plan doesn’t include the model Inroad uses.',
}

// Runs one agent query to completion: forwards progress, returns the final
// result message, and turns SDK failures into messages a user can act on.
async function run(prompt: string, options: Options, onMessage?: (m: SDKMessage) => void) {
  let authError: string | undefined
  try {
    for await (const message of query({ prompt, options })) {
      onMessage?.(message)
      if (message.type === 'assistant' && message.error) authError ??= AUTH_ERRORS[message.error]
      if (message.type === 'result') {
        if (message.subtype !== 'success') throw new Error(authError ?? message.errors?.[0] ?? `Claude stopped early (${message.subtype}).`)
        return message
      }
    }
  } catch (err) {
    throw new Error(authError ?? (err instanceof Error ? err.message : String(err)))
  }
  throw new Error(authError ?? 'Claude ended without a result.')
}

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Structured output: the SDK makes Claude return JSON matching the schema; we
// still validate it before trusting it.
function structured<S extends z.ZodType>(schema: S): Pick<Options, 'outputFormat'> {
  // Claude Code's validator rejects the draft-2020-12 "$schema" tag zod adds.
  const { $schema: _drop, ...json } = z.toJSONSchema(schema) as Record<string, unknown>
  return { outputFormat: { type: 'json_schema', schema: json } }
}
function parseOutput<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('Claude’s answer didn’t come back in the expected format. Try again.')
  return parsed.data
}

function voiceSection(voice: VoiceInput) {
  const notes = voice.notes.length ? voice.notes.map((n) => `- ${n}`).join('\n') : '(no notes yet)'
  const examples = voice.examples
    .map((e, i) => `<example index="${i + 1}">\n<claude_draft>\n${e.draft}\n</claude_draft>\n<as_sent>\n${e.final}\n</as_sent>\n</example>`)
    .join('\n')
  return `<voice name="${voice.name}">\n<style_notes>\n${notes}\n</style_notes>\n${examples ? `<examples>\n${examples}\n</examples>\n` : ''}</voice>`
}

// ------------------------------------------------- research + first draft

const BriefSchema = z.object({
  summary: z.string().describe('One or two sentences on who they are and why they matter for this campaign.'),
  sections: z
    .array(z.object({ title: z.string(), items: z.array(z.string()) }))
    .describe('2–4 short sections whose headings suit the campaign, e.g. "Why they’d sponsor", "Past sponsorships", "Capacity & facilities".'),
  recipients: z.array(
    z.object({
      name: z.string().describe('Person’s name, or a description like "Partnerships inbox".'),
      role: z.string(),
      email: z.string().describe('Empty string if no address was found.'),
      confidence: z.enum(['high', 'medium', 'low']),
      source: z.string().describe('How this was found.'),
    }),
  ),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
})

const EmailFields = {
  to: z.string().describe('Email of the single best recipient, or empty string if none has an address.'),
  subject: z.string(),
  body: z
    .string()
    .describe('The email. Paragraphs separated by blank lines; sign-off lines separated by single newlines. **bold** sparingly; [text](url) for links.'),
}

const ResearchDraftSchema = z.object({
  research_notes: z.string().describe('Everything useful you found, each fact with its source URL. Kept so the email can be rewritten later without searching again.'),
  brief: BriefSchema,
  ...EmailFields,
})

const WRITING_RULES = `Write the email exactly as the user writes: follow their style notes, and treat the examples (Claude's draft vs. what they actually sent) as the strongest signal of their preferences. Use only facts from your research; never invent details, numbers, people or email addresses. Open with something specific to this organisation, make one clear ask drawn from the campaign notes, and keep it short enough to read on a phone. Address the best recipient by first name when you have one.`

const RESEARCH_SYSTEM = `You research an organisation and write the user a personalised first-contact email to it. The user's campaign notes say what they're reaching out about and what to look for.

Research with WebSearch and WebFetch: what the organisation does; why they'd be a good fit for what the campaign asks for; recent, specific things that would open the email well; and the best people or inboxes to contact. A handful of searches and a few page reads is usually enough. Only give an email address if it's published or very strongly evidenced, and say how you know.

${WRITING_RULES}`

export async function researchAndDraft(apiKey: string | undefined, req: ResearchRequest, emit: Emit): Promise<Result<ResearchResult>> {
  return guard(async () => {
    emit({ jobId: req.jobId, kind: 'step', text: `Researching ${req.company}` })
    const prompt = [
      `<campaign_notes>\n${req.campaignNotes || '(none)'}\n</campaign_notes>`,
      voiceSection(req.voice),
      `<sender>${req.senderName || 'the user'}</sender>`,
      `Organisation: ${req.company}${req.website ? ` (website: ${req.website})` : ''}`,
    ].join('\n\n')
    const result = await run(
      prompt,
      baseOptions(apiKey, {
        systemPrompt: RESEARCH_SYSTEM,
        tools: ['WebSearch', 'WebFetch'],
        allowedTools: ['WebSearch', 'WebFetch'],
        effort: 'high',
        maxTurns: 30,
        ...structured(ResearchDraftSchema),
      }),
      // Each search / page read becomes a progress line in the UI.
      (m) => {
        if (m.type !== 'assistant') return
        for (const block of m.message.content) {
          if (block.type !== 'tool_use') continue
          const input = block.input as { query?: string; url?: string }
          if (block.name === 'WebSearch' && input.query) emit({ jobId: req.jobId, kind: 'step', text: `Searched “${input.query}”` })
          if (block.name === 'WebFetch' && input.url) emit({ jobId: req.jobId, kind: 'step', text: `Read ${input.url.replace(/^https?:\/\//, '')}` })
        }
      },
    )
    emit({ jobId: req.jobId, kind: 'step', text: 'Writing draft' })
    const out = parseOutput(ResearchDraftSchema, result.structured_output)
    return { research: out.research_notes, draft: { brief: out.brief, to: out.to, subject: out.subject, body: out.body } }
  })
}

// ------------------------------------------- redraft from saved research

const DraftSchema = z.object({ brief: BriefSchema, ...EmailFields })

export async function draft(apiKey: string | undefined, req: DraftRequest): Promise<Result<DraftResult>> {
  return guard(async () => {
    const prompt = [
      `<campaign_notes>\n${req.campaignNotes || '(none)'}\n</campaign_notes>`,
      voiceSection(req.voice),
      `<sender>${req.senderName || 'the user'}</sender>`,
      `<organisation>${req.company}</organisation>`,
      `<research_notes>\n${req.research}\n</research_notes>`,
      req.previousDraft
        ? `Write a fresh version that takes a noticeably different angle from this previous draft:\n<previous_draft>\n${req.previousDraft}\n</previous_draft>`
        : 'Write the brief and the email.',
    ].join('\n\n')
    const result = await run(
      prompt,
      baseOptions(apiKey, {
        systemPrompt: `You write first-contact outreach emails for the user, from research that's already been done. Also turn the research into a brief for the user to skim, and pick the best recipient.\n\n${WRITING_RULES}`,
        tools: [],
        effort: 'high',
        maxTurns: 4,
        ...structured(DraftSchema),
      }),
    )
    return parseOutput(DraftSchema, result.structured_output)
  })
}

// -------------------------------------------------------------------- chat

const CHAT_SYSTEM = `You help the user refine one outreach email. You can see the email, the research brief, the campaign notes and the user's voice.

To change the email, call the propose_edit tool: quote the exact text to replace (copied verbatim from the email, long enough to be unique) and give the replacement. Each call becomes a suggestion the user can accept or reject, so prefer a few focused edits over rewriting everything, and stay in the user's voice. Use WebSearch only if the user asks for something the brief doesn't cover. Keep your messages short.`

export async function chat(apiKey: string | undefined, req: ChatRequest, emit: Emit): Promise<Result<ChatResult>> {
  return guard(async () => {
    const proposals: ProposedEdit[] = []
    // The tool doesn't edit anything itself: it records a suggestion for the
    // user to accept or reject, after checking the quoted text really exists.
    const proposeEdit = tool(
      'propose_edit',
      'Suggest replacing a passage of the email. The user sees it as an accept/reject card.',
      {
        old: z.string().min(1).describe('Exact text currently in the email, copied verbatim.'),
        new: z.string().describe('Replacement text.'),
        reason: z.string().describe('A few words on why, shown to the user.'),
      },
      async (edit) => {
        if (!req.body.includes(edit.old) && !req.subject.includes(edit.old))
          return { content: [{ type: 'text', text: 'That text isn’t in the email. Quote it exactly as it appears.' }], isError: true }
        proposals.push(edit)
        return { content: [{ type: 'text', text: 'Shown to the user as a suggestion.' }] }
      },
      { annotations: { readOnlyHint: true }, alwaysLoad: true },
    )
    const editor = createSdkMcpServer({ name: 'email', version: '1.0.0', tools: [proposeEdit] })

    const context = [
      `<campaign_notes>\n${req.campaignNotes || '(none)'}\n</campaign_notes>`,
      voiceSection(req.voice),
      req.brief ? `<brief organisation="${req.company}">\n${JSON.stringify(req.brief)}\n</brief>` : '',
      `<email>\nSubject: ${req.subject}\n\n${req.body}\n</email>`,
    ]
      .filter(Boolean)
      .join('\n\n')
    // Earlier turns are replayed as a transcript: the user has already acted on
    // those suggestions, and the email above is the current version.
    const transcript = req.history.length
      ? `<conversation_so_far>\n${req.history.map((m) => `${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n\n')}\n</conversation_so_far>\n\n`
      : ''

    let text = ''
    const result = await run(
      `${context}\n\n${transcript}User: ${req.message}`,
      baseOptions(apiKey, {
        systemPrompt: CHAT_SYSTEM,
        tools: ['WebSearch'],
        mcpServers: { email: editor },
        allowedTools: ['WebSearch', 'mcp__email__propose_edit'],
        effort: 'medium',
        maxTurns: 12,
        includePartialMessages: true,
      }),
      (m) => {
        // Stream Claude's reply text into the chat as it's written.
        if (m.type === 'stream_event' && m.event.type === 'content_block_delta' && m.event.delta.type === 'text_delta') {
          text += m.event.delta.text
          emit({ jobId: req.jobId, kind: 'delta', text: m.event.delta.text })
        }
      },
    )
    return { text: (result.result || text).trim(), proposals }
  })
}

// ------------------------------------------------------------ voice learning

const VoiceSchema = z.object({
  add: z.array(z.string()).describe('New style notes: short, imperative, general. At most 3.'),
  remove: z.array(z.string()).describe('Existing notes that the edits clearly contradict, quoted exactly.'),
})

export async function learnVoice(apiKey: string | undefined, req: VoiceLearnRequest): Promise<Result<VoiceLearnResult>> {
  return guard(async () => {
    const result = await run(
      `<existing_notes voice="${req.voiceName}">\n${req.notes.map((n) => `- ${n}`).join('\n') || '(none)'}\n</existing_notes>\n\n<claude_draft>\n${req.draft}\n</claude_draft>\n\n<as_saved>\n${req.final}\n</as_saved>`,
      baseOptions(apiKey, {
        systemPrompt: `You maintain a short style guide describing how one person writes outreach emails. You're given Claude's draft and the version they actually saved.\n\nExtract only general, reusable preferences: tone, length, structure, openers and sign-offs, words or phrases they add or avoid. Ignore edits about this particular organisation's facts. Don't repeat anything the existing notes already say. If nothing general changed, return empty lists.`,
        tools: [],
        effort: 'low',
        maxTurns: 4,
        ...structured(VoiceSchema),
      }),
    )
    const out = parseOutput(VoiceSchema, result.structured_output)
    // Only remove notes that really exist.
    return { add: out.add.slice(0, 3), remove: out.remove.filter((r) => req.notes.includes(r)) }
  })
}

// ------------------------------------------------------------- connection

// A tiny request to check Claude is reachable with the current sign-in or key.
export async function testClaude(apiKey: string | undefined): Promise<Result<{ via: 'api-key' | 'claude-login' }>> {
  return guard(async () => {
    await run('Reply with just: OK', baseOptions(apiKey, { tools: [], effort: 'low', maxTurns: 1 }))
    return { via: apiKey ? ('api-key' as const) : ('claude-login' as const) }
  })
}
