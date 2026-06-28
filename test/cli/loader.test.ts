import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSuiteFile, resolveSuiteFiles } from "../../src/cli/loader.js";

describe("loadSuiteFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evalkit-loader-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("loads a .ts file that exports a suite", async () => {
    const filePath = path.join(tmpDir, "suite.ts");
    fs.writeFileSync(
      filePath,
      `
      export default {
        run: async () => ({
          suite: 'test',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          cases: [],
          summary: { total: 0, passed: 0, failed: 0, errored: 0, passRate: 0, byScorer: {}, avgLatencyMs: 0 },
        }),
      };
      `,
    );
    const suites = await loadSuiteFile(filePath);
    expect(suites).toHaveLength(1);
    expect(suites[0]).toHaveProperty("run");
  });

  it("loads a file that exports an array of suites", async () => {
    const filePath = path.join(tmpDir, "multi.ts");
    const mockSuite = `{ run: async () => ({ suite: 'test', startedAt: '', finishedAt: '', cases: [], summary: { total: 0, passed: 0, failed: 0, errored: 0, passRate: 0, byScorer: {}, avgLatencyMs: 0 } }) }`;
    fs.writeFileSync(filePath, `export default [${mockSuite}, ${mockSuite}];`);
    const suites = await loadSuiteFile(filePath);
    expect(suites).toHaveLength(2);
  });

  it("throws on missing file", async () => {
    await expect(loadSuiteFile("/nonexistent/file.ts")).rejects.toThrow("File not found");
  });

  it("throws on invalid export (no default export)", async () => {
    const filePath = path.join(tmpDir, "bad.ts");
    fs.writeFileSync(filePath, "export const foo = 42;");
    await expect(loadSuiteFile(filePath)).rejects.toThrow("must export a Suite or Suite[]");
  });

  it("throws on invalid export (default is not a suite)", async () => {
    const filePath = path.join(tmpDir, "not-suite.ts");
    fs.writeFileSync(filePath, "export default 42;");
    await expect(loadSuiteFile(filePath)).rejects.toThrow("must export a Suite or Suite[]");
  });
});

describe("resolveSuiteFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evalkit-resolve-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("resolves direct file paths", () => {
    const file1 = path.join(tmpDir, "a.ts");
    const file2 = path.join(tmpDir, "b.ts");
    fs.writeFileSync(file1, "");
    fs.writeFileSync(file2, "");
    const files = resolveSuiteFiles([file1, file2]);
    expect(files).toHaveLength(2);
    expect(files).toContain(file1);
    expect(files).toContain(file2);
  });

  it("resolves glob patterns", () => {
    const suiteDir = path.join(tmpDir, "suites");
    fs.mkdirSync(suiteDir);
    fs.writeFileSync(path.join(suiteDir, "a.ts"), "");
    fs.writeFileSync(path.join(suiteDir, "b.ts"), "");
    fs.writeFileSync(path.join(suiteDir, "c.js"), "");
    const files = resolveSuiteFiles([path.join(suiteDir, "*.ts")]);
    expect(files).toHaveLength(2);
  });

  it("throws on empty result", () => {
    expect(() => resolveSuiteFiles([path.join(tmpDir, "*.xyz")])).toThrow("No suite files found");
  });
});
