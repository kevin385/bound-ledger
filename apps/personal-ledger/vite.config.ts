import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    nitro: {
      build: {
        rollupOptions: {
          external: ["@bound/evaluation"],
        },
      },
    },
    ssr: {
      build: {
        rollupOptions: {
          external: ["@bound/evaluation"],
        },
      },
    },
  },
  plugins: [tanstackStart({ srcDirectory: "src" }), react(), nitro()],
})
