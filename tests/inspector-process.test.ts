import { beforeEach, describe, it } from "@effectionx/bdd";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { call, sleep, spawn, until, withResolvers, type Yielded } from "effection";
import { exec } from "@effectionx/process";
import { fs } from "./fs.ts";

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(port);
          }
        });
      } else {
        reject(new Error("unable to determine ephemeral port"));
      }
    });
  });
}

function* startInspector(examplePath: string, outFile: string) {
  let port = yield* call(getAvailablePort);
  let cliScript = join(process.cwd(), "cli", "index.ts");
  let inspectorProc = yield* exec(process.execPath, {
    arguments: [
      cliScript,
      "--inspect-package",
      "./loader.ts",
      "--inspect-port",
      String(port),
      "--inspect-pause",
      "--inspect-record",
      outFile,
      examplePath,
    ],
    cwd: process.cwd(),
    env: { ...(process.env as Record<string, string>), INSPECT_PORT: String(port) },
  });

  const ready = withResolvers<void>();
  let readyResolved = false;
  yield* spawn(function* () {
    let subscription = yield* inspectorProc.stderr;
    let next = yield* subscription.next();
    while (!next.done) {
      const text = new TextDecoder().decode(next.value);
      if (text.includes("running at http://localhost")) {
        readyResolved = true;
        ready.resolve();
      }
      next = yield* subscription.next();
    }
    if (!readyResolved) {
      ready.reject(new Error("inspector exited before ready"));
    }
  });

  yield* ready.operation;
  return { port, cliScript, inspectorProc };
}

function mainDestroyed(snapshots: Array<Record<string, any>>): boolean {
  let mainIds = new Set<string>();
  let createdById = new Map<string, string>();
  let destroyedIds = new Set<string>();

  for (let snapshot of snapshots) {
    if (snapshot.type === "tree" && Array.isArray(snapshot.value)) {
      for (let node of snapshot.value) {
        if (node?.data?.["@effection/attributes"]?.name === "Main" && typeof node.id === "string") {
          mainIds.add(node.id);
        }
      }
    }

    if (
      snapshot.type === "set" &&
      snapshot.contextName === "@effection/attributes" &&
      snapshot.contextValue?.name === "Main" &&
      typeof snapshot.id === "string"
    ) {
      mainIds.add(snapshot.id);
    }

    if (
      snapshot.type === "created" &&
      typeof snapshot.id === "string" &&
      typeof snapshot.parentId === "string"
    ) {
      createdById.set(snapshot.id, snapshot.parentId);
    }

    if (
      (snapshot.type === "destroying" || snapshot.type === "destroyed") &&
      typeof snapshot.id === "string"
    ) {
      destroyedIds.add(snapshot.id);
      if (mainIds.has(snapshot.id)) {
        return true;
      }
    }
  }

  if (mainIds.size === 0) {
    return false;
  }

  let descendantIds = new Set<string>(mainIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (let [id, parentId] of createdById.entries()) {
      if (!descendantIds.has(id) && descendantIds.has(parentId)) {
        descendantIds.add(id);
        changed = true;
      }
    }
  }

  for (let snapshot of snapshots) {
    if (
      (snapshot.type === "destroying" || snapshot.type === "destroyed") &&
      typeof snapshot.id === "string" &&
      descendantIds.has(snapshot.id)
    ) {
      return true;
    }
  }

  return false;
}

