// Integration-style tests for the built server bundle (dist/server.js).
//
// We import the actual build output and drive its factory with a mocked
// BbPluginApi: rpc.register captures the contract + handlers, and
// bb.sdk.plugins.callRpc is faked so every handler's proxy path runs for
// real. This verifies, without a live BB server, that:
//   * every board_* method forwards the right method/input to the tasks plugin
//   * results are shaped back correctly
//   * the realtime channel is published exactly on successful writes

import test from "node:test";
import assert from "node:assert/strict";

const mod = await import(
  new URL("../dist/server.js", import.meta.url).href
);

const TASKS_PLUGIN = "tasks";
const CHANNEL = "tasks-kanban-changed";

// A full task DTO that satisfies the plugin's taskSchema.
const makeTask = (over = {}) => ({
  id: "01TASK",
  projectId: "01PROJ",
  number: 1,
  key: "PROJ-1",
  title: "Test task",
  description: "desc",
  status: "todo",
  priority: "high",
  dueDate: "2026-12-01",
  parentTaskId: null,
  position: 0,
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
  labelIds: ["01LABEL"],
  ...over,
});

function fakeBbApi(results = {}) {
  const calls = [];
  const published = [];
  const disposed = [];
  const api = {
    pluginId: "tasks-kanban",
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    settings: {},
    storage: { kv: {} },
    http: {},
    rpc: {
      register: (contract, handlers) => {
        api.contract = contract;
        api.handlers = handlers;
      },
    },
    realtime: {
      publish: (channel, payload) => published.push([channel, payload]),
    },
    background: {},
    cli: {},
    agents: {},
    ui: {},
    sdk: {
      plugins: {
        callRpc: async (args) => {
          calls.push(args);
          const key = `${args.pluginId}.${args.method}`;
          if (!(key in results)) {
            throw new Error(`fake callRpc has no result for ${key}`);
          }
          return results[key];
        },
      },
    },
    onDispose: (hook) => disposed.push(hook),
  };
  return { api, calls, published, disposed };
}

async function loadPlugin(results) {
  const { api, calls, published, disposed } = fakeBbApi(results);
  await mod.default(api);
  assert.ok(api.contract, "factory must call bb.rpc.register");
  assert.ok(api.handlers, "factory must register handlers");
  return { api, calls, published, disposed };
}

const ALL_METHODS = [
  "board_projects",
  "board_tasks",
  "board_task",
  "board_labels",
  "board_update",
  "board_create",
  "board_delete",
  "board_move",
  "board_comment",
  "board_comments",
  "board_label",
];

test("factory registers the full board_* contract", async () => {
  const { api } = await loadPlugin({});
  for (const m of ALL_METHODS) {
    assert.ok(api.contract[m], `contract missing ${m}`);
    assert.ok(api.handlers[m], `handler missing ${m}`);
  }
});

test("board_projects proxies listProjects + listBbProjects", async () => {
  const { api, calls } = await loadPlugin({
    [`${TASKS_PLUGIN}.listProjects`]: { projects: [{ p: 1 }] },
    [`${TASKS_PLUGIN}.listBbProjects`]: { bbProjects: [{ id: "proj_x", name: "X" }] },
  });
  // listProjects input is {} but listBbProjects input must be null.
  const res = await api.handlers.board_projects();
  assert.deepEqual(calls.map((c) => c.method).sort(), [
    "listBbProjects",
    "listProjects",
  ]);
  assert.equal(calls.find((c) => c.method === "listBbProjects").input, null);
  assert.deepEqual(res, {
    projects: [{ p: 1 }],
    bbProjects: [{ id: "proj_x", name: "X" }],
  });
});

test("board_tasks forwards filters to listAllTasks", async () => {
  const { api, calls } = await loadPlugin({
    [`${TASKS_PLUGIN}.listAllTasks`]: { tasks: [makeTask()] },
  });
  const filters = {
    projectId: "01PROJ",
    activeOnly: false,
    sort: "due",
    statuses: ["todo"],
  };
  const res = await api.handlers.board_tasks(filters);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "listAllTasks");
  assert.deepEqual(calls[0].input, filters);
  assert.deepEqual(res, { tasks: [makeTask()] });
});

test("board_task forwards getTaskByKey", async () => {
  const { api, calls } = await loadPlugin({
    [`${TASKS_PLUGIN}.getTaskByKey`]: { task: makeTask({ key: "PROJ-2" }) },
  });
  const res = await api.handlers.board_task({ taskKey: "PROJ-2" });
  assert.deepEqual(calls[0].input, { taskKey: "PROJ-2" });
  assert.equal(res.task.key, "PROJ-2");
});

test("board_labels forwards listLabels", async () => {
  const label = { id: "01LABEL", projectId: "01PROJ", name: "svc", color: "blue" };
  const { api, calls } = await loadPlugin({
    [`${TASKS_PLUGIN}.listLabels`]: { labels: [label] },
  });
  const res = await api.handlers.board_labels({ projectId: "01PROJ" });
  assert.deepEqual(calls[0].input, { projectId: "01PROJ" });
  assert.deepEqual(res, { labels: [label] });
});

test("board_update forwards the patch and emits on success", async () => {
  const task = makeTask({ status: "in_progress" });
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.updateTask`]: { ok: true, task },
  });
  const patch = { taskId: "01TASK", status: "in_progress" };
  const res = await api.handlers.board_update(patch);
  assert.equal(calls[0].method, "updateTask");
  assert.deepEqual(calls[0].input, patch);
  assert.deepEqual(res, { ok: true, task });
  assert.equal(published.length, 1);
  assert.equal(published[0][0], CHANNEL);
  assert.equal(published[0][1].taskId, "01TASK");
});

test("board_update does not emit on a failed result", async () => {
  const failed = {
    ok: false,
    error: { code: "task_parent_invalid", message: "nope" },
  };
  const { api, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.updateTask`]: failed,
  });
  const res = await api.handlers.board_update({ taskId: "01TASK", status: "done" });
  assert.deepEqual(res, failed);
  assert.equal(published.length, 0);
});

