export interface RunConfig {
  inspectPause: boolean;
  inspectRecord: string | undefined;
  host: string;
}
function hasInspectorImport(args: string[]): boolean {
  for (let index = 0; index < args.length; index++) {
    let arg = args[index];
    if (arg === "--import" && args[index + 1] === "@effectionx/inspector") {
      return true;
    }
    if (
      arg.startsWith("--import=") &&
      arg.slice("--import=".length) === "@effectionx/inspector"
    ) {
      return true;
    }
  }
  return false;
}

export function buildNodeArguments(
  config: RunConfig,
  passthroughArgs: string[],
): string[] {
  let normalizedArgs =
    passthroughArgs[0] === "--" ? passthroughArgs.slice(1) : passthroughArgs;

  let runtimeArgs = config.inspectPause ? ["--suspend"] : [];

  let importArgs = hasInspectorImport(normalizedArgs)
    ? []
    : ["--import", "@effectionx/inspector"];

  return [...importArgs, ...normalizedArgs, ...runtimeArgs];
}
