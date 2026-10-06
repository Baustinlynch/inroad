// Integration test for src/main/mail.ts against a local IMAP server:
//   docker run -d --rm --name inroad-greenmail -p 3143:3143 \
//     -e GREENMAIL_OPTS='-Dgreenmail.setup.test.imap -Dgreenmail.auth.disabled -Dgreenmail.hostname=0.0.0.0' \
//     greenmail/standalone
//   npx tsx scripts/test-mail.ts
import assert from 'node:assert/strict'
import { ImapFlow } from 'imapflow'
import { deleteDraft, saveDraft, testMail, type MailCreds } from '../src/main/mail'

const creds: MailCreds = {
  mail: { host: '127.0.0.1', port: 3143, secure: false, user: 'jordan@test.local', fromName: 'Jordan Ellis', fromEmail: 'jordan@test.local' },
  password: 'anything',
}

async function client() {
  const c = new ImapFlow({ host: '127.0.0.1', port: 3143, secure: false, auth: { user: creds.mail.user, pass: 'x' }, logger: false })
  await c.connect()
  return c
}

async function countDrafts() {
  const c = await client()
  try {
    return (await c.status('Drafts', { messages: true })).messages
  } finally {
    await c.logout()
  }
}

// GreenMail starts with only INBOX; a real provider already has Drafts.
const setup = await client()
const boxes = await setup.list()
if (!boxes.some((b) => b.name === 'Drafts')) await setup.mailboxCreate('Drafts')
await setup.logout()

const t = await testMail(creds)
assert.deepEqual(t, { ok: true, value: { draftsMailbox: 'Drafts' } })
console.log('✓ test connection finds Drafts')

const before = await countDrafts()
const saved = await saveDraft(creds, { to: ['priya@lumenlabs.example'], subject: 'Hello', html: '<p>Hi <strong>Priya</strong></p>', text: 'Hi Priya' })
assert.ok(saved.ok, !saved.ok ? saved.error : '')
assert.equal(await countDrafts(), before! + 1)
console.log('✓ saveDraft appends to Drafts', saved.value)

// The saved message is flagged as a draft and has both HTML and text parts.
const c = await client()
const lock = await c.getMailboxLock('Drafts')
const uids = await c.search({ header: { 'message-id': saved.value.messageId } }, { uid: true })
assert.ok(uids && uids.length === 1)
const msg = await c.fetchOne(String(uids[0]), { flags: true, source: true, envelope: true }, { uid: true })
assert.ok(msg && msg.flags?.has('\\Draft'))
const src = msg.source!.toString()
assert.match(src, /text\/html/)
assert.match(src, /text\/plain/)
assert.equal(msg.envelope?.subject, 'Hello')
lock.release()
await c.logout()
console.log('✓ draft has \\Draft flag, HTML + text parts, and subject')

const del = await deleteDraft(creds, saved.value)
assert.deepEqual(del, { ok: true, value: null })
assert.equal(await countDrafts(), before)
console.log('✓ deleteDraft removes it again')

const bad = await testMail({ ...creds, mail: { ...creds.mail, port: 1 } })
assert.equal(bad.ok, false)
console.log('✓ unreachable server gives a friendly error:', !bad.ok && bad.error)
