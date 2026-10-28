import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("turn limit returns the forced final answer and preserves context", async () => {
  process.env.AI_KEY ||= "test-key";
  process.env.AI_MODEL = "openai/gpt-oss-120b";
  process.env.AI_URL = "https://api.groq.com/openai/v1/";
  const { runAgent } = await import("./agent/index.js");
  let calls = 0;
  const finalOutput = { type: "message", role: "assistant", content: [] };
  const client = { responses: { create: async (request, options) => {
    calls++;
    assert.equal(request.tools.some(tool => tool.type === "browser_search"), calls <= 8);
    assert.equal(options.timeout, 45000);
    assert.equal(options.maxRetries, 0);
    if (calls <= 8) return {
      output: [{ type: "function_call", name: "unknown_tool", arguments: "{}", call_id: `call-${calls}` }],
    };
    assert.equal(request.tool_choice, "none");
    return { output_text: "Final recommendation", output: [finalOutput] };
  } } };
  const original = [{ role: "user", content: "Earlier question" }];
  const result = await runAgent({ client, contextHistory: original, userPrompt: "Follow-up" });
  assert.equal(calls, 9);
  assert.equal(result.swapAgentResponse, "Final recommendation");
  assert.equal(result.contextHistory[0].content, "Earlier question");
  assert.equal(result.contextHistory.filter(item => item.type === "function_call_output").length, 8);
  assert.equal(result.contextHistory.at(-1), finalOutput);
  assert.equal(original.length, 1);
});

test("browser search timeout falls back to local tools", async () => {
  process.env.AI_KEY ||= "test-key";
  process.env.AI_MODEL = "openai/gpt-oss-120b";
  process.env.AI_URL = "https://api.groq.com/openai/v1/";
  const { runAgent } = await import("./agent/index.js");
  let calls = 0;
  const client = { responses: { create: async request => {
    calls++;
    if (calls === 1) {
      assert.ok(request.tools.some(tool => tool.type === "browser_search"));
      throw new Error("Request timed out");
    }
    assert.equal(request.tools.some(tool => tool.type === "browser_search"), false);
    return { output_text: "Verified with local data only", output: [{ type: "message", role: "assistant", content: [] }] };
  } } };
  const result = await runAgent({ client, contextHistory: [], userPrompt: "Calendly" });
  assert.equal(calls, 2);
  assert.equal(result.swapAgentResponse, "Verified with local data only");
});

test("browser page dumps are excluded from saved and reused context", async () => {
  process.env.AI_KEY ||= "test-key";
  process.env.AI_MODEL = "openai/gpt-oss-120b";
  process.env.AI_URL = "https://api.groq.com/openai/v1/";
  const { runAgent } = await import("./agent/index.js");
  const oldPage = { type: "mcp_call", output: "old page".repeat(1000) };
  const newPage = { type: "mcp_call", output: "new page".repeat(1000) };
  const client = { responses: { create: async request => {
    assert.equal(request.input.includes(oldPage), false);
    return { output_text: "Recommendation with source link", output: [newPage, { type: "message", role: "assistant", content: [] }] };
  } } };
  const result = await runAgent({ client, contextHistory: [oldPage], userPrompt: "Calendly" });
  assert.equal(result.contextHistory.some(item => item.type === "mcp_call"), false);
  assert.equal(result.contextHistory.at(-1).type, "message");
});

test("rename and delete persist without changing other chats", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openswap-test-"));
  try {
    const modulePath = join(directory, "conversations.mjs");
    await copyFile(new URL("./store/conversations.js", import.meta.url), modulePath);
    const databasePath = join(directory, "conversations.json");
    await writeFile(databasePath, JSON.stringify({ conversations: [] }));
    const { conversationStore: store } = await import(pathToFileURL(modulePath).href);
    const first = await store.createConversation();
    const second = await store.createConversation();
    const renamed = await store.renameConversation(first.id, "My email tools");
    assert.equal(renamed.title, "My email tools");
    assert.equal(renamed.titleManuallySet, true);
    assert.equal((await store.getConversation(first.id)).title, "My email tools");
    assert.equal(await store.deleteConversation(first.id), true);
    assert.equal(await store.getConversation(first.id), null);
    assert.equal(await store.deleteConversation(first.id), false);
    assert.equal(await store.renameConversation("missing", "Missing"), null);
    const database = JSON.parse(await readFile(databasePath, "utf8"));
    assert.deepEqual(database.conversations.map(item => item.id), [second.id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
