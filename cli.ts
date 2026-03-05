import { main } from "effection";
import { config } from "./config.ts";

await main(function*(args) {
  let parser = config.createParser({
    args,
    envs: [{ name: "ENV", value: process.env as Record<string, string> }]
  });

  switch (parser.type) {
    case "help":
    case "version":
      console.log(parser.print());
      break;
    case "main":
      let result = parser.parse();
      if (result.ok) {
        let { value: command } = result;
        switch (command.name) {
          case "help":
            console.log(command.config.text)
            break;
          case "ui":
            console.log('ui');
            break;
          case "call":
            console.log("call");
            break;
          case "run":
            console.log("run", command.config);
            break;
        }
      } else {
        console.error(result.error.message);
      }
  }
});
