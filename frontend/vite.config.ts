import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "MEALWISE_");
  const target = env.MEALWISE_API_TARGET || "http://127.0.0.1:8000";
  return {
    server: { proxy: { "/api": target } },
    preview: { proxy: { "/api": target } },
  };
});
