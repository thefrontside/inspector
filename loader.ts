import process from "node:process";
import { global, useAttributes } from "effection";
import { api } from "effection/experimental";
import { combine } from "./mod.ts";
import { scope } from "./lib/implementations/scope.ts";
import { player } from "./lib/implementations/player.ts";
import { attach } from "./lib/attach.ts";
import { useSSEServer } from "./lib/sse-server.ts";
import { pause } from "./lib/implementations/player.ts";
import packageJSON from "./package.json" with { type: "json" };
import { loaderConfig } from "./cli/loader-config.ts";

const inspector = combine.inspectors(scope, player);
const config = loaderConfig.parse({
  envs: [{ name: "ENV", value: process.env as Record<string, string> }],
});

if (config.ok) {
  global.around(api.Main, {
    main([body], next) {
      return next(function* (args) {
        yield* useAttributes({ name: "Main", args: args.join(" ") });

        let detach = yield* attach(global, inspector, function* (handle) {
          let address = yield* useSSEServer(handle, { port: config.value.inspectPort });

          let { version } = packageJSON;
          process.stderr.write(
            `effection inspector@${version} running at ${address}/live\n` +
              `inspect the running program using \`npx @effectionx/inspector call *\` or other CLI commands`,
          );
        });

        try {
          if (config.value.inspectPause) {
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
} else {
  throw config.error;
}
