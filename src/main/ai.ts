import type {
  ChatRequest,
  ChatResult,
  ClaudeProgress,
  DraftRequest,
  DraftResult,
  EventLookupRequest,
  EventLookupResult,
  ResearchRequest,
  ResearchResult,
  Result,
  VoiceLearnRequest,
  VoiceLearnResult,
  WritingRulesRequest,
} from '../shared/api'
import * as claude from './claude'
import * as opencode from './opencode'
import type { AiConfig } from './settings'

// Thin dispatcher: the renderer talks to one API, and this picks the backend
// from Settings. Both backends expose the same function signatures.

type Emit = (p: ClaudeProgress) => void

export function test(cfg: AiConfig): Promise<Result<{ via: 'api-key' | 'claude-login' | 'opencode' }>> {
  return cfg.provider === 'opencode' ? opencode.testOpencode(cfg.opencode) : claude.testClaude(cfg.anthropicKey)
}

export function researchAndDraft(cfg: AiConfig, req: ResearchRequest, emit: Emit): Promise<Result<ResearchResult>> {
  return cfg.provider === 'opencode' ? opencode.researchAndDraft(cfg.opencode, req, emit) : claude.researchAndDraft(cfg.anthropicKey, req, emit)
}

export function draft(cfg: AiConfig, req: DraftRequest): Promise<Result<DraftResult>> {
  return cfg.provider === 'opencode' ? opencode.draft(cfg.opencode, req) : claude.draft(cfg.anthropicKey, req)
}

export function chat(cfg: AiConfig, req: ChatRequest, emit: Emit): Promise<Result<ChatResult>> {
  return cfg.provider === 'opencode' ? opencode.chat(cfg.opencode, req, emit) : claude.chat(cfg.anthropicKey, req, emit)
}

export function learnVoice(cfg: AiConfig, req: VoiceLearnRequest): Promise<Result<VoiceLearnResult>> {
  return cfg.provider === 'opencode' ? opencode.learnVoice(cfg.opencode, req) : claude.learnVoice(cfg.anthropicKey, req)
}

export function lookupEvent(cfg: AiConfig, req: EventLookupRequest, emit: Emit): Promise<Result<EventLookupResult>> {
  return cfg.provider === 'opencode' ? opencode.lookupEvent(cfg.opencode, req, emit) : claude.lookupEvent(cfg.anthropicKey, req, emit)
}

export function writingRules(cfg: AiConfig, req: WritingRulesRequest): Promise<Result<{ notes: string[] }>> {
  return cfg.provider === 'opencode' ? opencode.writingRules(cfg.opencode, req) : claude.writingRules(cfg.anthropicKey, req)
}
