import { type RunConfig } from "./config.ts";

export type Runtime = "node" | "deno" | "bun";

function hasInspectorImport(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    // if the user already supplied an import that *includes* the inspector
    // package name anywhere we consider it covered.  this allows preview
    // builds or scoped variants to propagate without forcing us to blindly
    // prepend another copy.
    if (arg === "--import" && args[index + 1]?.includes("@effectionx/inspector")) {
      return true;
    }
    if (
      arg.startsWith("--import=") &&
      arg.slice("--import=".length).includes("@effectionx/inspector")
    ) {
      return true;
    }
  }
  return false;
}

function hasInspectorPreload(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    if (arg === "--preload" && args[index + 1]?.includes("@effectionx/inspector")) {
      return true;
    }
    if (
      arg.startsWith("--preload=") &&
      arg.slice("--preload=".length).includes("@effectionx/inspector")
    ) {
      return true;
    }
  }
  return false;
}

function hasInspectorRequire(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    if (arg === "--require" && args[index + 1]?.includes("@effectionx/inspector")) {
      return true;
    }
    if (
      arg.startsWith("--require=") &&
      arg.slice("--require=".length).includes("@effectionx/inspector")
    ) {
      return true;
    }
    // bun also supports the short form -r
    if (arg === "-r" && args[index + 1]?.includes("@effectionx/inspector")) {
      return true;
    }
  }
  return false;
}

/**
 * Build the command‑line arguments passed to the selected runtime.  The
 * caller is responsible for prefixing with the runtime itself (e.g. "node",
 * "deno", "bun").
 */
export function buildRuntimeArguments(config: RunConfig, passthroughArgs: string[]): string[] {
  let normalizedArgs = passthroughArgs[0] === "--" ? passthroughArgs.slice(1) : passthroughArgs;
  // the configuration parser gives us a plain string; narrow to our known
  // set for switch handling.  Anything unexpected falls through to the
  // default case below which simply forwards the arguments.
  let runtime = resolveRuntime(config);
  let args: string[] = [];

  switch (runtime) {
    case "node":
      if (!hasInspectorImport(normalizedArgs)) {
        args.push("--import", "@effectionx/inspector");
      }
      args.push(...normalizedArgs);
      break;

    case "deno":
      // deno requires the `run` subcommand, and uses `--preload` for the loader
      args.push("run");
      if (!hasInspectorPreload(normalizedArgs)) {
        args.push("--preload", "npm:@effectionx/inspector");
      }
      args.push(...normalizedArgs);
      break;

    case "bun":
      // bun is largely node‑compatible but uses `--require`/`-r` for preloading.
      if (!hasInspectorRequire(normalizedArgs)) {
        args.push("--require", "@effectionx/inspector");
      }
      args.push(...normalizedArgs);
      break;

    default:
      // unknown runtime, just forward everything
      args.push(...normalizedArgs);
  }

  return args;
}

/**
 * Construct the environment object used when spawning the inspected process.
 *
 * By default we inherit the parent environment and add `INSPECT_PAUSE=1` when
 * the user requested a paused start.  This avoids needing a runtime-specific
 * command-line switch and works uniformly across node/deno/bun.
 */
export function buildRunEnvironment(
  config: RunConfig,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  let env: Record<string, string> = {};
  for (let key in baseEnv) {
    let val = baseEnv[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }
  if (config.inspectPause) {
    env.INSPECT_PAUSE = "1";
  }
  return env;
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
