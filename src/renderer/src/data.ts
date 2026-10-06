import type { DraftRef } from '../../shared/api'
import { textToHtml } from './richtext'

// All mock data. Companies, people and domains are fictional (.example TLD).

export type Status = 'queued' | 'researching' | 'drafted' | 'edited' | 'saved' | 'failed'

export interface Recipient {
  name: string
  role: string
  email: string
  confidence: 'high' | 'medium' | 'low'
  source: string
}

export interface Brief {
  summary: string
  // Headings are chosen by the research agent based on the campaign notes,
  // e.g. "Past sponsorships" for sponsors, "Capacity & facilities" for venues.
  sections: { title: string; items: string[] }[]
  recipients: Recipient[]
  sources: { title: string; url: string }[]
}

export interface Proposal {
  id: string
  old: string
  new: string
  reason: string
  state: 'pending' | 'accepted' | 'rejected'
}

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  text: string
  proposals?: Proposal[]
}

export interface Version {
  id: string
  label: string
  by: 'claude' | 'you'
  at: number
  html: string
  deletedAt?: number
}

// One conversation with Claude about an email. An email can have several.
export interface ChatThread {
  id: string
  title: string
  createdAt: number
  messages: ChatMsg[]
  deletedAt?: number
}

export interface Prospect {
  id: string
  campaignId: string
  company: string
  domain: string
  status: Status
  progress: string[]
  error?: string
  brief?: Brief
  subject: string
  originalBody: string
  body: string
  to: string[]
  chats: ChatThread[]
  activeChatId?: string
  // Every draft Claude wrote, your edits before a regenerate, and each save.
  versions: Version[]
  // Soft delete: set when moved to Deleted items, cleared on restore.
  deletedAt?: number
  // The copy in the mailbox's Drafts folder, once saved there.
  draftRef?: DraftRef
}

export interface Campaign {
  id: string
  name: string
  // Freeform: what you're asking for, context, what to research, tone. Fed to
  // both the research agent and the drafting prompt for every email.
  notes: string
  attachments: string[]
  // Which voice profile drafts in this campaign are written in.
  voiceId: string
  deletedAt?: number
}

export const initialCampaigns: Campaign[] = [
  {
    id: 'sponsors',
    name: 'Sponsors',
    attachments: ['HackTheHarbour-2026-Prospectus.pdf'],
    voiceId: 'jordan',
    notes: `Hack the Harbour 2026 — 48-hour student hackathon, Sydney, 14–16 November. ~400 uni students (60% CS/SE, 25% design). Third year running; last year 380 hackers, 92 projects, 14 sponsors.

Asking for sponsorship. Tiers: Platinum $10k · Gold $5k · Silver $2.5k · API credits partner. Default ask is Gold with a dedicated prize track; for dev-tool companies with a free tier, API credits + a workshop is a fine fallback.

When researching, look for: developer products a team could use in 48 hours, grad/intern hiring in Sydney, previous hackathon or student event sponsorships, devrel or community people to contact.

Mention the prospectus is attached. Keep it short — they get a lot of these.`,
  },
  {
    id: 'venues',
    name: 'Venues',
    attachments: [],
    voiceId: 'formal',
    notes: `Looking for a venue for Hack the Harbour 2026, 14–16 November (Fri 6pm → Sun 6pm).

Need: room for ~400, a main stage space for opening/closing, 4+ breakout rooms for workshops, overnight access (hackers stay through the night), wifi that handles 400+ devices, power at every table, somewhere for catering.

We're a student-run non-profit, so ideally free or heavily discounted. Can offer: naming/branding on everything, a speaking slot at the opening ceremony, photos and video for their channels.

When researching, find: capacity and room layout, whether they've hosted hackathons or overnight events, community/education access programmes, who handles event bookings.

Venues care that we're responsible — mention insurance, overnight security and a cleanup crew.`,
  },
]
export const identity = 'Jordan Ellis <jordan@harbourhackers.example>'

export interface Voice {
  id: string
  name: string
  description: string
  notes: { text: string; fresh: boolean; deletedAt?: number }[]
  deletedAt?: number
}

