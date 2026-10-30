import { beforeEach, describe, it } from "@effectionx/bdd";
import { strict as assert } from "node:assert";
import { createServer } from "node:net";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { call, spawn, until, withResolvers, type Yielded } from "effection";
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

function* startInspector(examplePath: string, outFile?: string, pause = true) {
  let port = yield* call(getAvailablePort);
  let cliScript = join(process.cwd(), "cli", "index.ts");
  let args = [cliScript, "--inspect-package", "./loader.ts", "--inspect-port", String(port)];
  if (pause) args.push("--inspect-pause");
  if (outFile) {
    args.push("--inspect-record", outFile);
  }
  args.push(examplePath);
  let inspectorProc = yield* exec(process.execPath, {
    arguments: args,
    cwd: process.cwd(),
    env: { ...(process.env as Record<string, string>), INSPECT_PORT: String(port) },
  });

  const ready = withResolvers<void>();
  let readyResolved = false;
  let stderr: string[] = [];
  yield* spawn(function* () {
    let subscription = yield* inspectorProc.stderr;
    let next = yield* subscription.next();
    while (!next.done) {
      const text = new TextDecoder().decode(next.value);
      stderr.push(text);
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
  return { port, cliScript, inspectorProc, stderr: () => stderr.join("") };
}

function* startWatchScopes(
  cliScript: string,
  port: number,
  outFile?: string,
  startedMarker?: string,
) {
  let ready = withResolvers<void>();
  let started = withResolvers<void>();
  let readyResolved = false;
  let startedResolved = false;
  let observed = "";
  let task = yield* spawn(function* () {
    let args = [cliScript, "call", "watchScopes", "--host", `http://localhost:${port}`];
    if (outFile) args.push("--out", outFile);
    let watchProc = yield* exec(process.execPath, {
      arguments: args,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });
    yield* watchProc.around({
      *stdout([bytes], next) {
        observed += new TextDecoder().decode(bytes);
        if (observed.includes('"type":"tree"')) {
          readyResolved = true;
          ready.resolve();
        }
        if (startedMarker && observed.includes(startedMarker)) {
          startedResolved = true;
          started.resolve();
        }
        return yield* next(bytes);
      },
    });
    let status = yield* watchProc.join();
    if (!readyResolved) ready.reject(new Error("watchScopes exited before its initial tree"));
    if (startedMarker && !startedResolved) {
      started.reject(new Error("watchScopes exited before the target started"));
    }
    return status;
  });
  return { task, ready: ready.operation, started: started.operation };
}

function mainDestroyed(snapshots: Array<Record<string, any>>): boolean {
  let mainIds = new Set<string>();

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
  }

  return snapshots.some(
    (snapshot) =>
      snapshot.type === "destroyed" && typeof snapshot.id === "string" && mainIds.has(snapshot.id),
  );
}

function childrenDestroyedBeforeMain(events: Array<Record<string, any>>): boolean {
  let mainId: string | undefined;
  let parentById = new Map<string, string>();

  for (let event of events) {
    if (event.type === "tree" && Array.isArray(event.value)) {
      for (let node of event.value) {
        if (typeof node?.id === "string" && typeof node.parentId === "string") {
          parentById.set(node.id, node.parentId);
        }
      }
    }

    if (
      event.type === "created" &&
      typeof event.id === "string" &&
      typeof event.parentId === "string"
    ) {
      parentById.set(event.id, event.parentId);
    }

    if (
      event.type === "set" &&
      event.contextName === "@effection/attributes" &&
      typeof event.id === "string"
    ) {
      if (event.contextValue?.name === "Main") {
        mainId = event.id;
      }
    }
  }

  if (!mainId) {
    return false;
  }

  let childIds = new Set<string>();
  for (let id of parentById.keys()) {
    let current = id;
    while (parentById.has(current)) {
      let parentId = parentById.get(current)!;
      if (parentId === mainId) {
        childIds.add(id);
        break;
      }
      current = parentId;
    }
  }

  if (childIds.size === 0) {
    return false;
  }

  let mainDestroyed = events.findIndex(
    (event) => event.type === "destroyed" && event.id === mainId,
  );
  if (mainDestroyed < 0) {
    return false;
  }

  return [...childIds].every((id) =>
    events.some(
      (event, index) => event.type === "destroyed" && event.id === id && index < mainDestroyed,
    ),
  );
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
      yield* until(mkdir(tmpDir, { recursive: true }));

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
      const recording = JSON.parse(raw) as {
        frames: Array<Record<string, { data?: { [key: string]: any } }>>;
        events: Array<Record<string, any>>;
        diagnostics: { code?: number | null; stdout?: string; stderr?: string };
      };
      const snapshots = recording.frames;
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
      const mainPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "Main",
      );
      const inspectorPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
      );

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node during run");
      assert(!mainPresentAtEnd, "expected Main to be gone after shutdown");
      assert(inspectorPresentAtEnd, "expected Inspector to remain present in final recorded state");
      assert(!childPresentAtEnd, "expected child scopes to be gone after shutdown");
      assert.equal(recording.diagnostics.code, 0, "expected a successful process exit");
      assert(recording.diagnostics.stdout?.includes("done"), "expected child stdout in recording");
      assert(
        recording.diagnostics.stderr?.includes("effection inspector"),
        "expected child stderr in recording",
      );
      assert(
        childrenDestroyedBeforeMain(recording.events),
        "expected children to be destroyed before Main",
      );
    });

    it("captures the same shutdown state through watchScopes", function* () {
      let watch = yield* startWatchScopes(cliScript, port, watchFile);
      yield* watch.ready;
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
      let watchStatus = yield* watch.task;
      assert.equal(watchStatus.code, 0, "expected watchScopes to finish normally");

      const raw = yield* until(readFile(watchFile, "utf-8"));
      const snapshots = JSON.parse(raw) as Array<{
        type: string;
        id?: string;
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
      let mainId = snapshots.find(
        (snapshot) =>
          snapshot.type === "set" &&
          snapshot.contextName === "@effection/attributes" &&
          snapshot.contextValue?.name === "Main",
      )?.id;
      assert.equal(
        snapshots.at(-1)?.type === "destroyed" && snapshots.at(-1)?.id === mainId,
        true,
        "expected Main destruction to be the final event before normal stream completion",
      );
    });
  });

  describe("with a fast program and no pause", () => {
    it("records Main destruction and completes the recorder normally", function* () {
      let tmpDir = join(process.cwd(), "tmp");
      let outFile = join(tmpDir, "quick-exit.json");
      yield* until(mkdir(tmpDir, { recursive: true }));

      let inspector = yield* startInspector("./examples/quick-exit.ts", outFile, false);
      let status = yield* inspector.inspectorProc.join();
      let recording = JSON.parse(yield* fs.readTextFile(outFile)) as {
        frames: Array<Record<string, { data?: { [key: string]: any } }>>;
        events: Array<Record<string, any>>;
        diagnostics: { code?: number | null; stderr?: string };
      };
      let mainId = recording.events.find(
        (event) =>
          event.type === "set" &&
          event.contextName === "@effection/attributes" &&
          event.contextValue?.name === "Main",
      )?.id;

      assert.equal(status.code, 0, "expected the quick program to exit successfully");
      assert(recording.frames.length > 0, "expected node-map frames to be recorded");
      assert(mainId, "expected the synthetic Main scope to be recorded");
      assert.deepEqual(
        recording.events.at(-1),
        { type: "destroyed", id: mainId, result: { ok: true } },
        "expected Main destruction to be the final event before normal stream completion",
      );
      assert(
        !recording.diagnostics.stderr?.includes("connection closed unexpectedly"),
        "expected recording to complete without a disconnect error",
      );
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
    let inspectorStderr: (() => string) | undefined;

    beforeEach(function* () {
      tmpDir = join(process.cwd(), "tmp");
      outFile = join(tmpDir, "out.json");
      playFile = join(tmpDir, "call-play.json");
      watchFile = join(tmpDir, "watchScopes.json");
      yield* until(mkdir(tmpDir, { recursive: true }));
      yield* fs.rm(outFile, { force: true });

      let inspector = yield* startInspector("./examples/forever.ts", outFile);
      port = inspector.port;
      cliScript = inspector.cliScript;
      inspectorProc = inspector.inspectorProc;
      inspectorStderr = inspector.stderr;
    });

    it("starts Main and child scopes and shuts down cleanly after SIGTERM", function* () {
      let watch = yield* startWatchScopes(cliScript, port, undefined, '"name":"background"');
      yield* watch.ready;
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

      yield* watch.started;
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGTERM");
      }
      let cliStatus = yield* inspectorProc!.join();
      let watchStatus = yield* watch.task;
      assert.equal(watchStatus.code, 0, "expected watchScopes to finish normally");

      const raw = yield* fs.readTextFile(outFile);
      const recording = JSON.parse(raw) as {
        frames: Array<Record<string, { data?: { [key: string]: any } }>>;
        events: Array<Record<string, any>>;
        diagnostics: { code?: number | null; stdout?: string; stderr?: string };
      };
      const snapshots = recording.frames;
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
      const foundSupervisor = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "supervisor",
        ),
      );
      const foundBackground = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "background",
        ),
      );
      const foundHelper = snapshots.some((snapshot) =>
        Object.values(snapshot).some(
          (node) => node.data?.["@effection/attributes"]?.name === "helper",
        ),
      );
      const finalSnapshot = snapshots[snapshots.length - 1];
      const childPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "child",
      );
      const mainPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "Main",
      );
      const inspectorPresentAtEnd = Object.values(finalSnapshot).some(
        (node) => node.data?.["@effection/attributes"]?.name === "Inspector",
      );

      assert(foundMain, "expected Main node");
      assert(foundInspector, "expected Inspector node");
      assert(foundChild, "expected child node during run");
      assert(foundSupervisor, "expected supervisor node during run");
      assert(foundBackground, "expected background node during run");
      assert(foundHelper, "expected helper node during run");
      assert(!mainPresentAtEnd, "expected Main to be gone after shutdown");
      assert(inspectorPresentAtEnd, "expected Inspector to remain present in final recorded state");
      assert(!childPresentAtEnd, "expected child scopes to be gone after shutdown");
      assert(cliStatus.code === 143, "expected main() to return the SIGTERM exit code");
      assert(
        recording.diagnostics.code === undefined,
        "expected no child exit code when main cancels run through structured cleanup",
      );
      assert(
        recording.diagnostics.stdout?.includes("shutting down, forever was a fallacy"),
        "expected shutdown stdout in recording",
      );
      assert(
        childrenDestroyedBeforeMain(recording.events),
        "expected children to be destroyed before Main",
      );
    });

    it("records cleanly when Ctrl-C shuts the program down", function* () {
      let watch = yield* startWatchScopes(cliScript, port, undefined, '"name":"background"');
      yield* watch.ready;
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

      yield* watch.started;
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGINT");
      }
      let status = yield* inspectorProc!.join();
      let watchStatus = yield* watch.task;

      const raw = yield* fs.readTextFile(outFile);
      const recording = JSON.parse(raw) as {
        events: Array<Record<string, any>>;
        diagnostics: { code?: number; signal?: string | null; stderr?: string };
      };
      assert(status.code === 130, "expected inspector CLI to return the SIGINT exit code");
      assert.equal(watchStatus.code, 0, "expected watchScopes to finish normally");
      assert(
        recording.diagnostics.code === undefined,
        "expected no child exit code when main cancels run through structured cleanup",
      );
      assert(
        childrenDestroyedBeforeMain(recording.events),
        "expected children to be destroyed before Main",
      );
      let mainId = recording.events.find(
        (event) =>
          event.type === "set" &&
          event.contextName === "@effection/attributes" &&
          event.contextValue?.name === "Main",
      )?.id;
      let finalEvent = recording.events.at(-1);
      assert(
        finalEvent?.type === "destroyed" && finalEvent.id === mainId,
        "expected Main destruction to be the final recorded scope event before stream completion",
      );
      assert(
        !recording.diagnostics.stderr?.includes("connection closed unexpectedly"),
        "expected the target stderr to be free of shutdown disconnect errors",
      );
      assert(
        !inspectorStderr?.().includes("record NodeMap interrupted") &&
          !inspectorStderr?.().includes("record scope events interrupted"),
        "expected normal recording stream closure not to be reported as an error",
      );
    });

    it("captures the same shutdown state through watchScopes after SIGTERM", function* () {
      let watch = yield* startWatchScopes(cliScript, port, watchFile, '"name":"background"');
      yield* watch.ready;
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

      yield* watch.started;
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGTERM");
      }
      yield* inspectorProc!.join();
      let watchStatus = yield* watch.task;
      assert(
        watchStatus.code === 0,
        "expected watchScopes to finish normally on inspector shutdown",
      );

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

    it("closes a paused watchScopes client cleanly on Ctrl-C before play", function* () {
      let watchReady = withResolvers<void>();
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
        yield* watchProc.around({
          *stdout([bytes], next) {
            if (new TextDecoder().decode(bytes).includes('"type":"tree"')) {
              watchReady.resolve();
            }
            return yield* next(bytes);
          },
        });
        return yield* watchProc.join();
      });

      yield* watchReady.operation;
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGINT");
      }
      let status = yield* inspectorProc!.join();
      let watchStatus = yield* watchTask;
      assert(status.code === 130, "expected inspector CLI to return the SIGINT exit code");
      assert(watchStatus.code === 0, "expected paused watchScopes to finish normally");

      let snapshots = JSON.parse(yield* fs.readTextFile(watchFile)) as Array<Record<string, any>>;
      assert(mainDestroyed(snapshots), "expected paused Main scope to be recorded as destroyed");
      assert(
        !inspectorStderr?.().includes("connection closed unexpectedly"),
        "expected inspector shutdown not to report a client disconnect error",
      );
    });
  });

  describe("without recording", () => {
    let port: number;
    let cliScript: string;
    let inspectorProc: Yielded<ReturnType<typeof exec>> | undefined;

    beforeEach(function* () {
      let inspector = yield* startInspector("./examples/forever.ts");
      port = inspector.port;
      cliScript = inspector.cliScript;
      inspectorProc = inspector.inspectorProc;
    });

    it("lets main and process scope cleanup handle SIGTERM", function* () {
      let watch = yield* startWatchScopes(cliScript, port, undefined, '"name":"background"');
      yield* watch.ready;
      let playProc = yield* exec(process.execPath, {
        arguments: [cliScript, "call", "play", "--host", `http://localhost:${port}`],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      });
      yield* playProc.expect();

      yield* watch.started;
      if (inspectorProc?.pid) {
        process.kill(-inspectorProc.pid, "SIGTERM");
      }
      let status = yield* inspectorProc!.join();
      let watchStatus = yield* watch.task;
      assert(status.code === 143, "expected main to exit cleanly after process-scope cleanup");
      assert.equal(watchStatus.code, 0, "expected watchScopes to finish normally");
    });
  });

  describe("with failure example", () => {
    it("records the failing scope and orderly error shutdown", function* () {
      let tmpDir = join(process.cwd(), "tmp");
      let outFile = join(tmpDir, "failure-out.json");
      let playFile = join(tmpDir, "failure-play.json");
      let watchFile = join(tmpDir, "failure-watchScopes.json");
      yield* until(mkdir(tmpDir, { recursive: true }));
      let { port, cliScript, inspectorProc } = yield* startInspector(
        "./examples/failure.ts",
        outFile,
      );

      let watch = yield* startWatchScopes(cliScript, port, watchFile, '"name":"failure-child"');
      yield* watch.ready;
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
      yield* watch.started;

      let status = yield* inspectorProc.join();
      assert.equal(status.code, 1, "expected the inspected process to fail");
      const recording = JSON.parse(yield* fs.readTextFile(outFile)) as {
        frames: unknown[];
        events: Array<Record<string, any>>;
        diagnostics?: { code?: number | null; stdout?: string; stderr?: string };
      };
      assert(recording.frames.length > 0, "expected a non-empty failure recording");
      assert.equal(recording.diagnostics?.code, 1, "expected the recording exit code");
      assert(recording.diagnostics?.stderr?.includes("cleanup failed"));
      assert(childrenDestroyedBeforeMain(recording.events));
      let watchStatus = yield* watch.task;
      assert(watchStatus.code === 0, "expected watchScopes to complete normally after Main fails");

      const raw = yield* until(readFile(watchFile, "utf-8"));
      const snapshots = JSON.parse(raw) as Array<{
        type: string;
        id?: string;
        result?: { ok?: boolean; error?: { message?: string } };
        value?: Array<{ data?: { [key: string]: any } }>;
        contextName?: string;
        contextValue?: { [key: string]: any };
      }>;
      assert(
        snapshots.some(
          (snapshot) => snapshot.type === "set" && snapshot.contextValue?.name === "failure-child",
        ),
        "expected failure-child node",
      );
      let mainId = snapshots.find(
        (snapshot) =>
          snapshot.type === "set" &&
          snapshot.contextName === "@effection/attributes" &&
          snapshot.contextValue?.name === "Main",
      )?.id;
      assert(
        snapshots.some(
          (snapshot) =>
            snapshot.type === "destroyed" &&
            snapshot.id === mainId &&
            snapshot.result?.ok === false &&
            snapshot.result.error?.message?.includes("cleanup failed"),
        ),
        "expected Main destruction to report the cleanup failure",
      );
      assert(mainDestroyed(snapshots), "expected Main scope destruction after the failure");
    });
  });
});
