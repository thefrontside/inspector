import { global, useAttributes } from "effection";
import { api } from "effection/experimental";
import { combine } from "./mod.ts";
import { scope } from "./lib/implementations/scope.ts";
import { player } from "./lib/implementations/player.ts";
import { attach } from "./lib/attach.ts";
import { useSSEServer } from "./lib/sse-server.ts";
import { pause } from "./lib/implementations/player.ts";
import packageJSON from "./package.json" with { type: "json" };

const inspector = combine.inspectors(scope, player);

global.around(api.Main, {
  main([body], next) {
    return next(function* (args) {
      yield* useAttributes({ name: "Main", args: args.join(" ") });

      let detach = yield* attach(global, inspector, function* (handle) {
        let port = process.env.INSPECT_PORT ? Number(process.env.INSPECT_PORT) : 41000;
        let address = yield* useSSEServer(handle, { port });

        let { version } = packageJSON;
        process.stderr.write(
          `effection inspector@${version} running at ${address}/live\n` +
            `inspect the running program using \`npx @effectionx/inspector call *\` or other CLI commands`,
        );
      });

      try {
        // pause indicated by environment variable rather than CLI argument
        if (process.env.INSPECT_PAUSE === "1") {
          process.stderr.write(
            "inspector attached and main() waiting to start; use 'play' button at /live to start execution",
          );
          yield* pause();
        }

        yield* body(args);
      } finally {
        yield* detach();
        process.stderr.write("detached, inspector shut down");
      }
    });
  },
});
