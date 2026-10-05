import { describe, expect, test } from "bun:test"
import type { TranscriptEntry } from "../shared/types"
import {
  ASK_ALREADY_PARKED_TEXT,
  ASK_PARKED_RESULT_TEXT,
  createAskUserQuestionTool,
} from "./kanna-ask-tools"
import { KannaToolRuntime } from "./kanna-tools"

const questions = [{
  id: "language",
  question: "Which language?",
  options: [{ label: "TypeScript" }, { label: "Python" }],
}]

function setup(parkInput?: (toolUseId: string) => boolean) {
  const entries: TranscriptEntry[] = []
  const requests: Array<{ signal: AbortSignal; resolve: (value: unknown) => void }> = []
  const runtime = new KannaToolRuntime({
    chatId: "chat-1",
    cwd: "/project",
    emit: async (entry) => { entries.push(entry) },
    requestInput: async (_request, signal) => new Promise((resolve) => {
      requests.push({ signal, resolve })
      signal.addEventListener("abort", () => resolve({ discarded: true, answers: {} }), { once: true })
    }),
    parkInput,
  }, [createAskUserQuestionTool(20)])
  return { runtime, entries, requests }
}

async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await Bun.sleep(2)
  }
  throw new Error("Condition did not become true")
}

describe("Cursor ask_user_question tool", () => {
  test("returns answers inline when answered within the budget", async () => {
    const { runtime, entries, requests } = setup(() => { throw new Error("must not park") })
    const call = runtime.execute("ask_user_question", { questions })
    await until(() => requests.length === 1)
    requests[0]!.resolve({ answers: { language: ["TypeScript"] } })
    expect(await call).toMatchObject({
      content: [{ text: expect.stringContaining("TypeScript") }],
      structuredContent: { answers: { language: ["TypeScript"] } },
    })
    expect(entries.map((entry) => entry.kind)).toEqual(["tool_call", "tool_result"])
    expect(entries[0]).toMatchObject({ kind: "tool_call", tool: { toolName: "AskUserQuestion", toolKind: "ask_user_question" } })
    expect(entries[1]).toMatchObject({ kind: "tool_result", content: { answers: { language: ["TypeScript"] } } })
  })

  test("parks after the budget and keeps the coordinator's signal alive", async () => {
    let parkedToolId: string | undefined
    const { runtime, entries, requests } = setup((toolId) => { parkedToolId = toolId; return true })
    const callController = new AbortController()
    const call = runtime.execute("ask_user_question", { questions }, callController.signal)
    await until(() => requests.length === 1)
    const coordinatorSignal = requests[0]!.signal
    await expect(call).resolves.toMatchObject({ content: [{ text: ASK_PARKED_RESULT_TEXT }] })
    expect(parkedToolId).toBe((entries[0] as Extract<TranscriptEntry, { kind: "tool_call" }>).tool.toolId)
    expect(entries.map((entry) => entry.kind)).toEqual(["tool_call"])
    callController.abort()
    expect(coordinatorSignal.aborted).toBe(false)
  })

  test("waits for the answer when the coordinator cannot park", async () => {
    const { runtime, requests } = setup(() => false)
    const call = runtime.execute("ask_user_question", { questions })
    await until(() => requests.length === 1)
    await Bun.sleep(25)
    requests[0]!.resolve({ answers: { language: ["Python"] } })
    expect(await call).toMatchObject({ structuredContent: { answers: { language: ["Python"] } } })
  })

  test("rejects a second ask after the first was parked without transcript entries", async () => {
    const { runtime, entries, requests } = setup(() => true)
    const first = runtime.execute("ask_user_question", { questions })
    await until(() => requests.length === 1)
    await first
    expect(await runtime.execute("ask_user_question", { questions })).toMatchObject({
      isError: true,
      content: [{ text: ASK_ALREADY_PARKED_TEXT }],
    })
    expect(entries).toHaveLength(1)
    expect(requests).toHaveLength(1)
  })

  test("runtime abort writes a discarded tool result", async () => {
    const { runtime, entries, requests } = setup()
    const call = runtime.execute("ask_user_question", { questions })
    await until(() => requests.length === 1)
    runtime.abort()
    expect(await call).toMatchObject({ isError: true, structuredContent: { discarded: true } })
    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({ kind: "tool_result", content: { discarded: true } })
  })

  test("rejects invalid question counts and missing ids without transcript entries", async () => {
    const { runtime, entries } = setup()
    for (const input of [
      { questions: [] },
      { questions: Array.from({ length: 5 }, (_, index) => ({ ...questions[0]!, id: `q-${index}` })) },
      { questions: [{ question: "Missing id" }] },
    ]) {
      expect(await runtime.execute("ask_user_question", input)).toMatchObject({ isError: true })
    }
    expect(entries).toHaveLength(0)
  })
})