export const initialVoices: Voice[] = [
  {
    id: 'jordan',
    name: 'Jordan',
    description: 'Default · learned from 6 edited emails',
    notes: [
      { text: 'Short paragraphs, 2–3 sentences max. Whole email under ~170 words.', fresh: false },
      { text: 'Opens with who I am in one line; no "I hope this email finds you well".', fresh: false },
      { text: 'Australian spelling (organise, programme only for formal names).', fresh: false },
      { text: 'Specific, concrete hook about the company in paragraph two — never generic praise.', fresh: false },
      { text: 'Casual asks: "Keen to jump on a 15-min call?" rather than "Would you be open to…".', fresh: true },
      { text: 'Avoids "excited", "thrilled", "leverage", "synergy".', fresh: true },
      { text: 'Signs off "Cheers," followed by first name and event name on separate lines.', fresh: false },
    ],
  },
  {
    id: 'formal',
    name: 'Formal / corporate',
    description: 'For banks, government, large enterprises',
    notes: [
      { text: 'Full sentences, no contractions.', fresh: false },
      { text: 'Lead with audience numbers and outcomes before the ask.', fresh: false },
      { text: 'Signs off "Kind regards," with full name and title.', fresh: false },
    ],
  },
]

const lumenOriginal = `Hi Priya,

I hope this email finds you well! I'm Jordan, one of the organisers of Hack the Harbour — a 48-hour student hackathon in Sydney running 14–16 November, with around 400 hackers from across NSW.

I noticed Lumen Labs launched its realtime vision API earlier this year, and I'm really excited about how well it fits what our hackers build: accessibility tools, campus safety apps and AR prototypes. We'd love to have Lumen as a sponsor and run a "Best use of Lumen Vision" prize track.

Our **Gold tier ($5k)** includes a dedicated prize track, a workshop slot on Saturday morning, and access to our opt-in resume book. I've attached our prospectus with the full breakdown.

Would you be open to a quick 15-minute call next week to discuss?

Cheers,
Jordan
Hack the Harbour`

const lumenEdited = `Hi Priya,

I'm Jordan, one of the organisers of Hack the Harbour — a 48-hour student hackathon in Sydney running 14–16 November, with around 400 hackers from across NSW.

Lumen's realtime vision API fits a lot of what our hackers build: accessibility tools, campus safety apps and AR prototypes. We'd love to have Lumen as a sponsor and run a "Best use of Lumen Vision" prize track.

Our **Gold tier ($5k)** includes a dedicated prize track, a workshop slot on Saturday morning, and access to our opt-in resume book. Prospectus attached with the full breakdown.

Keen to jump on a 15-min call next week?

Cheers,
Jordan
Hack the Harbour`

function draft(first: string, company: string, hook: string, ask: string) {
  return `Hi ${first},

I'm Jordan, one of the organisers of Hack the Harbour — a 48-hour student hackathon in Sydney running 14–16 November, with around 400 hackers from across NSW.

${hook}

${ask} Prospectus attached with the full breakdown.

Keen to jump on a 15-min call next week?

Cheers,
Jordan
Hack the Harbour`
}

const northwindBody = draft(
  'Dana',
  'Northwind Cloud',
  "Northwind's new free tier for edge functions is exactly what student teams reach for at 2am when they need a backend fast — last year roughly a third of our projects deployed to some kind of serverless platform.",
  "We'd love Northwind as an API credits partner: credits for every hacker, plus a \"Best deployed project\" prize.",
)

const parcelBody = draft(
  'Theo',
  'Parcelbase',
  "Parcelbase's logistics API has one of the cleanest sandbox environments we've seen, which matters a lot when teams have 48 hours to go from idea to demo.",
  'Our Silver tier ($2.5k) would get Parcelbase a sponsor booth, a logo on all hacker comms, and judging on a "Best supply chain hack" prize.',
)

const kestrelBody = draft(
  'there',
  'Kestrel Payments',
  "With Kestrel opening its Sydney engineering office this year, Hack the Harbour is a good way to get in front of strong grad and intern candidates early.",
  'Our Gold tier ($5k) includes a dedicated prize track, a workshop slot and access to our opt-in resume book.',
)

