#!/usr/bin/env node
import { main, suspend } from "effection";
import { config } from "./config.ts";
import { call } from "./commands/call.ts";
import { run } from "./commands/run.ts";
import process from "node:process";
import { useSSEServer } from "../lib/sse-server.ts";
import { log } from "./logger.ts";
import { player, scope } from "../lib/protocols.ts";
import { combine } from "../lib/combine.ts";

await main(function* () {
  const parser = config.parse({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    envs: [{ name: "ENV", value: process.env as Record<string, string> }],
  });
  if (!parser.ok) {
    yield* log.info(parser.error);
    return;
  }

  let program = parser.value;

  // TODO: load protocol dynamically
  let protocol = combine.protocols(scope.protocol, player.protocol);

  // get phase 2 parser
  let app = program.config(protocol);

  // parse second phase
  let result = app.parse();

  if (!result.ok) {
    yield* log.error(result.error);
    return;
  }

  if (program.help) {
    yield* log.info(app.help());
    return;
  }

  const command = result.value;

  if (command.help) {
    yield* log.info(command.text);
    return;
  }

  switch (command.name) {
    case "ui": {
      let address = yield* useSSEServer({ protocol: { methods: {} } } as any, {
        port: command.config.inspectPort,
      });
      yield* log.info(`serving inspector UI at ${address}`);
      yield* suspend();
      break;
    }
    case "call": {
      let method = command.config;
      if (method.help) {
        yield* log.info(method.text);
      } else {
        yield* call(method.config);
      }
      break;
    }

    case "run": {
      let { remainder } = result;

      if (!remainder.args || (remainder.args && remainder.args.length === 0)) {
        yield* log.info(app.help({ args: ["run", "--help"] }));
      } else {
        yield* run(command.config, remainder.args);
      }
      break;
    }
    default:
      // An exhaustiveness check using 'never' can be added here
      //const _exhaustiveCheck: never = command;
      break;
  }
});
