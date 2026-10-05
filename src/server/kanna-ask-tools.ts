import { z } from "zod"
import type { AskUserQuestionItem } from "../shared/types"
import { asRecord } from "../shared/json"
import type { KannaToolDefinition } from "./kanna-tools"

/**
 * Cursor's MCP client times every tool call out at 60 s (no progress reset,
 * no override), so the tool blocks for less than that and then parks the
 * question: the coordinator keeps it pending and answers it in a follow-up
 * turn. See docs/cursor-ask-user-question.md.
 */
export const ASK_USER_QUESTION_BUDGET_MS = 50_000

export const ASK_PARKED_RESULT_TEXT =
  "The question is shown to the user in Kanna and is waiting for an answer. End your turn now. "
  + "Do not guess an answer and do not ask again. The user's answers will arrive as your next message."

export const ASK_ALREADY_PARKED_TEXT =
  "A question is already waiting for the user's answer. End your turn now; the answers will arrive as your next message."

export const CURSOR_ASK_USER_QUESTION_SYSTEM_MESSAGE =
  "<system-message>Your built-in AskQuestion tool does not work in this environment: every call is "
  + "rejected automatically and the user never sees it. When you need input from the user, call the "
  + "ask_user_question tool from the Kanna MCP server instead. Discover the server's current "
  + "namespace from the available MCP tools; it may change between turns. If it says the "
  + "question is waiting for an answer, end your turn immediately; the answers will arrive as the "
  + "next message.</system-message>"

const questionSchema = z.strictObject({
  id: z.string().min(1),
  question: z.string().min(1),
  header: z.string().optional(),
  multiSelect: z.boolean().optional(),
  options: z.array(z.strictObject({
    label: z.string().min(1),
    description: z.string().optional(),
  })).default([]),
})

/**
 * The user's answers to an AskUserQuestion, as text for the model. Answers
 * are keyed by question id when the question has one, else by its text.
 */
export function formatQuestionAnswersFollowUp(questions: AskUserQuestionItem[], result: unknown) {
  const answers = asRecord(asRecord(result)?.answers) ?? {}
  const lines = questions.map((question) => {
    const raw = (question.id ? answers[question.id] : undefined) ?? answers[question.question]
    const picked = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(String).filter(Boolean)
    return `- ${question.question}\n  ${picked.length > 0 ? picked.join(", ") : "(no answer)"}`
  })
  return `Here are my answers to your questions:\n\n${lines.join("\n")}`
}

export function createAskUserQuestionTool(budgetMs = ASK_USER_QUESTION_BUDGET_MS): KannaToolDefinition {
  return {
    name: "ask_user_question",
    description:
      "Ask the user one to four questions and wait for their answers. Use this instead of the built-in "
      + "AskQuestion tool, which is rejected automatically here. Give every question a short unique id. "
      + "Offer options when the answer is a choice; set multiSelect to allow several. If the result says "
      + "the question is waiting for an answer, end your turn immediately.",
    waitsForUser: true,
    schema: z.strictObject({ questions: z.array(questionSchema).min(1).max(4) }),
    async execute(input, context) {
      const questions = (input as { questions: AskUserQuestionItem[] }).questions
      const outcome = await context.askUser(questions, { budgetMs })
      if (outcome.kind === "parked") {
        return { content: [{ type: "text", text: ASK_PARKED_RESULT_TEXT }] }
      }
      return {
        content: [{ type: "text", text: formatQuestionAnswersFollowUp(questions, { answers: outcome.answers }) }],
        structuredContent: { answers: outcome.answers },
      }
    },
  }
}

export const ASK_USER_QUESTION_TOOL = createAskUserQuestionTool()