test("board_create forwards input and emits with projectId on success", async () => {
  const task = makeTask({ number: 2, key: "PROJ-2" });
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.createTask`]: { ok: true, task },
  });
  const input = {
    projectId: "01PROJ",
    title: "New",
    description: "d",
    status: "todo",
    priority: "none",
    dueDate: null,
    labelIds: [],
  };
  const res = await api.handlers.board_create(input);
  assert.equal(calls[0].method, "createTask");
  assert.deepEqual(calls[0].input, input);
  assert.equal(res.ok, true);
  assert.equal(published.length, 1);
  assert.equal(published[0][1].projectId, "01PROJ");
});

test("board_delete forwards deleteTask and emits only when deleted", async () => {
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.deleteTask`]: { deleted: true },
  });
  const res = await api.handlers.board_delete({ taskId: "01TASK" });
  assert.deepEqual(calls[0].input, { taskId: "01TASK" });
  assert.deepEqual(res, { deleted: true });
  assert.equal(published.length, 1);
  assert.equal(published[0][0], CHANNEL);
});

test("board_move forwards boardMove", async () => {
  const task = makeTask({ status: "in_progress" });
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.boardMove`]: { ok: true, task },
  });
  const move = { taskId: "01TASK", status: "in_progress", beforeTaskId: null };
  const res = await api.handlers.board_move(move);
  assert.equal(calls[0].method, "boardMove");
  assert.deepEqual(calls[0].input, move);
  assert.equal(res.ok, true);
  assert.equal(published.length, 1);
});

test("board_comment forwards createComment and emits", async () => {
  const comment = {
    id: "01CMT",
    taskId: "01TASK",
    kind: "user",
    authorName: "You",
    presetName: null,
    threadId: null,
    body: "hello",
    notifiedCount: 0,
    createdAt: "2026-11-13T00:00:00.000Z",
  };
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.createComment`]: { comment },
  });
  const res = await api.handlers.board_comment({
    taskId: "01TASK",
    body: "hello",
    notify: false,
  });
  assert.equal(calls[0].method, "createComment");
  assert.deepEqual(calls[0].input, {
    taskId: "01TASK",
    body: "hello",
    notify: false,
  });
  assert.deepEqual(res, { comment });
  assert.equal(published.length, 1);
});

test("board_comments forwards listComments", async () => {
  const { api, calls } = await loadPlugin({
    [`${TASKS_PLUGIN}.listComments`]: { comments: [] },
  });
  const res = await api.handlers.board_comments({ taskId: "01TASK" });
  assert.deepEqual(calls[0].input, { taskId: "01TASK" });
  assert.deepEqual(res, { comments: [] });
});

test("board_label forwards createLabel and emits", async () => {
  const label = { id: "01L2", projectId: "01PROJ", name: "acceptance", color: "red" };
  const { api, calls, published } = await loadPlugin({
    [`${TASKS_PLUGIN}.createLabel`]: { label },
  });
  const input = { projectId: "01PROJ", name: "acceptance", color: "red" };
  const res = await api.handlers.board_label(input);
  assert.deepEqual(calls[0].input, input);
  assert.deepEqual(res, { label });
  assert.equal(published.length, 1);
});

test("task output schema accepts a valid row and rejects a bad status", () => {
  const taskSchema = mod.taskSchema;
  assert.doesNotThrow(() => taskSchema.parse(makeTask()));
  assert.throws(() =>
    taskSchema.parse(makeTask({ status: "someday" })),
  );
  assert.throws(() =>
    // strict: unknown fields must be rejected
    taskSchema.parse({ ...makeTask(), extra: 1 }),
  );
});

test("taskResult discriminated union accepts ok and error shapes", () => {
  // The ok/error union is the shared output schema of update/create/move.
  const taskResult = mod.rpcContract.board_update.output;
  assert.deepEqual(taskResult.parse({ ok: true, task: makeTask() }).ok, true);
  assert.deepEqual(
    taskResult.parse({
      ok: false,
      error: { code: "x", message: "m" },
    }).ok,
    false,
  );
  assert.throws(() => taskResult.parse({ ok: "yes" }));
});

test("listFilters input applies documented defaults", () => {
  const boardTasksInput = mod.rpcContract.board_tasks.input;
  const parsed = boardTasksInput.parse({ projectId: "01PROJ" });
  assert.equal(parsed.activeOnly, false);
  assert.equal(parsed.sort, "manual");
  assert.equal(parsed.projectId, "01PROJ");
});

test("create input applies documented defaults", () => {
  const boardCreateInput = mod.rpcContract.board_create.input;
  const parsed = boardCreateInput.parse({ projectId: "01PROJ", title: "x" });
  assert.equal(parsed.description, "");
  assert.equal(parsed.status, "backlog");
  assert.equal(parsed.priority, "none");
  assert.equal(parsed.dueDate, null);
  assert.deepEqual(parsed.labelIds, []);
});

test("board_projects input must be null (not an object)", () => {
  const input = mod.rpcContract.board_projects.input;
  assert.deepEqual(input.parse(null), null);
  assert.throws(() => input.parse({}));
});

test("factory disposes cleanly", async () => {
  const { api, disposed } = await loadPlugin({});
  assert.equal(disposed.length, 1);
  await disposed[0]();
});
