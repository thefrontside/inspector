import { describe, it } from "@effectionx/bdd";
import assert from "node:assert/strict";
import { buildProcessOptions } from "../cli/build-run-args.ts";
import { config } from "../cli/config.ts";

function parseRunArgs(raw: string[]) {
  const parser = config.createParser({ args: raw, envs: [] });
  assert.equal(parser.type, "main");
  const result = parser.parse();
  assert.ok(result.ok, `failed to parse: ${JSON.stringify(result, null, 2)}`);
  const { value, remainder, data } = result;
  assert.equal(value.name, "run");
  return { config: value.config, remainder: remainder.args ?? [], data };
}

describe("generate loader env", () => {
  it("builds an environment with INSPECT_PAUSE", function* () {
    const { config } = parseRunArgs(["run", "--inspect-pause", "file.js"]);
    let { env } = buildProcessOptions("node", config, []);
    assert.equal(env?.INSPECT_PAUSE, "1");
  });

  it("does not set INSPECT_PAUSE when not requested", function* () {
    const { config } = parseRunArgs(["run", "file.js"]);
    let { env } = buildProcessOptions("node", config, []);
    assert.equal(env?.INSPECT_PAUSE, undefined);
  });

  it("sets INSPECT_PORT when non-default", function* () {
    const { config } = parseRunArgs(["run", "--inspect-port", "42001", "file.js"]);
    let { env } = buildProcessOptions("node", config, []);
    assert.equal(env?.INSPECT_PORT, "42001");
  });

  it("does not set INSPECT_PORT when port is default", function* () {
    const { config } = parseRunArgs(["run", "file.js"]);
    let { env } = buildProcessOptions("node", config, []);
    assert.equal(env?.INSPECT_PORT, undefined);
  });

  it("throws on no entrypoint", function* () {
    // note that the CLI should prevent this from happening
    assert.throws(() => parseRunArgs([]));
  });
});

