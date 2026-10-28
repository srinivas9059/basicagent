import { marked } from "marked";
import DOMPurify from "dompurify";
import { ICONS } from "./icons.js";

const SWAP_PRESENTATION = {
  Confluence: { icon: ICONS.confluence },
  Typeform: { icon: ICONS.typeform },
  ChatGPT: { icon: ICONS.openai },
  Claude: { icon: ICONS.anthropic },
  "Google Drive": { label: "Drive", icon: ICONS.google },
  "Google Analytics": { label: "Analytics", icon: ICONS.google },
  Notion: { icon: ICONS.notion },
  Dropbox: { icon: ICONS.dropbox },
  Firebase: { icon: ICONS.firebase },
  Shopify: { icon: ICONS.shopify },
  Trello: { icon: ICONS.trello },
  Airtable: { icon: ICONS.airtable },
  Calendly: { icon: ICONS.calendly },
  Discord: { icon: ICONS.discord },
  Intercom: { icon: ICONS.intercom },
  Mailchimp: { icon: ICONS.mailchimp },
  Miro: { icon: ICONS.miro },
  Obsidian: { icon: ICONS.obsidian },
  Zapier: { icon: ICONS.zapier },
  Zendesk: { icon: ICONS.zendesk },
};

// Manage the browser-side UI state and DOM updates
const sidebar = document.getElementById("sidebar");
const app = document.getElementById("app");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const openSidebarButton = document.getElementById("open-sidebar");
const closeSidebarButton = document.getElementById("close-sidebar");
const newConversationButton = document.getElementById("new-conversation");
const conversationList = document.getElementById("conversation-list");
const starterSwapsContainer = document.getElementById("starter-swaps");
const outputContainer = document.getElementById("output-container");
const outputContent = document.getElementById("output-content");
const inputPanel = document.getElementById("input-panel");
const promptLabel = document.querySelector(".prompt-label");
const userInput = document.getElementById("user-input");
const submitButton = document.getElementById("submit-button");
const submitLabel = document.getElementById("submit-label");

// Below this width the sidebar becomes a drawer that slides over the page.
const mobileLayout = window.matchMedia("(max-width: 760px)");

const state = {
  starterSwapNames: [],
  selectedSwapNames: [],
  isLoading: false,
  // "starter" shows the chips for a fresh chat; "followup" continues one.
  mode: "starter",
};

let loadingRow = null;

export function wireInterfaceEvents() {
  userInput.addEventListener("input", handleInputChange);
  openSidebarButton.addEventListener("click", openSidebar);
  closeSidebarButton.addEventListener("click", closeSidebar);
  sidebarBackdrop.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", handleSidebarKeydown);
  mobileLayout.addEventListener("change", () => closeSidebar());
}

export function isLoading() {
  return state.isLoading;
}

export function setStarterSwapNames(swapNames) {
  state.starterSwapNames = swapNames;
}

export function getUserInputText() {
  return userInput.value.trim();
}

export function getSelectedSwapNames() {
  return [...state.selectedSwapNames];
}

export function focusInput() {
  userInput.focus();
}

// Clear the typed text and chip selections, ready for the next message.
export function resetInput() {
  state.selectedSwapNames = [];
  userInput.value = "";
  userInput.style.height = "auto";
  renderStarterSwaps();
}

export function renderChatHistory(chatHistory) {
  removeLoadingRow();
  outputContent.replaceChildren();

  // With no messages yet, show the starter screen instead of an empty transcript.
  if (chatHistory.length === 0) {
    outputContainer.classList.add("hidden");
    outputContainer.classList.remove("visible");
    enterStarterMode();
    syncSubmitAvailability();
    return;
  }

  showOutput();
  enterFollowUpMode();

  for (const message of chatHistory) {
    if (message.role === "user") {
      appendUserMessage(message.content);
    } else {
      appendAssistantMarkdown(message.content);
    }
  }

  syncSubmitAvailability();
}

function appendUserMessage(prompt) {
  const turn = document.createElement("div");
  turn.className = "history-turn user-turn";
  turn.textContent = formatPromptForDisplay(prompt);
  outputContent.append(turn);
}

