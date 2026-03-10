import { describe, it } from "@effectionx/bdd";
import assert from "node:assert/strict";
import { buildNodeArguments } from "../cli/build-run-args.ts";

describe("buildNodeArguments", () => {
  it("basic", function* () {
    let args = buildNodeArguments(
      {
        inspectPause: false,
        inspectRecord: undefined,
        host: "http://localhost",
      },
      ["program.js"],
    );
    assert.deepEqual(args, ["--import", "@effectionx/inspector", "program.js"]);
  });

  it("does not duplicate import flag if already present", function* () {
    let args = buildNodeArguments(
      {
        inspectPause: false,
        inspectRecord: undefined,
        host: "http://localhost",
      },
      ["--import", "@effectionx/inspector", "foo.js"],
    );
    assert.deepEqual(args, ["--import", "@effectionx/inspector", "foo.js"]);
  });

  it("handles --import= style flag", function* () {
    let args = buildNodeArguments(
      {
        inspectPause: false,
        inspectRecord: undefined,
        host: "http://localhost",
      },
      ["--import=@effectionx/inspector", "foo.js"],
    );
    assert.deepEqual(args, ["--import=@effectionx/inspector", "foo.js"]);
  });

  it("prepends runtime --suspend when pause requested", function* () {
    let args = buildNodeArguments(
      {
        inspectPause: true,
        inspectRecord: undefined,
        host: "http://localhost",
      },
      ["script.js"],
    );
    assert.deepEqual(args, [
      "--import",
      "@effectionx/inspector",
      "script.js",
      "--suspend",
    ]);
  });

  it("strips leading -- separator from passthrough arguments", function* () {
    let args = buildNodeArguments(
      {
        inspectPause: false,
        inspectRecord: undefined,
        host: "http://localhost",
      },
      ["--", "--foo", "bar.js"],
    );
    assert.deepEqual(args, [
      "--import",
      "@effectionx/inspector",
      "--foo",
      "bar.js",
    ]);
  });
});
