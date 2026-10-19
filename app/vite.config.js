import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En production, le site est servi par GitHub Pages sous /boomsport-suivi/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/boomsport-suivi/" : "/",
}));