const harboursideBody = `Hi Mei,

I'm Jordan, one of the organisers of Hack the Harbour — a student-run, 48-hour hackathon in Sydney. We're looking for a home for this year's event, 14–16 November, and the Hub looks like a great fit.

Your main hall and six breakout rooms map almost exactly onto what we need: an opening and closing stage for ~400 people, plus workshop rooms through the weekend. And since you hosted GovHack Sydney last year, you'll know overnight events well.

As a non-profit, we'd love to apply through your Community Access Program. In return we can offer naming on all event materials, a speaking slot at the opening ceremony, and photos and video for your channels. We'll bring full public liability insurance, overnight security and a cleanup crew. Here's [last year's recap](https://harbourhackers.example/2025) to give you a feel for it.

Keen to jump on a quick call, or come by for a walkthrough?

Cheers,
Jordan
Hack the Harbour`

// Seed data is written with a single `chat`; it becomes the first thread.
type RawProspect = Omit<Prospect, 'versions' | 'chats'> & { chat: ChatMsg[] }

const rawProspects: RawProspect[] = [
  {
    id: 'lumen',
    campaignId: 'sponsors',
    company: 'Lumen Labs',
    domain: 'lumenlabs.example',
    status: 'edited',
    progress: [],
    subject: 'Lumen Labs × Hack the Harbour — vision API prize track?',
    originalBody: lumenOriginal,
    body: lumenEdited,
    to: ['priya@lumenlabs.example'],
    brief: {
      summary:
        'Series A computer vision startup (~60 staff) selling realtime object detection and OCR APIs. Developer-first: generous free tier, public docs, active Discord community.',
      sections: [
        { title: "Why they'd sponsor", items: [
        'Developer-facing API with a free tier — easy for teams to adopt inside 48 hours',
        'Hiring 3 graduate engineers in Sydney (careers page, posted Sept 2026)',
        'DevRel team of 4 already runs online workshops — could run a Saturday session',
      ] },
        { title: 'Past sponsorships', items: ['Prize track sponsor at CampusHack Melbourne 2025', 'API credits partner for BuildWeek Online (Mar 2026)'] },
      ],
      recipients: [
        { name: 'Priya Raman', role: 'Developer Relations Lead', email: 'priya@lumenlabs.example', confidence: 'high', source: 'Listed on lumenlabs.example/community' },
        { name: 'Partnerships inbox', role: 'Generic', email: 'partnerships@lumenlabs.example', confidence: 'high', source: 'Site footer' },
        { name: 'Marcus Lee', role: 'Head of Talent', email: 'marcus.lee@lumenlabs.example', confidence: 'low', source: 'Guessed from first.last pattern' },
      ],
      sources: [
        { title: 'Lumen Labs — Developers', url: 'https://lumenlabs.example/developers' },
        { title: 'Introducing Lumen Vision Realtime', url: 'https://lumenlabs.example/blog/realtime' },
        { title: 'Careers — Graduate Engineer, Sydney', url: 'https://lumenlabs.example/careers' },
        { title: 'CampusHack Melbourne 2025 sponsors', url: 'https://campushack.example/2025' },
      ],
    },
    chat: [
      { id: 'm1', role: 'user', text: 'make it mention their hiring, that seems like the real angle' },
      {
        id: 'm2',
        role: 'assistant',
        text: "Good call — the brief shows 3 open grad roles in Sydney, which is a stronger hook than the API alone. Two edits:",
        proposals: [
          {
            id: 'p1',
            old: 'We\'d love to have Lumen as a sponsor and run a "Best use of Lumen Vision" prize track.',
            new: 'And with 3 grad roles open in Sydney, it\'s a good chance to meet strong junior engineers early. We\'d love to have Lumen as a sponsor and run a "Best use of Lumen Vision" prize track.',
            reason: 'Ties the pitch to their hiring',
            state: 'pending',
          },
          {
            id: 'p2',
            old: 'and access to our opt-in resume book.',
            new: 'and access to our opt-in resume book (last year: 210 students opted in).',
            reason: 'Makes the recruiting value concrete',
            state: 'pending',
          },
        ],
      },
    ],
  },
  {
    id: 'parcel',
    campaignId: 'sponsors',
    company: 'Parcelbase',
    domain: 'parcelbase.example',
    status: 'drafted',
    progress: [],
    subject: 'Parcelbase at Hack the Harbour?',
    originalBody: parcelBody,
    body: parcelBody,
    to: [],
    brief: {
      summary: 'Logistics API company offering shipping rates, label generation and tracking via a single REST API. ~120 staff, HQ in Melbourne.',
      sections: [
        { title: "Why they'd sponsor", items: ['Free sandbox with realistic test data', 'Blog shows interest in student developers (2 posts in 2026)'] },
        { title: 'Past sponsorships', items: ['No previous hackathon sponsorships found'] },
      ],
      recipients: [
        { name: 'Theo Nguyen', role: 'Developer Advocate', email: 'theo@parcelbase.example', confidence: 'medium', source: 'Conference speaker bio + email pattern' },
        { name: 'Hello inbox', role: 'Generic', email: 'hello@parcelbase.example', confidence: 'high', source: 'Contact page' },
      ],
      sources: [
        { title: 'Parcelbase API docs', url: 'https://parcelbase.example/docs' },
        { title: 'Theo Nguyen — DevOps Days speaker', url: 'https://devopsdays.example/speakers/theo' },
      ],
    },
    chat: [],
  },
  {
    id: 'kestrel',
    campaignId: 'sponsors',
    company: 'Kestrel Payments',
    domain: 'kestrel.example',
    status: 'drafted',
    progress: [],
    subject: 'Meeting Sydney grads at Hack the Harbour',
    originalBody: kestrelBody,
    body: kestrelBody,
    to: [],
    brief: {
      summary: 'Payments infrastructure company (UK-based) that opened a Sydney engineering office in 2026. Hiring heavily for backend roles.',
      sections: [
        { title: "Why they'd sponsor", items: ['Sydney office is new — brand awareness among local students is low', '8 open engineering roles in Sydney'] },
        { title: 'Past sponsorships', items: ['Title sponsor of HackLondon 2024', 'Mentors at Junction 2025'] },
      ],
      recipients: [
        { name: 'Emerging talent team', role: 'Generic', email: 'earlycareers@kestrel.example', confidence: 'high', source: 'Careers page' },
        { name: 'Aisha Patel', role: 'Engineering Manager, Sydney', email: '', confidence: 'low', source: 'LinkedIn — no public email' },
      ],
      sources: [{ title: 'Kestrel opens Sydney office', url: 'https://kestrel.example/news/sydney' }],
    },
    chat: [],
  },
  {
    id: 'northwind',
    campaignId: 'sponsors',
    company: 'Northwind Cloud',
    domain: 'northwind.example',
    status: 'saved',
    progress: [],
    subject: 'Northwind credits for 400 student hackers',
    originalBody: northwindBody,
    body: northwindBody,
    to: ['dana@northwind.example'],
    brief: {
      summary: 'Cloud platform focused on edge functions and managed Postgres. Launched a free tier in July 2026.',
      sections: [
        { title: "Why they'd sponsor", items: ['New free tier', 'Startup credits programme already exists'] },
        { title: 'Past sponsorships', items: ['API credits at three Australian hackathons in 2025'] },
      ],
      recipients: [{ name: 'Dana Kim', role: 'Community Manager, APAC', email: 'dana@northwind.example', confidence: 'high', source: 'Blog author page' }],
      sources: [{ title: 'Northwind free tier launch', url: 'https://northwind.example/blog/free-tier' }],
    },
    chat: [],
  },
  {
    id: 'atlas',
    campaignId: 'sponsors',
    company: 'Atlas Maps',
    domain: 'atlasmaps.example',
    status: 'researching',
    progress: ['Searched "Atlas Maps developer platform"', 'Read atlasmaps.example/developers', 'Searched "Atlas Maps hackathon sponsor"'],
    subject: '',
    originalBody: '',
    body: '',
    to: [],
    chat: [],
  },
  {
    id: 'orbital',
    campaignId: 'sponsors',
    company: 'Orbital DB',
    domain: 'orbitaldb.example',
    status: 'researching',
    progress: ['Searched "Orbital DB"'],
    subject: '',
    originalBody: '',
    body: '',
    to: [],
    chat: [],
  },
  { id: 'fernwood', campaignId: 'sponsors', company: 'Fernwood Robotics', domain: '', status: 'queued', progress: [], subject: '', originalBody: '', body: '', to: [], chat: [] },
  { id: 'tidepool', campaignId: 'sponsors', company: 'Tidepool AI', domain: '', status: 'queued', progress: [], subject: '', originalBody: '', body: '', to: [], chat: [] },
  {
    id: 'quill',
    campaignId: 'sponsors',
    company: 'Quillstack',
    domain: '',
    status: 'failed',
    progress: ['Searched "Quillstack"', 'Searched "Quillstack company"'],
    error: 'Found several unrelated companies called Quillstack. Add a website so research can pick the right one.',
    subject: '',
    originalBody: '',
    body: '',
    to: [],
    chat: [],
  },
  {
    id: 'harbourside',
    campaignId: 'venues',
    company: 'Harbourside Innovation Hub',
    domain: 'harbourside.example',
    status: 'drafted',
    progress: [],
    subject: 'Hosting Hack the Harbour at the Hub (14–16 Nov)?',
    originalBody: harboursideBody,
    body: harboursideBody,
    to: [],
    brief: {
      summary:
        'Council-backed innovation centre in Pyrmont housing ~80 startups. Runs a public events programme and rents its main hall commercially on weekends.',
      sections: [
        {
          title: 'Capacity & facilities',
          items: [
            'Main hall: 450 theatre-style, ~320 at tables',
            '6 breakout rooms (20–40 each)',
            'Wifi upgraded in 2025 (annual report)',
            '24/7 swipe access for residents — overnight may be possible',
          ],
        },
        { title: 'Events hosted', items: ['GovHack Sydney 2025 (overnight)', 'Monthly "Founders Friday" community nights'] },
        { title: 'Community access', items: ['Community Access Program: free space for non-profits, up to 4 events a year'] },
      ],
      recipients: [
        { name: 'Mei Chen', role: 'Community Programs Manager', email: 'mei.chen@harbourside.example', confidence: 'medium', source: 'Team page + first.last pattern' },
        { name: 'Events team', role: 'Generic', email: 'events@harbourside.example', confidence: 'high', source: 'Venue hire page' },
      ],
      sources: [
        { title: 'Venue hire — Harbourside Innovation Hub', url: 'https://harbourside.example/venue-hire' },
        { title: 'Community Access Program', url: 'https://harbourside.example/community' },
        { title: 'GovHack Sydney 2025 recap', url: 'https://govhack.example/2025/sydney' },
      ],
    },
    chat: [],
  },
  {
    id: 'wattle',
    campaignId: 'venues',
    company: 'Wattle Street Library',
    domain: 'wattlestlibrary.example',
    status: 'researching',
    progress: ['Searched "Wattle Street Library"', 'Read wattlestlibrary.example/spaces'],
    subject: '',
    originalBody: '',
    body: '',
    to: [],
    chat: [],
  },
  { id: 'quayline', campaignId: 'venues', company: 'Quayline Events Centre', domain: '', status: 'queued', progress: [], subject: '', originalBody: '', body: '', to: [], chat: [] },
]

