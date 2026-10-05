# Cursor AskUserQuestion support

Cursor's built-in `AskQuestion` is automatically rejected in headless
`cursor-agent` mode. Kanna therefore exposes an `ask_user_question` MCP tool in
Cursor chats. The existing Kanna question card collects answers; no client
changes are needed. Other providers keep their existing tool list and ask flow.

## Answer timing

The Cursor MCP client applies a 60-second timeout to every tool call and does
not reset it for progress notifications. Kanna waits up to 50 seconds for an
answer. If the user answers within that budget, the tool returns the answers
inline and the Cursor turn continues normally.

If the budget expires, Kanna parks the pending question and tells Cursor to end
the turn. A successful Cursor result is held in memory so the chat remains
`waiting_for_user` after the CLI exits. Once the user answers, Kanna records the
tool result and starts a wire-only `--resume` turn containing the answer. It
does not add a second user prompt to the transcript.

If Cursor continues working after the question is parked, the answer is
delivered in a follow-up turn after the current stream ends. Cancellation
discards the question. A parked question is discarded if the turn fails, the
stream ends without success, or Kanna shuts down. Parked questions do not
survive a Kanna restart.

## Native Cursor questions

Kanna maps native `askQuestionToolCall` events to the existing question-card
transcript format. Cursor's `interaction_query` request and automatic
rejection events are ignored because the tool-call events carry the renderable
question. The rejected native call produces a discarded question result rather
than an unknown-tool row.

Each Cursor turn includes a steering message directing the model to use
Kanna's MCP tool. It tells the model to discover the current MCP namespace,
which can change for each turn because the temporary plugin directory is unique.
The tool description repeats this guidance. The model may still choose its
native tool; those cards are shown as discarded.

The temporary plugin is created under Kanna's user cache directory. Cursor CLI
ignored the same plugin when it lived under the operating system's temp directory,
so keep it in the home cache when changing the plugin setup.

## Manual verification

After the automated checks pass, verify with the current `cursor-agent` and a
development build:

1. Ask the model to use `ask_user_question` to ask whether you prefer red or
   blue. Answer within 50 seconds and confirm the turn uses that answer.
2. Repeat and wait over 60 seconds. Confirm the model turn ends while the chat
   stays waiting for an answer. Answer and confirm a resumed turn uses it.
3. Ask the model to use its built-in `AskQuestion`. Confirm the card is marked
   discarded and no unknown-tool row appears.
4. If Cursor changes the MCP timeout or the shape of `askQuestionToolCall`,
   re-check the adapter assumptions and update this document.

## Accepted limitations

- A parked question does not survive a Kanna restart.
- While Cursor continues after parking, the chat displays `waiting_for_user`.
- The held successful result is dropped once answered; the follow-up turn has
  its own result entry.
- Cursor's `GetDynamicTools` discovery adds one visible row and some latency
  before the first Kanna tool call.
- Steering cannot guarantee that the model uses Kanna's tool instead of the
  native Cursor tool.
