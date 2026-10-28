import { readFileSync } from "node:fs";

const swaps = JSON.parse(readFileSync(new URL("./swaps.json", import.meta.url), "utf-8"));

// Simulated failure: when the flag is on, Notion searches throw while every
// other query still reaches the database.
const SIMULATE_DB_FAILURE = false;

// The agent passes the model's search_swaps arguments into this function.
export async function searchSwaps({ query } = {}) {
  if (!query) {
    return {
      status: "error",
      retryable: false,
      message: "Query required.",
    };
  }

  if (SIMULATE_DB_FAILURE && query === "Notion") {
    throw new Error("Simulated database failure");
  }

  await simulateLatency();

  // Search the database entries for every match.
  const results = swaps.filter((swap) => matchesQuery(swap, query));
  console.log("Database matches:", results.length);

  // If the search returned no records, return a "no_results" status.
  if (results.length === 0) {
    return {
      status: "no_results",
      message: "No swaps found matching that product",
    };
  }

  return {
    status: "ok",
    result: results,
  };
}

// Find a catalog project by name without changing its display name.
export function findSwapByProjectName(projectName) {
  if (typeof projectName !== "string") {
    return undefined;
  }

  // Ignore capitalization, spaces, hyphens and dots, so "Paperless NGX" finds "Paperless-ngx".
  const normalize = (name) =>
    name.toLowerCase().replaceAll(" ", "").replaceAll("-", "").replaceAll(".", "");
  return swaps.find((swap) => normalize(swap.name) === normalize(projectName));
}

// Read the GitHub owner and repository name from a swap's repo URL.
export function getRepoPath(swap) {
  if (!swap?.repo_url) {
    return "";
  }

  return new URL(swap.repo_url).pathname.slice(1).toLowerCase();
}

// Return a list of starter products for the app to show as chips
export function getStarterSwapOptions() {
  return STARTER_SWAP_OPTIONS;
}

// Return true if the swap's replaces array or tags contain the query string
function matchesQuery(swap, query = "") {
  if (typeof query !== "string") {
    return false;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return false;
  }

  const matchesReplacement = swap.replaces.some(
    (product) => product.toLowerCase() === normalizedQuery
  );
  const matchesTag = swap.tags.some(
    (tag) => tag.toLowerCase() === normalizedQuery
  );

  return matchesReplacement || matchesTag;
}

const STARTER_SWAP_OPTIONS = [
  "Confluence",
  "Typeform",
  "ChatGPT",
  "Claude",
  "Google Drive",
  "Google Analytics",
  "Notion",
  "Dropbox",
  "Firebase",
  "Shopify",
  "Trello",
  "Airtable",
  "Calendly",
  "Discord",
  "Intercom",
  "Mailchimp",
  "Miro",
  "Obsidian",
  "Zapier",
  "Zendesk",
];

// A real database call takes a moment, so searchSwaps waits before answering.
const SIMULATED_DB_LATENCY_MS = 300;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateLatency() {
  await wait(SIMULATED_DB_LATENCY_MS);
}
