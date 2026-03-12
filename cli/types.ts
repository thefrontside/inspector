import type { CommandsParser, ObjectParser } from "configliere";

export type ParsedConfig<T extends CommandsParser | ObjectParser<any>> = Extract<
  ReturnType<T["parse"]>,
  { ok: true }
>["value"];
