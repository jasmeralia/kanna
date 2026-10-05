import { KANNA_CHAT_LINK_INSTRUCTIONS } from "../shared/chat-links"
import { buildKannaAttributionInstructions } from "./attribution"

const USER_QUESTION_INSTRUCTIONS = [
  "When a missing detail or decision blocks meaningful progress on the user's request, ask it with the AskUserQuestion tool so the user can answer through Kanna's structured question UI.",
  "Wait for the tool result before doing work that depends on the answer. Ask concise questions and include clear options when they help; leave room for a custom answer when appropriate.",
  "Use this flow in normal mode as well as plan mode. Keep optional, non-blocking questions in ordinary conversation, and answer the user's questions directly without invoking AskUserQuestion.",
].join(" ")

/**
 * Everything Kanna tells a harness that holds for the whole session. It goes
 * in the system prompt where the provider has an append hook (claude, pi,
 * codex), so it is cached there instead of being re-sent in every user turn.
 * Only notices that change turn to turn (skills, concurrent agents, steer)
 * belong on the user-text path. See attribution.ts for the per-provider hooks.
 */
export function buildKannaSystemInstructions(agentId: string): string {
  return [
    buildKannaAttributionInstructions(agentId),
    KANNA_CHAT_LINK_INSTRUCTIONS,
    USER_QUESTION_INSTRUCTIONS,
  ].join("\n\n")
}

/** Wrapped for the providers that have no system-prompt append hook (cursor, grok). */
export function buildKannaSystemMessage(agentId: string): string {
  return `<system-message>${buildKannaSystemInstructions(agentId)}</system-message>`
}
