import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.PORT || process.env.PORT || 3001;

  return {
    clearScreen: false,
    logLevel: process.env.WEBCONTAINER ? "warn" : "info",
    server: {
      hmr: false,
      watch: {
        ignored: ["**/*"],
      },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${port}`,
        },
      },
    },
  };
});