const now = Date.now()
const minutes = (m: number) => now - m * 60_000

// A second conversation on Lumen, to show switching between chats.
const lumenShorterChat: ChatMsg[] = [
  { id: 'm3', role: 'user', text: 'can you tighten the second paragraph?' },
  {
    id: 'm4',
    role: 'assistant',
    text: 'Here’s a shorter version that keeps the examples:',
    proposals: [
      {
        id: 'p3',
        old: "Lumen's realtime vision API fits a lot of what our hackers build: accessibility tools, campus safety apps and AR prototypes.",
        new: "Lumen's realtime vision API suits what our hackers build: accessibility tools, safety apps and AR.",
        reason: 'Shorter, same examples',
        state: 'pending',
      },
    ],
  },
]

export const initialProspects: Prospect[] = rawProspects.map(({ chat, ...p }) => {
  const originalBody = textToHtml(p.originalBody)
  const body = textToHtml(p.body)
  const versions: Version[] = p.originalBody
    ? [{ id: `${p.id}-v1`, label: 'Claude’s draft', by: 'claude', at: minutes(p.id === 'northwind' ? 300 : 95), html: originalBody }]
    : []
  if (p.status === 'saved') versions.push({ id: `${p.id}-v2`, label: 'Saved to Drafts', by: 'you', at: minutes(240), html: body })
  const chats: ChatThread[] = chat.length ? [{ id: `${p.id}-c1`, title: 'Mention their hiring', createdAt: minutes(40), messages: chat }] : []
  if (p.id === 'lumen') chats.push({ id: 'lumen-c2', title: 'Tighten paragraph two', createdAt: minutes(20), messages: lumenShorterChat })
  return { ...p, originalBody, body, versions, chats, activeChatId: chats[0]?.id }
})