describe("generate loader args", () => {
  describe("node runtime", () => {
    it("basic", function* () {
      const { config, remainder } = parseRunArgs(["run", "program.js"]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "program.js"]);
    });

    it("does not duplicate import if already present", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--import",
        "@effectionx/inspector",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "foo.js"]);
    });

    it("handles --import= style", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--import=@effectionx/inspector",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "foo.js"]);
    });

    it("treats imports containing '@effectionx/inspector' as present", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--import=@effectionx/inspector-preview",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, ["--import", "@effectionx/inspector-preview", "foo.js"]);

      const second = parseRunArgs(["run", "--import", "@effectionx/inspector-beta", "foo.js"]);
      const { arguments: secondArgs } = buildProcessOptions(
        "node",
        second.config,
        second.remainder,
      );
      assert.deepEqual(secondArgs, ["--import", "@effectionx/inspector-beta", "foo.js"]);
    });

    it("uses custom inspector package name", function* () {
      const pkg = "@effectionx/inspector-preview";
      const first = parseRunArgs(["run", "--inspect-package", pkg, "script.js"]);
      const { arguments: args } = buildProcessOptions("node", first.config, first.remainder);
      assert.deepEqual(args, ["--import", pkg, "script.js"]);

      const second = parseRunArgs(["run", "--inspect-package", pkg, "--import", pkg, "script.js"]);
      const { arguments: secondArgs } = buildProcessOptions(
        "node",
        second.config,
        second.remainder,
      );
      assert.deepEqual(secondArgs, ["--import", pkg, "script.js"]);
    });

    it("handles multiple import options passing through", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--import",
        "@effectionx/inspector",
        "--import",
        "other-loader.js",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, [
        "--import",
        "@effectionx/inspector",
        "--import",
        "other-loader.js",
        "foo.js",
      ]);
    });

    it("handles only other import option passing through", function* () {
      const { config, remainder } = parseRunArgs(["run", "--import", "other-loader.js", "foo.js"]);
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, [
        "--import",
        "@effectionx/inspector",
        "--import",
        "other-loader.js",
        "foo.js",
      ]);
    });

    it("direct handling of npx", function* () {
      const { config, remainder } = parseRunArgs(
        [
          "npx",
          "@effectionx/inspector",
          "--inspect-record",
          "out.json",
          "--import=tsx",
          "./example/concurrency-example.ts",
        ].slice(2), // as passed,
        // but also `npx @effectionx/inspector` is translated to `node .bin**` both of which we drop
      );
      const { arguments: args } = buildProcessOptions("node", config, remainder);
      assert.deepEqual(args, [
        "--import",
        "@effectionx/inspector",
        "--import",
        "tsx",
        "./example/concurrency-example.ts",
      ]);
    });
  });

  describe("deno runtime", () => {
    const baseArgs = ["run", "--allow-run=deno"];

    it("basic", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--inspect-runtime",
        "deno",
        "program.ts",
      ]);
      assert.deepEqual(
        buildProcessOptions("deno", config, remainder).arguments,
        baseArgs.concat(["--preload", "npm:@effectionx/inspector", "program.ts"]),
      );
    });

    it("does not duplicate preload option", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--preload",
        "npm:@effectionx/inspector",
        "foo.ts",
      ]);
      assert.deepEqual(
        buildProcessOptions("deno", config, remainder).arguments,
        baseArgs.concat(["--preload", "npm:@effectionx/inspector", "foo.ts"]),
      );
    });

    it("handles preload= style option", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--preload=npm:@effectionx/inspector",
        "foo.ts",
      ]);
      assert.deepEqual(
        buildProcessOptions("deno", config, remainder).arguments,
        baseArgs.concat(["--preload", "npm:@effectionx/inspector", "foo.ts"]),
      );
    });

    it("treats preload options containing '@effectionx/inspector' as present", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--preload=https://esm.sh/pr/@effectionx/inspector@next",
        "foo.ts",
      ]);
      assert.deepEqual(
        buildProcessOptions("deno", config, remainder).arguments,
        baseArgs.concat(["--preload", "https://esm.sh/pr/@effectionx/inspector@next", "foo.ts"]),
      );
    });

    it("uses custom inspector package name for deno with npm: prefix", function* () {
      const pkg = "@effectionx/inspector-preview";
      const { config, remainder } = parseRunArgs(["run", "--inspect-package", pkg, "program.ts"]);
      assert.deepEqual(
        buildProcessOptions("deno", config, remainder).arguments,
        baseArgs.concat(["--preload", `npm:${pkg}`, "program.ts"]),
      );
    });

    it("handles multiple preload options passing through", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--preload",
        "@effectionx/inspector",
        "--preload",
        "other-loader.js",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("deno", config, remainder);
      assert.deepEqual(
        args,
        baseArgs.concat([
          "--preload",
          "@effectionx/inspector",
          "--preload",
          "other-loader.js",
          "foo.js",
        ]),
      );
    });

    it("handles only other preload option passing through", function* () {
      const { config, remainder } = parseRunArgs(["run", "--preload", "other-loader.js", "foo.js"]);
      const { arguments: args } = buildProcessOptions("deno", config, remainder);
      assert.deepEqual(
        args,
        baseArgs.concat([
          "--preload",
          `npm:@effectionx/inspector`,
          "--preload",
          "other-loader.js",
          "foo.js",
        ]),
      );
    });
  });

  describe("bun runtime", () => {
    it("basic", function* () {
      const { config, remainder } = parseRunArgs(["run", "--inspect-runtime", "bun", "program.js"]);
      assert.deepEqual(buildProcessOptions("bun", config, remainder).arguments, [
        "--require",
        "@effectionx/inspector",
        "program.js",
      ]);
    });

    it("does not duplicate require flag", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--require",
        "@effectionx/inspector",
        "foo.js",
      ]);
      assert.deepEqual(buildProcessOptions("bun", config, remainder).arguments, [
        "--require",
        "@effectionx/inspector",
        "foo.js",
      ]);

      const second = parseRunArgs(["run", "-r", "@effectionx/inspector", "foo.js"]);
      assert.deepEqual(buildProcessOptions("bun", second.config, second.remainder).arguments, [
        "--require",
        "@effectionx/inspector",
        "foo.js",
      ]);
    });

    it("treats require flags containing '@effectionx/inspector' as present", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--require",
        "@effectionx/inspector-preview",
        "foo.js",
      ]);
      assert.deepEqual(buildProcessOptions("bun", config, remainder).arguments, [
        "--require",
        "@effectionx/inspector-preview",
        "foo.js",
      ]);

      const second = parseRunArgs(["run", "-r", "@effectionx/inspector-beta", "foo.js"]);
      assert.deepEqual(buildProcessOptions("bun", second.config, second.remainder).arguments, [
        "--require",
        "@effectionx/inspector-beta",
        "foo.js",
      ]);
    });

    it("handles multiple require options passing through", function* () {
      const { config, remainder } = parseRunArgs([
        "run",
        "--require",
        "@effectionx/inspector",
        "--require",
        "other-loader.js",
        "foo.js",
      ]);
      const { arguments: args } = buildProcessOptions("bun", config, remainder);
      assert.deepEqual(args, [
        "--require",
        "@effectionx/inspector",
        "--require",
        "other-loader.js",
        "foo.js",
      ]);
    });

    it("handles only other require option passing through", function* () {
      const { config, remainder } = parseRunArgs(["run", "--require", "other-loader.js", "foo.js"]);
      const { arguments: args } = buildProcessOptions("bun", config, remainder);
      assert.deepEqual(args, [
        "--require",
        "@effectionx/inspector",
        "--require",
        "other-loader.js",
        "foo.js",
      ]);
    });
  });
});