function appendAssistantMarkdown(markdown) {
  // Assistant responses are Markdown, so render then sanitize before inserting HTML.
  const turn = document.createElement("div");
  turn.className = "history-turn assistant-turn";
  turn.innerHTML = DOMPurify.sanitize(marked.parse(markdown || ""));
  for (const table of turn.querySelectorAll("table")) {
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", "Scrollable comparison table");
    table.replaceWith(scroll);
    scroll.append(table);
  }
  outputContent.append(turn);
}

// buildPrompt in index.js labels each section for the model.
// Turn those labels back into a short line for the transcript.
function formatPromptForDisplay(prompt) {
  const [selectionBlock, typedBlock] = prompt.split("\n\nUser request:\n");

  if (!selectionBlock.startsWith("Starter swaps selected:\n")) {
    return prompt.replace(/^User request:\n/, "");
  }

  const selectedNames = selectionBlock
    .split("\n")
    .slice(1)
    .map((line) => line.replace(/^- /, ""))
    .filter(Boolean);
  const selectedText = `Selected: ${selectedNames.join(", ")}`;

  return typedBlock ? `${selectedText}\n${typedBlock}` : selectedText;
}

export function renderConversationList({ conversationSummaries, activeConversationId, onOpen, onRename, onDelete }) {
  conversationList.replaceChildren();

  if (conversationSummaries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = "Your chats will appear here after you send your first message.";
    conversationList.append(empty);
  }

  for (const conversation of conversationSummaries) {
    const isActive = conversation.id === activeConversationId;
    const row = document.createElement("div");
    row.className = "conversation-row";
    row.classList.toggle("active", isActive);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-link";
    button.classList.toggle("active", isActive);
    // Long titles are cut off by CSS; the tooltip shows the full text.
    button.textContent = conversation.title;
    button.title = conversation.title;
    if (isActive) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => onOpen(conversation.id));
    const rename = buildChatAction("Rename", conversation.title, "M12 5H5v14h14v-7M16 3l5 5M10 14l1-5 7-7 5 5-7 7-5 1Z", () => onRename(conversation));
    const remove = buildChatAction("Delete", conversation.title, "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7", () => onDelete(conversation));
    remove.classList.add("delete-chat");
    row.append(button, rename, remove);
    conversationList.append(row);
  }
}

