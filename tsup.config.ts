import { defineConfig } from "tsup";

export default defineConfig([
  // Library build
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "node22",
    outDir: "dist",
  },
  // CLI build
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    banner: { js: "#!/usr/bin/env node" },
    target: "node22",
    outDir: "dist",
    clean: false,
  },
]);
