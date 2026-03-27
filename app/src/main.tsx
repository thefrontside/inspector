import { createBrowserHistory } from "@nano-router/history";
import { renderApp } from "./mount.ts";

renderApp({
  shoelaceBasePath: "shoelace/",
  history: createBrowserHistory(),
  element: document.body,
});
