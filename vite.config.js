import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /* relative asset paths, so the build works from any sub-path */
  base: "./",
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
});
