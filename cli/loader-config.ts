import { field, object } from "configliere";
import { type } from "arktype";

// only used to parse in loader.ts
export const loaderConfig = object({
  inspectPause: {
    description: "start program paused until resumed by inspector",
    ...field(type("boolean"), field.default(false)),
  },
  inspectPort: {
    description: "port number to give to the inspector loader",
    ...field(type("number"), field.default(41000)),
  },
});
