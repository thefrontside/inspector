import { createMemoryHistory } from "@nano-router/history";
import { renderApp } from "@inspector/app";

if (browser.devtools.panels.themeName === "dark") {
  document.documentElement.classList.add("sl-theme-dark");
}

renderApp({
  shoelaceBasePath: browser.runtime.getURL("shoelace/"),
  history: createMemoryHistory({ initialEntries: ["/"] }),
  element: document.getElementById("app")!,
});
