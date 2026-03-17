import { commands, field, object, program, help } from "configliere";
import packageJSON from "../package.json" with { type: "json" };
import { type } from "arktype";
import { scope, player } from "../lib/protocols.ts";
import { combine } from "../mod.ts";
import type { ParsedConfig } from "./types.ts";

export const inspector = combine.protocols(scope.protocol, player.protocol);

const commandBase = object({
  out: {
    description: "write out the response to a file",
    ...field(type("string | undefined"), field.default(undefined)),
  },
  host: {
    description: "inspector base URL (overrides default)",
    ...field(type("string"), field.default("http://localhost:41000")),
  },
});
type InspectorProtocolCommandBase = Record<
  keyof typeof inspector.methods,
  { description: string } & typeof commandBase
>;
const inspectorProtocolEntries = (
  Object.keys(inspector.methods) as (keyof typeof inspector.methods)[]
).reduce((base, current) => {
  base[current] = {
    description: `/${current} API`,
    ...commandBase,
  };
  return base satisfies InspectorProtocolCommandBase;
}, {} as InspectorProtocolCommandBase);

const protocolCommands = commands(inspectorProtocolEntries);

export type ProtocolCommandConfig = ParsedConfig<typeof protocolCommands>;

const runBase = object({
  // TODO this throws an error if we have a remainder of more than one arg,
  // which is a problem for the `run` command since we want to support passing
  // through args to the program being run.
  // entrypoint: {
  //   description: "entrypoint file",
  //   ...field(type("string"), cli.argument()),
  // },
  inspectRecord: {
    description: "write inspector recording to the given file",
    ...field(type("string | undefined"), field.default(undefined)),
  },
  inspectRuntime: {
    description:
      "which JavaScript runtime to launch (node, deno, bun).\n" +
      "If omitted we infer from the executable that invoked the CLI",
    ...field(type("'node'|'deno'|'bun'"), field.default("node")),
  },
  inspectPause: {
    description: "start program paused until resumed by inspector",
    ...field(type("boolean"), field.default(false)),
  },
  inspectPort: {
    description: "port number to give to the inspector loader",
    ...field(type("number"), field.default(41000)),
  },
  inspectPackage: {
    description: "package spec to preload/import/require (defaults to @effectionx/inspector)",
    ...field(type("string"), field.default("@effectionx/inspector")),
  },
  import: {
    description: "tracking loader passed in from the user",
    ...field(type("string[]"), field.array(), field.default([])),
  },
  preload: {
    description: "tracking loader passed in from the user",
    ...field(type("string[]"), field.array(), field.default([])),
  },
  require: {
    description: "tracking loader passed in from the user",
    aliases: ["-r"],
    ...field(type("string[]"), field.array(), field.default([])),
  },
});

export const config = program({
  name: "inspector",
  version: packageJSON.version,
  config: commands(
    {
      help,
      ui: {
        description: "start up the inspector UI",
        ...object({
          inspectPort: {
            description: "port number to give to the inspector loader",
            ...field(type("number"), field.default(41000)),
          },
        }),
      },
      call: {
        description: "invoke a inspector protocol method directly (low level)",
        aliases: ["c"],
        ...protocolCommands,
      },
      run: {
        description: "inspect a CLI program",
        ...runBase,
      },
    },
    { default: "run" },
  ),
});

export type RunConfig = ParsedConfig<typeof runBase>;
