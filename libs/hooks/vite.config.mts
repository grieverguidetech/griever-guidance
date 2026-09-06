/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
