import type { ExecOptions } from "@effectionx/process";
import process from "node:process";
import type { RunConfig } from "./config.ts";

export type Runtime = "node" | "deno" | "bun";

function hasLoaderSpecified(packageName: string) {
  return (args: string[] | undefined) => {
    return !!args && args.some((imp) => imp.includes(packageName));
  };
}

export function buildProcessOptions(
  runtime: Runtime,
  config: RunConfig,
  passthroughArgs: string[],
): ExecOptions {
  let env = { ...process.env } as Record<string, string>;

  if (config.inspectPause) {
    env.INSPECT_PAUSE = "1";
  }
  if (config.inspectPort && config.inspectPort !== 41000) {
    env.INSPECT_PORT = String(config.inspectPort);
  }

  const args = [] as string[];
  if (runtime === "deno") {
    // deno requires the `run` subcommand and permissions
    args.push("run", "--allow-run=deno");
  }

  // we make the assumption that if the user is setting the loader they know which
  // environment is being used and that it is properly passed, e.g. uses `--import` for node

  const hasLoader = hasLoaderSpecified(config.inspectPackage);
  switch (runtime) {
    case "node":
      if (config.preload) {
        throw new Error("preload is not supported for node runtime; use --import instead");
      }
      if (!(hasLoader(config.import) || hasLoader(config.require))) {
        args.push("--import", config.inspectPackage);
      } else {
        const direct = [...(config.import ?? []), ...(config.require ?? [])].flatMap((d) => [
          "--import",
          d,
        ]);
        args.push(...direct);
      }
      break;
    case "deno":
      if (config.import || config.require) {
        throw new Error("preload is not supported for deno runtime; use --preload instead");
      }
      if (!hasLoader(config.preload)) {
        args.push("--preload", `npm:${config.inspectPackage}`);
      } else {
        const direct = [...(config.preload ?? [])].flatMap((d) => ["--preload", d]);
        args.push(...direct);
      }
      break;
    case "bun":
      if (config.import || config.preload) {
        throw new Error("preload is not supported for bun runtime; use --require instead");
      }
      if (!hasLoader(config.require)) {
        args.push("--require", config.inspectPackage);
      } else {
        const direct = [...(config.require ?? [])].flatMap((d) => ["--require", d]);
        args.push(...direct);
      }
      break;
  }

  if (passthroughArgs) {
    args.push(...passthroughArgs.filter((arg) => arg !== "--"));
  }

  return { arguments: args, env };
}

/**
 * Determine which runtime should be used for execution.  Explicit `runtime`
 * configuration takes precedence; otherwise we try to guess from `process.execPath`.
 *
 * Most invocations occur through `npx`/`pnpx` which itself is a Node process,
 * hence the default is still "node".  If the executable name contains
 * "deno" or "bun" we return the corresponding runtime.
 */
export function resolveRuntime(config: RunConfig): Runtime {
  if (config.inspectRuntime) {
    return config.inspectRuntime as Runtime;
  }
  let exec = process.execPath;
  if (exec.includes("deno")) {
    return "deno";
  }
  if (exec.includes("bun")) {
    return "bun";
  }
  return "node";
}