function buildChatAction(action, title, pathData, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button chat-action";
  button.title = `${action} chat`;
  button.setAttribute("aria-label", `${action} chat: ${title}`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  button.append(svg);
  button.addEventListener("click", onClick);
  return button;
}

function renderStarterSwaps() {
  starterSwapsContainer.replaceChildren();

  for (const swapName of state.starterSwapNames) {
    const isSelected = state.selectedSwapNames.includes(swapName);
    const button = buildSwapChip(swapName, isSelected);
    button.addEventListener("click", () => {
      // Clicking a chip acts like a toggle: add it if missing, remove it if selected
      state.selectedSwapNames = isSelected
        ? state.selectedSwapNames.filter((name) => name !== swapName)
        : [...state.selectedSwapNames, swapName];
      renderStarterSwaps();
      updateSubmitLabel();
      syncSubmitAvailability();
    });
    starterSwapsContainer.append(button);
  }
}

function buildSwapChip(swapName, isSelected) {
  const button = document.createElement("button");
  const titleRow = document.createElement("div");
  const presentation = SWAP_PRESENTATION[swapName] ?? {};
  const icon = buildSwapIcon(presentation.icon);
  const title = document.createElement("p");

  button.type = "button";
  button.className = `swap-card${isSelected ? " is-selected" : ""}`;
  button.setAttribute("aria-label", swapName);
  button.setAttribute("aria-pressed", String(isSelected));

  titleRow.className = "swap-title-row";
  title.className = "swap-title";
  title.textContent = presentation.label ?? swapName;

  if (icon) {
    titleRow.append(icon);
  }
  titleRow.append(title);
  button.append(titleRow);

  return button;
}

function buildSwapIcon(iconDefinition) {
  if (!iconDefinition) {
    return null;
  }

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  icon.setAttribute("class", "swap-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  path.setAttribute("d", iconDefinition.path);
  icon.append(path);

  return icon;
}

export function setLoading(isLoading) {
  state.isLoading = isLoading;
  submitButton.disabled = isLoading || !canSubmit();
  newConversationButton.disabled = isLoading;
  submitButton.setAttribute("aria-busy", String(isLoading));
  submitLabel.textContent = isLoading
    ? "Loading..."
    : submitButton.dataset.readyLabel || "Swap it";

  // Hide the input while a request is in flight and show a loader below the chat.
  if (isLoading) {
    inputPanel.classList.add("hidden");
    showOutputLoading();
  } else {
    removeLoadingRow();
    inputPanel.classList.remove("hidden");
    syncSubmitAvailability();
  }
}

function showOutputLoading() {
  showOutput();
  removeLoadingRow();

  loadingRow = document.createElement("p");
  loadingRow.className = "loading-status";

  const loader = document.createElement("span");
  loader.className = "swap-loader";
  loader.setAttribute("aria-hidden", "true");
  loader.append(buildSwapLoaderIcon());

  const statusText = document.createElement("span");
  statusText.textContent = "Checking projects and sources… this may take up to a minute.";

  loadingRow.append(loader, statusText);
  outputContent.append(loadingRow);
}

function buildSwapLoaderIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  icon.setAttribute("class", "swap-loader-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("aria-hidden", "true");
  path.setAttribute("d", "M6 8h10.5l-3-3M18 16H7.5l3 3");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.1");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);

  return icon;
}

function removeLoadingRow() {
  loadingRow?.remove();
  loadingRow = null;
}

export function renderOutputError(message) {
  // Add errors below the chat, so earlier messages stay visible
  showOutput();
  removeLoadingRow();

  const turn = document.createElement("div");
  turn.className = "history-turn error-turn";
  turn.textContent = message;
  outputContent.append(turn);
}

function showOutput() {
  outputContainer.classList.remove("hidden");
  outputContainer.classList.add("visible");
}

function enterFollowUpMode() {
  state.mode = "followup";
  promptLabel.textContent = "Ask a follow-up:";
  userInput.placeholder = "Ask about tradeoffs, maintenance, hosting, or next steps...";
  updateSubmitLabel();
}

function enterStarterMode() {
  state.mode = "starter";
  promptLabel.textContent = "Write down any other tools or specific requirements:";
  userInput.placeholder = "E.g. 'I need an email marketing tool for my university club.'";
  updateSubmitLabel();
}

function updateSubmitLabel() {
  // Match the button label to the mode and the current chip selection
  let label = "Swap it";
  if (state.mode === "followup") {
    label = "Send";
  } else if (state.selectedSwapNames.length > 1) {
    label = "Swap 'em";
  }

  submitButton.dataset.readyLabel = label;
  if (!state.isLoading) submitLabel.textContent = label;
}

function handleInputChange() {
  // Reset first so the textarea can shrink as well as grow
  userInput.style.height = "auto";
  userInput.style.height = `${userInput.scrollHeight}px`;
  syncSubmitAvailability();
}

function canSubmit() {
  return Boolean(getUserInputText()) || state.selectedSwapNames.length > 0;
}

function syncSubmitAvailability() {
  submitButton.disabled = state.isLoading || !canSubmit();
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  openSidebarButton.setAttribute("aria-expanded", "true");
  sidebar.inert = false;
  app.inert = true;
  closeSidebarButton.focus();
}

export function closeSidebar() {
  const wasOpen = document.body.classList.contains("sidebar-open");
  document.body.classList.remove("sidebar-open");
  openSidebarButton.setAttribute("aria-expanded", "false");
  app.inert = false;
  // An offscreen mobile drawer must not leave invisible buttons in the tab order.
  sidebar.inert = mobileLayout.matches;
  if (wasOpen) openSidebarButton.focus();
}

// While the mobile drawer is open, Escape closes it and Tab stays inside it.
function handleSidebarKeydown(event) {
  if (!document.body.classList.contains("sidebar-open")) return;

  if (event.key === "Escape") {
    closeSidebar();
    return;
  }

  if (event.key !== "Tab") return;

  const buttons = [...sidebar.querySelectorAll("button:not(:disabled)")];
  const first = buttons[0];
  const last = buttons.at(-1);

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
