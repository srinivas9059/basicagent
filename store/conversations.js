import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Every saved conversation lives in this one JSON file, next to the store.
const CONVERSATIONS_FILE = new URL("./conversations.json", import.meta.url);

// The sidebar only needs labels and IDs, ordered by the latest activity.
async function listConversations() {
  const conversations = await readConversations();
  return conversations
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Continuing a conversation needs its chat history and complete agent context.
async function getConversation(id) {
  const conversations = await readConversations();
  return conversations.find((conversation) => conversation.id === id) ?? null;
}

// The first send creates a record; clicking New chat alone stores nothing.
async function createConversation() {
  const now = new Date().toISOString();
  const conversation = {
    id: randomUUID(),
    title: "New conversation",
    createdAt: now,
    updatedAt: now,
    chatHistory: [],
    contextHistory: [],
  };

  const conversations = await readConversations();
  await writeConversations([...conversations, conversation]);
  return conversation;
}

// Replace the stored record with the updated one, and note when it changed.
async function saveConversation(conversation) {
  const conversations = await readConversations();
  const index = conversations.findIndex((item) => item.id === conversation.id);

  if (index === -1) {
    throw new Error(`Unknown conversation: ${conversation.id}`);
  }

  const savedConversation = {
    ...conversation,
    title: getConversationTitle(conversation),
    updatedAt: new Date().toISOString(),
  };
  conversations[index] = savedConversation;
  await writeConversations(conversations);
  return savedConversation;
}

async function renameConversation(id, title) {
  const conversation = await getConversation(id);
  if (!conversation) return null;
  return saveConversation({ ...conversation, title, titleManuallySet: true });
}

async function deleteConversation(id) {
  const conversations = await readConversations();
  const remaining = conversations.filter((conversation) => conversation.id !== id);
  if (remaining.length === conversations.length) return false;
  await writeConversations(remaining);
  return true;
}

// Until a chat has a generated title, label it with its first user message.
function getConversationTitle(conversation) {
  if (conversation.titleManuallySet || conversation.title !== "New conversation") {
    return conversation.title;
  }

  const firstUserMessage = conversation.chatHistory.find(
    (message) => message.role === "user"
  )?.content;

  if (!firstUserMessage) return "New conversation";

  // Keep the full text. The sidebar handles visual truncation.
  return firstUserMessage.trim();
}

async function readConversations() {
  const database = JSON.parse(await readFile(CONVERSATIONS_FILE, "utf8"));
  return database.conversations;
}

// Indent the JSON so you can open the file and read what was saved.
async function writeConversations(conversations) {
  await writeFile(CONVERSATIONS_FILE, `${JSON.stringify({ conversations }, null, 2)}\n`);
}

export const conversationStore = {
  createConversation,
  getConversation,
  listConversations,
  saveConversation,
  renameConversation,
  deleteConversation,
};
