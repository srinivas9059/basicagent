import * as ui from "./ui.js";

const searchForm = document.getElementById("search-form");
const newConversationButton = document.getElementById("new-conversation");

// The conversation on screen stays null for a fresh chat until its first send.
let activeConversation = null;
// The sidebar's list of saved conversations, most recent first.
let conversationSummaries = [];
let isManagingConversation = false;

start();

async function start() {
  // Register event handlers and load initial data.
  searchForm.addEventListener("submit", handleSwapRequest);
  newConversationButton.addEventListener("click", () => beginNewConversation());
  ui.wireInterfaceEvents();

  try {
    const [popularData, conversationData] = await Promise.all([
      getJson("/api/popular-software"),
      getJson("/api/conversations"),
    ]);

    ui.setStarterSwapNames(popularData.popularSoftware);
    conversationSummaries = conversationData.conversations;
    beginNewConversation({ focusInput: false });
  } catch (error) {
    ui.renderOutputError(error.message);
  }
}

// A fresh chat only clears the screen. Nothing is stored until the first send.
function beginNewConversation({ focusInput = true } = {}) {
  if (ui.isLoading() || isManagingConversation) return;
  showConversation(null, { focusInput });
}

// Reopening a chat loads its saved chat history without calling the model.
async function openConversation(conversationId) {
  if (ui.isLoading() || isManagingConversation) return;

  try {
    const data = await getJson(`/api/conversations/${conversationId}`);
    showConversation(data.conversation);
  } catch (error) {
    ui.renderOutputError(error.message);
  }
}

function showConversation(conversation, { focusInput = true } = {}) {
  activeConversation = conversation;
  ui.resetInput();
  renderConversation();
  ui.closeSidebar();
  if (focusInput) ui.focusInput();
}

async function handleSwapRequest(e) {
  // Keep the form on the page so JavaScript can handle the request
  e.preventDefault();
  if (ui.isLoading() || isManagingConversation) return;

  const userPrompt = buildPrompt();

  if (!userPrompt) {
    ui.renderOutputError("Type what you want to replace or select at least one starter swap.");
    return;
  }

  // A fresh chat becomes a stored conversation when its first message is sent.
  if (!activeConversation) {
    try {
      const data = await postJson("/api/conversations", {});
      activeConversation = data.conversation;
      moveSummaryToTop(activeConversation);
      renderSidebar();
    } catch (error) {
      ui.renderOutputError(error.message);
      return;
    }
  }

  // Show the user's message right away, while the agent works on the answer.
  activeConversation = {
    ...activeConversation,
    chatHistory: [
      ...activeConversation.chatHistory,
      { role: "user", content: userPrompt },
    ],
  };
  ui.resetInput();
  ui.renderChatHistory(activeConversation.chatHistory);
  ui.setLoading(true);

  try {
    // The ID tells the server which saved conversation to continue.
    const data = await postJson("/api/swaps", {
      conversationId: activeConversation.id,
      userPrompt,
    });

    // Redraw from the saved conversation, so the page shows what the server kept.
    activeConversation = data.conversation;
    moveSummaryToTop(activeConversation);
    renderConversation();
  } catch (error) {
    // The message was never saved, so take it back off the screen.
    activeConversation = {
      ...activeConversation,
      chatHistory: activeConversation.chatHistory.slice(0, -1),
    };
    ui.renderChatHistory(activeConversation.chatHistory);
    ui.renderOutputError(error.message);
  } finally {
    // Always reset the UI, even if the request fails
    ui.setLoading(false);
  }
}

// Build a prompt that includes the user's text and any selected starter swaps
function buildPrompt() {
  const userInputText = ui.getUserInputText();
  const selectedSwapNames = ui.getSelectedSwapNames();
  const promptSections = [];

  // Include the starter swaps if any are selected
  if (selectedSwapNames.length > 0) {
    const selectedSwapsString = selectedSwapNames.map((swapName) => `- ${swapName}`).join("\n");
    promptSections.push(
      `Starter swaps selected:\n${selectedSwapsString}`
    );
  }

  // Include the user's text if they typed anything
  if (userInputText) {
    promptSections.push(`User request:\n${userInputText}`);
  }

  // Omit empty inputs, then separate the remaining labeled sections.
  return promptSections.join("\n\n");
}

function renderConversation() {
  ui.renderChatHistory(activeConversation?.chatHistory ?? []);
  renderSidebar();
}

function renderSidebar() {
  ui.renderConversationList({
    conversationSummaries,
    activeConversationId: activeConversation?.id,
    onOpen: openConversation,
    onRename: renameConversation,
    onDelete: deleteConversation,
  });
}

async function renameConversation(conversation) {
  if (ui.isLoading() || isManagingConversation) return;
  const title = window.prompt("Rename chat (1–120 characters):", conversation.title);
  if (title === null) return;
  if (!title.trim() || title.trim().length > 120) {
    ui.renderOutputError("Use a chat name between 1 and 120 characters.");
    return;
  }
  isManagingConversation = true;
  try {
    const data = await requestJson(`/api/conversations/${conversation.id}`, "PATCH", { title });
    conversationSummaries = conversationSummaries.map(summary =>
      summary.id === conversation.id ? data.conversation : summary);
    if (activeConversation?.id === conversation.id) activeConversation = data.conversation;
    renderSidebar();
  } catch (error) {
    ui.renderOutputError(error.message);
  } finally {
    isManagingConversation = false;
  }
}

async function deleteConversation(conversation) {
  if (ui.isLoading() || isManagingConversation) return;
  if (!window.confirm(`Delete “${conversation.title}”? This permanently removes its messages.`)) return;
  isManagingConversation = true;
  try {
    await requestJson(`/api/conversations/${conversation.id}`, "DELETE");
    conversationSummaries = conversationSummaries.filter(summary => summary.id !== conversation.id);
    if (activeConversation?.id === conversation.id) showConversation(null);
    else renderSidebar();
  } catch (error) {
    ui.renderOutputError(error.message);
  } finally {
    isManagingConversation = false;
  }
}

// The conversation just used goes to the top of the sidebar, added if it's new.
function moveSummaryToTop({ id, title, updatedAt }) {
  conversationSummaries = [
    { id, title, updatedAt },
    ...conversationSummaries.filter((summary) => summary.id !== id),
  ];
}

async function getJson(url) {
  const response = await fetch(url);
  return parseResponse(response);
}

async function postJson(url, body) {
  return requestJson(url, "POST", body);
}

async function requestJson(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

// Every route answers in JSON, and a failed request carries an error message.
async function parseResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Server returned an error");
  }

  return data;
}
