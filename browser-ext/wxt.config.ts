import { defineConfig } from "wxt";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { join, dirname, resolve } from "node:path";

const shoelaceIcons = join(
  dirname(import.meta.resolve("@shoelace-style/shoelace")),
  "assets/icons",
).replace(/^file:/, "");

export default defineConfig({
  runner: {
    chromiumProfile: join(import.meta.dirname, ".wxt/chrome-data"),
    keepProfileChanges: true,
    chromiumPref: {
      devtools: {
        preferences: {
          currentDockState: "\"bottom\"",
          "inspector-view.split-view-state": "{\"horizontal\":{\"size\":700}}",
        },
      },
      session: {
        restore_on_startup: 1,
      },
      profile: {
        exit_type: "Normal",
      },
    },
  },
  manifest: {
    name: "Effection Inspector",
    description: "Inspect Effection scopes in web applications",
    icons: {
      16: "icon/icon-16.png",
      48: "icon/icon-48.png",
      128: "icon/icon-128.png",
    },
  },
  vite: () => ({
    resolve: {
      alias: {
        "~lib": resolve(import.meta.dirname, "..", "lib"),
      },
    },
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "@b9g/crank",
    },
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: join(shoelaceIcons, "*.svg"),
            dest: "shoelace/assets/icons",
          },
        ],
      }),
    ],
  }),
});