describe("inspector child process", () => {
  describe("with program through completion", () => {
    let tmpDir: string;
    let outFile: string;
    let playFile: string;
    let watchFile: string;
    let port: number;
    let cliScript: string;
    let inspectorProc: Yielded<ReturnType<typeof exec>> | undefined;

    beforeEach(function* () {
      tmpDir = join(process.cwd(), "tmp");
      outFile = join(tmpDir, "out.json");
      playFile = join(tmpDir, "call-play.json");
      watchFile = join(tmpDir, "watchScopes.json");

      let inspector = yield* startInspector("./examples/spawn-children.ts", outFile);
      port = inspector.port;
      cliScript = inspector.cliScript;
      inspectorProc = inspector.inspectorProc;
    });

    it("starts Main and child scopes and shuts down cleanly", function* () {
      let playProc = yield* exec(process.execPath, {
        arguments: [
          cliScript,
          "call",
          "play",
          "--host",
          `http://localhost:${port}`,
          "--out",
          playFile,
        ],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      yield* playProc.expect();

      yield* inspectorProc!.join();

      const raw = yield* fs.readTextFile(outFile);
      const snapshots = JSON.parse(raw) as Array<Record<string, { data?: { [key: string]: any } }>>;
      const foundMain = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "Main",
        ),
      );
      const foundInspector = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
        ),
      );
      const foundChild = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "child",
        ),
      );
      const finalSnapshot = snapshots[snapshots.length - 1];
      const childPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "child",
      );

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node during run");
      assert(!childPresentAtEnd, "expected child scopes to be gone after shutdown");
    });

    it("captures the same shutdown state through watchScopes", function* () {
      let watchTask = yield* spawn(function* () {
        let watchProc = yield* exec(process.execPath, {
          arguments: [
            cliScript,
            "call",
            "watchScopes",
            "--host",
            `http://localhost:${port}`,
            "--out",
            watchFile,
          ],
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
        });
        yield* watchProc.join();
      });

      yield* sleep(250);
      let playProc = yield* exec(process.execPath, {
        arguments: [
          cliScript,
          "call",
          "play",
          "--host",
          `http://localhost:${port}`,
          "--out",
          playFile,
        ],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      yield* playProc.expect();

      yield* inspectorProc!.join();
      try {
        yield* watchTask.join();
      } catch {
        // watchScopes may terminate with a non-zero exit when the inspector shuts down;
        // the output file should still contain the recorded events.
      }

      const raw = yield* until(readFile(watchFile, "utf-8"));
      const snapshots = JSON.parse(raw) as Array<{
        type: string;
        value?: Array<{ data?: { [key: string]: any } }>;
        contextName?: string;
        contextValue?: { [key: string]: any };
      }>;
      const foundMain = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "Main",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "Main"),
      );
      const foundInspector = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "Inspector"),
      );
      const foundChild = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "child",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "child"),
      );
      const foundMainDestroyed = mainDestroyed(snapshots);

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node");
      assert(foundMainDestroyed, "expected Main scope to be destroyed in watchScopes");
    });
  });

  describe("with forever example", () => {
    let tmpDir: string;
    let outFile: string;
    let playFile: string;
    let watchFile: string;
    let port: number;
    let cliScript: string;
    let inspectorProc: Yielded<ReturnType<typeof exec>> | undefined;

    beforeEach(function* () {
      tmpDir = join(process.cwd(), "tmp");
      outFile = join(tmpDir, "out.json");
      playFile = join(tmpDir, "call-play.json");
      watchFile = join(tmpDir, "watchScopes.json");

      let inspector = yield* startInspector("./examples/forever.ts", outFile);
      port = inspector.port;
      cliScript = inspector.cliScript;
      inspectorProc = inspector.inspectorProc;
    });

    it("starts Main and child scopes and shuts down cleanly after SIGTERM", function* () {
      let playProc = yield* exec(process.execPath, {
        arguments: [
          cliScript,
          "call",
          "play",
          "--host",
          `http://localhost:${port}`,
          "--out",
          playFile,
        ],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      yield* playProc.expect();

      yield* sleep(150);
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGTERM");
      }
      yield* inspectorProc!.join();

      const raw = yield* fs.readTextFile(outFile);
      const snapshots = JSON.parse(raw) as Array<Record<string, { data?: { [key: string]: any } }>>;
      const foundMain = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "Main",
        ),
      );
      const foundInspector = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
        ),
      );
      const foundChild = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "child",
        ),
      );
      const finalSnapshot = snapshots[snapshots.length - 1];
      const childPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "child",
      );

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node during run");
      assert(!childPresentAtEnd, "expected child scopes to be gone after shutdown");
    });

    it("captures the same shutdown state through watchScopes after SIGTERM", function* () {
      let watchTask = yield* spawn(function* () {
        let watchProc = yield* exec(process.execPath, {
          arguments: [
            cliScript,
            "call",
            "watchScopes",
            "--host",
            `http://localhost:${port}`,
            "--out",
            watchFile,
          ],
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
        });
        yield* watchProc.join();
      });

      yield* sleep(250);
      let playProc = yield* exec(process.execPath, {
        arguments: [
          cliScript,
          "call",
          "play",
          "--host",
          `http://localhost:${port}`,
          "--out",
          playFile,
        ],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      yield* playProc.expect();

      yield* sleep(150);
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGTERM");
      }
      yield* inspectorProc!.join();
      try {
        yield* watchTask.join();
      } catch {
        // watchScopes may terminate with a non-zero exit when the inspector shuts down;
        // the output file should still contain the recorded events.
      }

      const raw = yield* until(readFile(watchFile, "utf-8"));
      const snapshots = JSON.parse(raw) as Array<{
        type: string;
        value?: Array<{ data?: { [key: string]: any } }>;
        contextName?: string;
        contextValue?: { [key: string]: any };
      }>;
      const foundMain = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "Main",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "Main"),
      );
      const foundInspector = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "Inspector"),
      );
      const foundChild = snapshots.some(
        (snapshot) =>
          (snapshot.type === "tree" &&
            snapshot.value?.some(
              (node) => node.data?.["@effection/attributes"]?.name === "child",
            )) ||
          (snapshot.type === "set" &&
            snapshot.contextName === "@effection/attributes" &&
            snapshot.contextValue?.name === "child"),
      );
      const foundMainDestroyed = mainDestroyed(snapshots);

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node");
      assert(foundMainDestroyed, "expected Main scope to be destroyed in watchScopes");
    });
  });
});