// Mock "regenerate": swaps the intro and the ask for alternates so you can see
// a new version land in history.
const altIntros = [
  "I run Hack the Harbour with a small student team — 48 hours, ~400 hackers, 14–16 November in Sydney.",
  "Quick intro: I'm Jordan, and I help organise Hack the Harbour, Sydney's 48-hour student hackathon (14–16 Nov, ~400 hackers).",
  "I'm Jordan from Hack the Harbour. We're a student-run, 48-hour hackathon in Sydney, back for a third year on 14–16 November.",
]
const altAsks = ['Would a quick chat next week work?', 'Any chance you’re free for 15 minutes next week?', 'Happy to send more detail, or jump on a call — whatever’s easier.']

export function mockRegenerate(html: string, n: number): string {
  const paras = html.split('</p>').filter(Boolean).map((x) => x + '</p>')
  const signOff = paras.findIndex((x) => x.startsWith('<p>Cheers'))
  if (paras.length > 2) paras[1] = `<p>${altIntros[n % altIntros.length]}</p>`
  if (signOff > 1) paras[signOff - 1] = `<p>${altAsks[n % altAsks.length]}</p>`
  return paras.join('')
}

// Generic on purpose: what research looks for comes from the campaign notes.
const researchSteps = [
  (c: string) => `Searched "${c}"`,
  (c: string) => `Read ${slug(c)}.example`,
  (c: string) => `Searched "${c} events"`,
  (c: string) => `Read ${slug(c)}.example/about`,
  () => `Looking for contacts`,
  () => `Writing draft`,
]
export const RESEARCH_STEPS = researchSteps.length

