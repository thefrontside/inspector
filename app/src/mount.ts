import "./global.css";

import { createElement } from "@b9g/crank";
import { renderer } from "@b9g/crank/dom";
import { setBasePath } from "@shoelace-style/shoelace";
import type { RouterHistory } from "@nano-router/history";
import { createRouter } from "./router.ts";
import { App } from "./app.tsx";

import "@shoelace-style/shoelace/dist/themes/light.css";
import "@shoelace-style/shoelace/dist/themes/dark.css";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/icon/icon.js";
import "@shoelace-style/shoelace/dist/components/tree/tree.js";
import "@shoelace-style/shoelace/dist/components/tree-item/tree-item.js";
import "@shoelace-style/shoelace/dist/components/split-panel/split-panel.js";
import "@shoelace-style/shoelace/dist/components/card/card.js";
import "@shoelace-style/shoelace/dist/components/badge/badge.js";
import "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js";
import "@shoelace-style/shoelace/dist/components/alert/alert.js";

export interface RenderAppOptions {
  history: RouterHistory;
  element: Element;
  shoelaceBasePath?: string;
  basePath?: string;
}

export function renderApp(options: RenderAppOptions): void {
  const { history, element, shoelaceBasePath, basePath } = options;

  if (shoelaceBasePath) {
    setBasePath(shoelaceBasePath);
  }

  const router = createRouter(history, basePath);

  renderer.render(createElement(App, { router }), element);
}
