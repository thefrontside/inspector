import { Routes, Route, Router } from "@nano-router/router";
import type { RouterHistory } from "@nano-router/history";

export const RouterKey = Symbol.for("inspector.router");

export function createRouter(history: RouterHistory, basePath = ""): Router {
  const base = basePath.replace(/\/+$/, "");

  const routes = new Routes(
    new Route("home", `${base}/`),
    new Route("live", `${base}/live`),
    new Route("demo", `${base}/demo`),
    new Route("recording", `${base}/recording`),
  );

  return new Router({ routes, history });
}

export { type Router };
