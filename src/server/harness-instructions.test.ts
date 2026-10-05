import { describe, expect, test } from "bun:test"
import { KANNA_CHAT_LINK_INSTRUCTIONS } from "../shared/chat-links"
import { buildKannaAgentTrailer } from "./attribution"
import { buildKannaSystemInstructions, buildKannaSystemMessage } from "./harness-instructions"

const AGENT_ID = "claude/claude-opus-5"

describe("buildKannaSystemInstructions", () => {
  test("carries the attribution and the chat-link rules", () => {
    const instructions = buildKannaSystemInstructions(AGENT_ID)
    expect(instructions).toContain(buildKannaAgentTrailer(AGENT_ID))
    expect(instructions).toContain(KANNA_CHAT_LINK_INSTRUCTIONS)
  })

  test("routes blocking clarifications through the structured question flow in every mode", () => {
    const instructions = buildKannaSystemInstructions(AGENT_ID)
    expect(instructions).toContain("blocks meaningful progress")
    expect(instructions).toContain("AskUserQuestion tool")
    expect(instructions).toContain("Wait for the tool result")
    expect(instructions).toContain("normal mode as well as plan mode")
    expect(instructions).toContain("non-blocking questions in ordinary conversation")
  })
})

describe("buildKannaSystemMessage", () => {
  test("wraps the instructions for the no-append-hook providers", () => {
    const message = buildKannaSystemMessage(AGENT_ID)
    expect(message.startsWith("<system-message>")).toBe(true)
    expect(message.endsWith("</system-message>")).toBe(true)
    expect(message).toContain(buildKannaSystemInstructions(AGENT_ID))
  })
})
