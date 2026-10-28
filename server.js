import "./environment.js";
import express from "express";
import OpenAI from "openai";
import { runAgent } from "./agent/index.js";
import { conversationStore } from "./store/conversations.js";
import { getStarterSwapOptions } from "./store/swaps.js";

// Create the Express app for our backend server
const app = express();
// Parse JSON request bodies before route handlers read req.body
app.use(express.json());

// Initialize an OpenAI client for your provider using env vars
const client = new OpenAI({
  apiKey: process.env.AI_KEY,
  baseURL: process.env.AI_URL,
});

// Send the UI a list of popular software names to show as chips
app.get("/api/popular-software", (_req, res) => {
  res.json({ popularSoftware: getStarterSwapOptions() });
});

// List summaries for the sidebar, without either history array.
app.get("/api/conversations", async (_req, res) => {
  try {
    res.json({ conversations: await conversationStore.listConversations() });
  } catch (error) {
    handleServerError(res, error);
  }
});

// Create the record on first send; opening a fresh chat alone stores nothing.
app.post("/api/conversations", async (_req, res) => {
  try {
    const conversation = await conversationStore.createConversation();
    res.status(201).json({ conversation: getConversationForBrowser(conversation) });
  } catch (error) {
    handleServerError(res, error);
  }
});

// Reopen the visible transcript. Model history stays on the server.
app.get("/api/conversations/:conversationId", async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const conversation = await conversationStore.getConversation(conversationId);
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation: getConversationForBrowser(conversation) });
  } catch (error) {
    handleServerError(res, error);
  }
});

// Rename or remove saved chats from the sidebar.
app.patch("/api/conversations/:conversationId", async (req, res) => {
  const title = req.body?.title;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    return res.status(400).json({ error: "Use a chat name between 1 and 120 characters." });
  }
  try {
    const conversation = await conversationStore.renameConversation(req.params.conversationId, title.trim());
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    res.json({ conversation: getConversationForBrowser(conversation) });
  } catch (error) {
    handleServerError(res, error);
  }
});

app.delete("/api/conversations/:conversationId", async (req, res) => {
  try {
    const deleted = await conversationStore.deleteConversation(req.params.conversationId);
    if (!deleted) return res.status(404).json({ error: "Conversation not found." });
    res.json({ deleted: true });
  } catch (error) {
    handleServerError(res, error);
  }
});

// Continue the selected conversation using its ID and the new text from the browser.
app.post("/api/swaps", async (req, res) => {
  const { conversationId, userPrompt } = req.body;

  // Reject empty input before it can spend a model request
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    res.status(400).json({ error: "A conversation id is required." });
    return;
  }

  if (typeof userPrompt !== "string" || !userPrompt.trim()) {
    res.status(400).json({ error: "A user prompt is required." });
    return;
  }

  console.log("[/api/swaps] prompt:", userPrompt);

  try {
    const conversation = await conversationStore.getConversation(conversationId);

    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    // Name a conversation from its first prompt without an extra model request.
    let title = conversation.title;
    if (conversation.chatHistory.length === 0 && !conversation.titleManuallySet) {
      title = titleFromPrompt(userPrompt);
    }

    // Run the agent loop until it has a final answer for this prompt.
    const loadedContextHistory = conversation.contextHistory
    const { swapAgentResponse, contextHistory } = await runAgent({ 
      client, 
      contextHistory: loadedContextHistory, 
      userPrompt 
    });

    // Save the new exchange so the page still has it after a reload.
    const savedConversation = await conversationStore.saveConversation({
      ...conversation,
      title,
      chatHistory: [
        ...conversation.chatHistory,
        {
          role: "user",
          content: userPrompt,
        },
        {
          role: "assistant",
          content: swapAgentResponse,
        },
      ],
      contextHistory
    });

    res.json({ conversation: getConversationForBrowser(savedConversation) });
  } catch (error) {
    handleServerError(res, error);
  }
});

function titleFromPrompt(prompt) {
  const selected = [...prompt.matchAll(/^- (.+)$/gm)].map(match => match[1].trim());
  const request = prompt.split("User request:\n")[1]?.trim() ?? "";
  const words = request.replace(/\s+/g, " ").split(" ").filter(Boolean).slice(0, 6).join(" ");
  return [selected.join(", "), words].filter(Boolean).join(" — ").slice(0, 80) || "New conversation";
}

// Select the chat history and metadata, leaving the agent context on the server.
function getConversationForBrowser(conversation) {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    chatHistory: conversation.chatHistory,
  };
}

// Give the browser one stable error shape for any failure.
function handleServerError(res, error) {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

// Start the Express server so the frontend can talk to it
const PORT = process.env.PORT || 3001;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`OpenSwap server running at http://127.0.0.1:${PORT}`);
});
