import { global } from "effection";
import { api } from "effection/experimental";
import { combine } from "./mod.ts";
import { scope } from "./lib/implementations/scope.ts";
import { player } from "./lib/implementations/player.ts";
import { withInspector } from "./lib/attach.ts";
import packageJSON from "./package.json" with { type: "json" };
import { loaderConfig } from "./cli/loader-config.ts";

const inspector = combine.inspectors(scope, player);
const config = loaderConfig.parse({
  envs: [{ name: "ENV", value: process.env as Record<string, string> }],
});
let { version } = packageJSON;

if (config.ok) {
  global.around(api.Main, {
    main([body], next) {
      return next(function* (args) {
        return yield* withInspector({ global, inspector, config, version, args }, () => body(args));
      });
    },
  });
} else {
  throw config.error;
}
