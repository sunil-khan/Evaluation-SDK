import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CliConfig, defineConfig, resolveConfig } from "../../src/cli/config.js";

describe("defineConfig", () => {
  it("returns the config object unchanged", () => {
    const config: CliConfig = { suites: ["./suites/*.ts"] };
    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  it("provides type safety for config properties", () => {
    const config = defineConfig({
      suites: ["./test.ts"],
      reporter: "json",
      verbose: true,
      threshold: 0.8,
      output: "./results.json",
      failOnError: true,
    });
    expect(config.reporter).toBe("json");
    expect(config.threshold).toBe(0.8);
  });
});

describe("resolveConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evalkit-config-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = resolveConfig({ cwd: tmpDir });
    expect(config.reporter).toBe("console");
    expect(config.verbose).toBe(false);
    expect(config.failOnError).toBe(false);
    expect(config.suites).toEqual([]);
  });

  it("merges CLI flags over config file values", () => {
    const config = resolveConfig({
      cwd: tmpDir,
      flags: { reporter: "json", verbose: true, threshold: 0.9 },
    });
    expect(config.reporter).toBe("json");
    expect(config.verbose).toBe(true);
    expect(config.threshold).toBe(0.9);
  });

  it("validates threshold is between 0 and 1", () => {
    expect(() =>
      resolveConfig({ cwd: tmpDir, flags: { threshold: 1.5 } })
    ).toThrow("Threshold must be a number between 0 and 1");
  });

  it("validates reporter is console or json", () => {
    expect(() =>
      resolveConfig({ cwd: tmpDir, flags: { reporter: "xml" as "console" } })
    ).toThrow('Unknown reporter "xml"');
  });
});