export function nextStep(company: string, i: number) {
  return researchSteps[i](company)
}

function slug(c: string) {
  return c.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Fills in a finished prospect once the fake research run completes.
export function fakeResult(p: Prospect): Prospect {
  const domain = p.domain || `${slug(p.company)}.example`
  const body = `Hi there,

I'm Jordan, one of the organisers of Hack the Harbour — a 48-hour student hackathon in Sydney running 14–16 November.

[Personalised paragraph for ${p.company}, written from the research brief and this campaign's notes.]

[The ask, from the campaign notes.]

Keen to jump on a quick call next week?

Cheers,
Jordan
Hack the Harbour`
  const html = textToHtml(body)
  return {
    ...p,
    domain,
    status: 'drafted',
    versions: [{ id: crypto.randomUUID(), label: 'Claude’s draft', by: 'claude', at: Date.now(), html }],
    subject: `${p.company} × Hack the Harbour`,
    originalBody: html,
    body: html,
    brief: {
      summary: `Mock brief for ${p.company}. In the real app the research agent writes this, picks section headings to suit the campaign, and links every claim to a source.`,
      sections: [{ title: 'Why they’re a fit', items: ['Placeholder'] }],
      recipients: [{ name: 'General inbox', role: 'Generic', email: `hello@${domain}`, confidence: 'medium', source: 'Common pattern — not verified' }],
      sources: [{ title: `${p.company} homepage`, url: `https://${domain}` }],
    },
  }
}
