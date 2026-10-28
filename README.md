# OpenSwap local setup

Run `npm install` and `npm start`, then open the URL shown by Vite.

Configure `.env` with `AI_KEY`, `AI_MODEL`, and `AI_URL` for the model provider. `GITHUB_TOKEN` is optional for higher GitHub API limits.

With Groq's `openai/gpt-oss-120b` or `openai/gpt-oss-20b`, the agent can use Groq's built-in browser search for current web checks. This works through the existing `AI_KEY` and `AI_URL`; no separate search key is needed. Other providers or models continue with the local catalog and GitHub checks. Groq documentation: https://console.groq.com/docs/responses-api#browser-search-example

Run `npm run build` to verify the frontend build.
