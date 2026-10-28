import "../environment.js";
import { systemPrompt, finalAnswerSystemPrompt } from "./prompts.js";
import { tools } from "./tools.js";
import { searchSwaps } from "../store/swaps.js";
import { checkHealth } from "../store/github.js";

// Groq executes browser_search itself; local functions below still run here.
const browserSearchSupported = () =>
  /^https:\/\/api\.groq\.com\/openai\/v1\/?$/.test(process.env.AI_URL ?? "") &&
  ["openai/gpt-oss-20b", "openai/gpt-oss-120b"].includes(process.env.AI_MODEL);
const availableTools = (includeBrowserSearch = true) => includeBrowserSearch && browserSearchSupported()
  ? [...tools, { type: "browser_search" }]
  : tools;

const MODEL_REQUEST_TIMEOUT_MS = 45000;
const requestOptions = { timeout: MODEL_REQUEST_TIMEOUT_MS, maxRetries: 0 };

// Built-in browser calls can contain entire web pages. The final assistant
// answer retains the useful findings and links, so do not resend page dumps
// on later messages. Keep them during this run in case a local tool follows.
function compactContextHistory(history) {
  return history.filter(item =>
    item.type !== "mcp_call" && item.type !== "browser_search_call");
}

// Challenge: See challenge.md for instructions.
// Runs the agent loop until it finishes with an answer
export async function runAgent({ client, contextHistory, userPrompt }) {
  // Start the conversation with the user's request.
  const inputContext = [
    ...compactContextHistory(contextHistory),
    { 
      role: "user", 
      content: userPrompt 
    }
  ];

  // Limit how many turns the agent can take to avoid infinite loops.
  const maxTurns = 8;
  let turnCount = 0;
  let browserSearchAvailable = true;

  // Keep going until the agent finishes or runs out of turns.
  while (turnCount < maxTurns) {
    turnCount++;
    console.log(`Turn ${turnCount}`);

    // Send the inputContext to the model and get its response.
    let turnResponse;
    try {
      turnResponse = await client.responses.create({
        model: process.env.AI_MODEL,
        instructions: systemPrompt,
        input: inputContext,
        tools: availableTools(browserSearchAvailable),
      }, requestOptions);
    } catch (error) {
      if (!browserSearchAvailable || !browserSearchSupported()) throw error;
      console.warn("Browser search request failed; continuing with local tools:", error.message);
      browserSearchAvailable = false;
      turnResponse = await client.responses.create({
        model: process.env.AI_MODEL,
        instructions: `${systemPrompt}\n\nBrowser search failed or timed out. Continue using the local catalog and GitHub evidence. Do not claim web verification.`,
        input: inputContext,
        tools: availableTools(false),
      }, requestOptions);
    }

    const usedBrowserSearch = turnResponse.output.some(item =>
      item.type === "mcp_call" || item.type === "browser_search_call");
    if (usedBrowserSearch) browserSearchAvailable = false;
    console.log("Model output types:", turnResponse.output.map(item => item.type));

    // Preserve the model's whole output turn for the next request.
    inputContext.push(...turnResponse.output);

    // Create a list of all tool calls requested in this turn.
    const toolCalls = turnResponse.output.filter(
      (item) => item.type === "function_call"
    );

    // If there are no tool calls, return the model's final output text.
    if (toolCalls.length === 0) {
      return {
        swapAgentResponse: turnResponse.output_text,
        contextHistory: compactContextHistory(inputContext)
      }
    }

    // Process each tool call in the order they were requested.
    for (const toolCall of toolCalls) {
      console.log("Tool call requested:", toolCall.name);
      console.log("Arguments:", toolCall.arguments);

      const result = await runTool(toolCall);
      console.log(
        `Tool result [${result.status}]:`,
        result.message || `${result.result?.length ?? 0} items`
      );

      inputContext.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      });
    }
  }

  // The turns ran out. Make one last request with tool calling switched off,
  // so the model answers from the tool results already in inputContext.
  const finalResponse = await client.responses.create({
    model: process.env.AI_MODEL,
    // Same assistant, now told the turns are gone.
    instructions: finalAnswerSystemPrompt,
    // The same accumulated history, so every tool result is still in view.
    input: inputContext,
    // Keep the same tool definitions in the request while forbidding new calls.
    tools: availableTools(false),
    // tool_choice: "none" is what guarantees text instead of another tool call.
    tool_choice: "none",
  }, requestOptions);

  // Keep the forced final answer in the history, like every other output turn.
  inputContext.push(...finalResponse.output);

  return {
    swapAgentResponse: finalResponse.output_text,
    contextHistory: compactContextHistory(inputContext)
  }
}

async function runTool(toolCall) {
  // Parse the tool's JSON arguments.
  const toolInput = JSON.parse(toolCall.arguments);

  try {
    // Run the store function for the tool the model requested.
    if (toolCall.name === "search_swaps") {
      return await searchSwaps(toolInput);
    }

    if (toolCall.name === "check_health") {
      return await checkHealth(toolInput);
    }

  } catch (error) {
    // If the tool call failed, return an error result the model can read.
    return {
      status: "error",
      retryable: false,
      message: error.message,
    };
  }

  // If the model requested a tool that doesn't exist, return an error result.
  return {
    status: "error",
    retryable: false,
    message: "Unknown tool",
  };
}
