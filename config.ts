import { commands, field, object, program, help } from "configliere";
import packageJSON from "./package.json" with { type: "json" };
import { type } from "arktype";

export const config = program({
  name: "inspector",
  version: packageJSON.version,
  config: commands({
    help,
    ui: {
      description: "start up the inspector UI"
    },
    call: {
      description: "invoke a inspector protocol method directly (low level)"
    },
    run: {
      description: "inspect a CLI program",
      ...object({
        inspectWatchScopes: {
          description: "track scopes and print them to STDERR",
          ...field(type("boolean"), field.default(false)),
        }
      })
    }
  }, { default: "run" }),
})
