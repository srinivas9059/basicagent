# Super Challenge Part II: Continuing Agent Conversations

Make follow-ups use the selected conversation's full context history, and save it for the next request.

---

## Step 1: Let the runner receive a conversation's context

In `agent/index.js`, `runAgent` currently decides its own starting context.

Give it a way to receive the context a conversation already has.

---

## Step 2: Continue from that context instead of starting over

Still in `runAgent`, the agent's context should begin with everything the conversation has already accumulated, and end with the user's new message.

---

## Step 3: Return what to show and what to keep

A model response gives you `output_text` to show and `output` to keep.

Make an agent run return:

1. The answer to display on the page.
2. The context history that the next request will continue from.

---

## Step 4: Connect the route to the runner

In `server.js`, the route has already loaded the selected conversation. Give the runner that conversation's stored context history, and take apart what comes back.

---

## Step 5: Keep what the loop produced

When saving the conversation data, update the entire context history so we don't lose tool calls and reasoning items.

## Verification

You'll know it works when you reopen an older conversation and ask a follow-up question that would require tool results from the context history to answer.

The model should be able to answer without any new tool calls, and `store/conversations.json` should show the conversation's new updated `contextHistory`.

Check the hints folder if you get stuck!
