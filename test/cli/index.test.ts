import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli/index.js";

describe("parseCliArgs", () => {
  it("parses run command with file args", () => {
    const result = parseCliArgs(["run", "./suite.ts"]);
    expect(result.command).toBe("run");
    expect(result.files).toEqual(["./suite.ts"]);
  });

  it("parses run command with multiple files", () => {
    const result = parseCliArgs(["run", "./a.ts", "./b.ts"]);
    expect(result.command).toBe("run");
    expect(result.files).toEqual(["./a.ts", "./b.ts"]);
  });

  it("parses --reporter flag", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--reporter", "json"]);
    expect(result.flags.reporter).toBe("json");
  });

  it("parses short flags", () => {
    const result = parseCliArgs(["run", "./suite.ts", "-r", "json", "-v"]);
    expect(result.flags.reporter).toBe("json");
    expect(result.flags.verbose).toBe(true);
  });

  it("parses --threshold", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--threshold", "0.8"]);
    expect(result.flags.threshold).toBe(0.8);
  });

  it("parses --config", () => {
    const result = parseCliArgs(["run", "--config", "evalkit.config.ts"]);
    expect(result.flags.config).toBe("evalkit.config.ts");
  });

  it("parses --version", () => {
    const result = parseCliArgs(["--version"]);
    expect(result.command).toBe("version");
  });

  it("parses --help", () => {
    const result = parseCliArgs(["--help"]);
    expect(result.command).toBe("help");
  });

  it("defaults to help with no args", () => {
    const result = parseCliArgs([]);
    expect(result.command).toBe("help");
  });

  it("parses --fail-on-error", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--fail-on-error"]);
    expect(result.flags.failOnError).toBe(true);
  });

  it("parses --output", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--output", "results.json"]);
    expect(result.flags.output).toBe("results.json");
  });

  it("parses --baseline flag", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--baseline", "baseline.json"]);
    expect(result.flags.baseline).toBe("baseline.json");
  });

  it("parses --baseline short flag -b", () => {
    const result = parseCliArgs(["run", "./suite.ts", "-b", "baseline.json"]);
    expect(result.flags.baseline).toBe("baseline.json");
  });

  it("parses --regression-tolerance flag", () => {
    const result = parseCliArgs(["run", "./suite.ts", "--regression-tolerance", "0.05"]);
    expect(result.flags.regressionTolerance).toBe(0.05);
  });

  it("baseline is undefined when not provided", () => {
    const result = parseCliArgs(["run", "./suite.ts"]);
    expect(result.flags.baseline).toBeUndefined();
  });

  it("regressionTolerance is undefined when not provided", () => {
    const result = parseCliArgs(["run", "./suite.ts"]);
    expect(result.flags.regressionTolerance).toBeUndefined();
  });
});
