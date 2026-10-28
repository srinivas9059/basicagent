const requiredEnvironmentVariables = [
  "AI_KEY",
  "AI_MODEL",
  "AI_URL"
];
const optionalEnvironmentVariables = [
  "GITHUB_TOKEN"
];
const missingEnvironmentVariables = () =>
  requiredEnvironmentVariables.filter((name) => !process.env[name]);

const runningInWebContainer = Boolean(process.env.WEBCONTAINER);
let createdEnvironmentFile = false;

if (missingEnvironmentVariables().length && !runningInWebContainer) {
  const environmentFile = new URL(".env", import.meta.url);
  const { loadEnvFile } = await import("node:process");

  if (typeof loadEnvFile !== "function") {
    throw new Error("Local environment loading requires Node.js 20.12 or newer.");
  }

  try {
    loadEnvFile(environmentFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    const { writeFile } = await import("node:fs/promises");
    const template = [...requiredEnvironmentVariables, ...optionalEnvironmentVariables]
      .map((name) => `${name}=`)
      .join("\n");

    try {
      await writeFile(environmentFile, `${template}\n# PORT=3001\n`, { flag: "wx" });
      createdEnvironmentFile = true;
    } catch (writeError) {
      if (!["EACCES", "EEXIST", "EROFS"].includes(writeError.code)) throw writeError;
    }
  }
}

const missing = missingEnvironmentVariables();

if (missing.length) {
  const guidance = [
    `Missing environment variables: ${missing.join(", ")}.`,
    runningInWebContainer
      ? "Open Scrimba Settings → Edit Environment Variables and add them."
      : createdEnvironmentFile
        ? "Created .env with the required variable names. Complete it, then restart the app."
        : "Complete the .env file in this project, then restart the app.",
    "Setup guide: https://docs.scrimba.com/ai-agents/running-locally",
  ];
  throw new Error(guidance.join("\n"));
}

console.log("Environment check:");
for (const name of requiredEnvironmentVariables) {
  if (name === "AI_URL" || name === "AI_MODEL") console.log(`✓ ${name}:`, process.env[name]);
  else console.log(`✓ ${name}: configured`);
}

if (optionalEnvironmentVariables.length) {
  const configuredOptional = optionalEnvironmentVariables.filter((name) => process.env[name]);
  const missingOptional = optionalEnvironmentVariables.filter((name) => !process.env[name]);
  if (configuredOptional.length) {
    console.log(`✓ Optional environment: ${configuredOptional.join(", ")}`);
  }
  if (missingOptional.length) {
    console.warn(`○ Optional environment not configured: ${missingOptional.join(", ")}`);
  }
}
