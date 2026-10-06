import { createContext, useContext, type ReactNode } from 'react'
import type { AiProvider } from '../../shared/api'

// The display name of the AI backend, so copy follows Settings → AI agent.
export function agentName(provider: AiProvider | undefined): string {
  return provider === 'opencode' ? 'opencode' : 'Claude'
}

const AgentContext = createContext<string>('Claude')

export function AgentProvider({ provider, children }: { provider: AiProvider | undefined; children: ReactNode }) {
  return <AgentContext.Provider value={agentName(provider)}>{children}</AgentContext.Provider>
}

export function useAgentName(): string {
  return useContext(AgentContext)
}
