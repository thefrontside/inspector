import { commands, field, object, program, help } from "configliere";
import packageJSON from "./package.json" with { type: "json" };
import { type } from "arktype";
import { scope, player } from "./lib/protocols.ts";
import { combine } from "./mod.ts";

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
      }),
    };
    return base;
  },
  {} as Record<keyof typeof inspector.methods, {}>,
);

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
        ...commands(inspectorProtocolEntries),
      },
      run: {
        description: "inspect a CLI program",
        ...object({
          inspectWatchScopes: {
            description: "track scopes and print them to STDERR",
            ...field(type("boolean"), field.default(false)),
          },
        }),
      },
    },
    { default: "run" },
  ),
});
