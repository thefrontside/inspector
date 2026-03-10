import { describe, it } from "@effectionx/bdd";
import assert from "node:assert/strict";
import { buildRuntimeArguments, buildRunEnvironment } from "../cli/build-run-args.ts";

describe("buildRuntimeArguments", () => {
  describe("node runtime", () => {
    it("basic", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["program.js"],
      );
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "program.js"]);
    });

    it("does not duplicate import if already present", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["--import", "@effectionx/inspector", "foo.js"],
      );
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "foo.js"]);
    });

    it("handles --import= style", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["--import=@effectionx/inspector", "foo.js"],
      );
      assert.deepEqual(args, ["--import=@effectionx/inspector", "foo.js"]);
    });

    it("treats imports containing '@effectionx/inspector' as present", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["--import=@effectionx/inspector-preview", "foo.js"],
      );
      assert.deepEqual(args, ["--import=@effectionx/inspector-preview", "foo.js"]);

      args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["--import", "@effectionx/inspector-beta", "foo.js"],
      );
      assert.deepEqual(args, ["--import", "@effectionx/inspector-beta", "foo.js"]);
    });

    it("strips leading -- separator from passthrough arguments", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["--", "--foo", "bar.js"],
      );
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "--foo", "bar.js"]);
    });
  });

  describe("deno runtime", () => {
    it("basic", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["program.ts"],
      );
      assert.deepEqual(args, ["run", "--preload", "npm:@effectionx/inspector", "program.ts"]);
    });

    it("does not duplicate preload option", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["--preload", "npm:@effectionx/inspector", "foo.ts"],
      );
      assert.deepEqual(args, ["run", "--preload", "npm:@effectionx/inspector", "foo.ts"]);
    });

    it("handles preload= style option", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["--preload=npm:@effectionx/inspector", "foo.ts"],
      );
      assert.deepEqual(args, ["run", "--preload=npm:@effectionx/inspector", "foo.ts"]);
    });

    it("treats preload options containing '@effectionx/inspector' as present", function* () {
      // this covers the common case where users import a preview build via
      // esm.sh or a similar CDN that embeds the package name in the URL.
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["--preload=https://esm.sh/pr/@effectionx/inspector@next", "foo.ts"],
      );
      assert.deepEqual(args, [
        "run",
        "--preload=https://esm.sh/pr/@effectionx/inspector@next",
        "foo.ts",
      ]);

      args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["--preload", "npm:@effectionx/inspector-beta", "foo.ts"],
      );
      assert.deepEqual(args, ["run", "--preload", "npm:@effectionx/inspector-beta", "foo.ts"]);
    });

    it("strips leading -- separator", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "deno",
        },
        ["--", "--foo", "bar.ts"],
      );
      assert.deepEqual(args, ["run", "--preload", "npm:@effectionx/inspector", "--foo", "bar.ts"]);
    });
  });

  describe("bun runtime", () => {
    it("basic", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["program.js"],
      );
      assert.deepEqual(args, ["--require", "@effectionx/inspector", "program.js"]);
    });

    it("does not duplicate require flag", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["--require", "@effectionx/inspector", "foo.js"],
      );
      assert.deepEqual(args, ["--require", "@effectionx/inspector", "foo.js"]);

      args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["-r", "@effectionx/inspector", "foo.js"],
      );
      assert.deepEqual(args, ["-r", "@effectionx/inspector", "foo.js"]);
    });

    it("treats require/preload flags containing '@effectionx/inspector' as present", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["--require", "@effectionx/inspector-preview", "foo.js"],
      );
      assert.deepEqual(args, ["--require", "@effectionx/inspector-preview", "foo.js"]);

      args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["-r", "@effectionx/inspector-beta", "foo.js"],
      );
      assert.deepEqual(args, ["-r", "@effectionx/inspector-beta", "foo.js"]);
    });

    it("strips leading -- separator", function* () {
      let args = buildRuntimeArguments(
        {
          inspectPause: false,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "bun",
        },
        ["--", "--foo", "bar.js"],
      );
      assert.deepEqual(args, ["--require", "@effectionx/inspector", "--foo", "bar.js"]);
    });
  });

  describe("environment & inference helpers", () => {
    it("builds a child environment with INSPECT_PAUSE when requested", function* () {
      let env = buildRunEnvironment({
        inspectPause: true,
        inspectRecord: undefined,
        inspectHost: "http://localhost",
        inspectRuntime: "node",
      });
      assert.equal(env.INSPECT_PAUSE, "1");

      // if pause not requested the variable should be absent
      let envWithoutPause = buildRunEnvironment({
        inspectPause: false,
        inspectRecord: undefined,
        inspectHost: "http://localhost",
        inspectRuntime: "node",
      });
      assert.equal(envWithoutPause.INSPECT_PAUSE, undefined);
    });

    it("does not add suspend flags when pause requested", function* () {
      // more of a legacy check as it was added previously
      let args = buildRuntimeArguments(
        {
          inspectPause: true,
          inspectRecord: undefined,
          inspectHost: "http://localhost",
          inspectRuntime: "node",
        },
        ["script.js"],
      );
      assert.deepEqual(args, ["--import", "@effectionx/inspector", "script.js"]);
    });
  });
});
