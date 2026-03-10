import { commands, field, object, program, help } from "configliere";
import packageJSON from "../package.json" with { type: "json" };
import { type } from "arktype";
import { scope, player } from "../lib/protocols.ts";
import { combine } from "../mod.ts";

export const inspector = combine.protocols(scope.protocol, player.protocol);
const inspectorProtocolEntries = (
  Object.keys(inspector.methods) as (keyof typeof inspector.methods)[]
).reduce(
  (base, current) => {
    base[current] = {
      description: `/${current} API`,
      ...object({
        out: {
          description: "write out the response to a file",
          ...field(type("string | undefined"), field.default(undefined)),
        },
        host: {
          description: "inspector base URL (overrides default)",
          ...field(type("string"), field.default("http://localhost:41000")),
        },
      }),
    };
    return base;
  },
  {} as Record<keyof typeof inspector.methods, {}>,
);

const protocolCommands = commands(inspectorProtocolEntries);
export type ProtocolCommands = typeof protocolCommands;

export const config = program({
  name: "inspector",
  version: packageJSON.version,
  config: commands(
    {
      help,
      ui: {
        description: "start up the inspector UI",
      },
      call: {
        description: "invoke a inspector protocol method directly (low level)",
        aliases: ["c"],
        ...protocolCommands,
      },
      run: {
        description: "inspect a CLI program",
        ...object({
          inspectPause: {
            description: "start program paused until resumed by inspector",
            ...field(type("boolean"), field.default(false)),
          },
          inspectRecord: {
            description: "write inspector recording to the given file",
            ...field(type("string | undefined"), field.default(undefined)),
          },
          host: {
            description: "inspector base URL (overrides default)",
            ...field(type("string"), field.default("http://localhost:41000")),
          },
          runtime: {
            description:
              "which JavaScript runtime to launch (node, deno, bun).\n" +
              "If omitted we infer from the executable that invoked the CLI",
            ...field(type("string"), field.default("node")),
          },
        }),
      },
    },
    { default: "run" },
  ),
});
