import { commands, field, object, program, inject, type ProgramType, constant } from "configliere";
import packageJSON from "../package.json" with { type: "json" };
import { type } from "arktype";
import { type Methods, type Protocol } from "../mod.ts";

export const config = program({
  name: "inspector",
  version: packageJSON.version,
  config: inject((protocol: Protocol<Methods>) => {
    let methods = commands(
      Object.fromEntries(
        Object.keys(protocol.methods).map((name) => [
          name,
          {
            description: `invoke method ${name}`,
            ...object({
              name: constant(name),
              protocol: constant(protocol),
              out: {
                description: "write out the response to a file",
                ...field(type("string | undefined"), field.default(undefined)),
              },
              host: {
                description: "inspector base URL (overrides default)",
                ...field(type("string"), field.default("http://localhost:41000")),
              },
            }),
          },
        ]),
      ),
    );

    return commands(
      {
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
          ...methods,
        },
        run: {
          description: "inspect a CLI program",
          ...object({
            // TODO this throws an error if we have a remainder of more than one arg,
            // which is a problem for the `run` command since we want to support passing
            // through args to the program being run.
            // entrypoint: {
            //   description: "entrypoint file",
            //   ...field(type("string"), cli.argument()),
            // },
            protocol: constant(protocol),
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
              description:
                "package spec to preload/import/require (defaults to @effectionx/inspector)",
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
          }),
        },
      },
      { default: "run" },
    );
  }),
});

export type Program = ProgramType<typeof config>;
