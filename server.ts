// tasks-kanban — backend: a live Kanban over BB's built-in Tasks.
//
// This plugin does not store its own copy of tasks. Every read and write is
// proxied, server-side, into the built-in `tasks` plugin's RPC surface
// (bb.sdk.plugins.callRpc). That is what makes the board "real": moving a card
// here moves the same row that `bb tasks`, the sidebar, and agents see.
//
//   board_*  (this plugin's contract, consumed by app.tsx)
//     └─> bb.sdk.plugins.callRpc({ pluginId: "tasks", method, input, outputSchema })
//           └─> built-in tasks plugin (same DB as the `bb tasks` CLI)

import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { detectLocale, translate, type MessageKey } from "./lib/i18n";

// ---------------------------------------------------------------------------
// Models that mirror the built-in tasks plugin's DTOs (validated on the wire).
// ---------------------------------------------------------------------------

const id = z.string();

export const taskStatus = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
export const taskPriority = z.enum(["urgent", "high", "medium", "low", "none"]);
const dateStr = z.string().nullable();

export const taskSchema = z.object({
  id,
  projectId: id,
  number: z.number().int().positive(),
  key: z.string(),
  title: z.string(),
  description: z.string(),
  status: taskStatus,
  priority: taskPriority,
  dueDate: dateStr,
  parentTaskId: id.nullable(),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  labelIds: z.array(id),
}).strict(); // mirrors the tasks plugin's strict task DTO
export type Task = z.infer<typeof taskSchema>;

export const labelSchema = z.object({
  id,
  projectId: id,
  name: z.string(),
  color: z.string(),
});
export type Label = z.infer<typeof labelSchema>;

export const taskProjectSchema = z.object({
  id,
  name: z.string(),
  prefix: z.string(),
  nextTaskNumber: z.number().int(),
  color: z.string(),
  folderId: id.nullable(),
  linkedBbProjectId: id.nullable(),
  createdAt: z.string(),
});
export type TaskProject = z.infer<typeof taskProjectSchema>;

const bbProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type BbProject = z.infer<typeof bbProjectSchema>;

export const commentSchema = z.object({
  id,
  taskId: id,
  kind: z.enum(["user", "agent", "system"]),
  authorName: z.string(),
  presetName: z.string().nullable(),
  threadId: z.string().nullable(),
  body: z.string(),
  notifiedCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Comment = z.infer<typeof commentSchema>;

// tasks' create/update/move return a discriminated union: { ok, task } or
// { ok: false, error: { code, message } }.
const taskResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), task: taskSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }).passthrough(),
    })
    .strict(),
]);
export type TaskResult = z.infer<typeof taskResult>;

// Output wrappers as the tasks plugin returns them.
const outProjects = z.object({ projects: z.array(taskProjectSchema) });
const outBbProjects = z.object({ bbProjects: z.array(bbProjectSchema) });
const outTasks = z.object({ tasks: z.array(taskSchema) });
const outTask = z.object({ task: taskSchema.nullable() });
const outLabels = z.object({ labels: z.array(labelSchema) });
const outDeleted = z.object({ deleted: z.boolean() });
const outComments = z.object({ comments: z.array(commentSchema) });
const outComment = z.object({ comment: commentSchema });
const outLabel = z.object({ label: labelSchema });

// ---------------------------------------------------------------------------
// Board settings (bb.settings.define): user preferences for the board UI.
// The host renders these on the plugin's settings page; values below are
// the effective (stored-over-defaults) shape the board receives.
// ---------------------------------------------------------------------------

export const boardSettingsSchema = z.object({
  /** UI language: auto (follow the browser), en, or ru. */
  language: z.enum(["auto", "en", "ru"]),
  /** Card order within a lane. */
  sort: z.enum(["manual", "due", "priority"]),
  /** Show a two-line description preview on cards. */
  cardDescription: z.boolean(),
  showBacklog: z.boolean(),
  showTodo: z.boolean(),
  showInProgress: z.boolean(),
  showInReview: z.boolean(),
  showDone: z.boolean(),
  showCanceled: z.boolean(),
});
export type BoardSettings = z.infer<typeof boardSettingsSchema>;

const boardSettingsPatchSchema = z
  .object({
    language: z.enum(["auto", "en", "ru"]).optional(),
    sort: z.enum(["manual", "due", "priority"]).optional(),
    cardDescription: z.boolean().optional(),
    showBacklog: z.boolean().optional(),
    showTodo: z.boolean().optional(),
    showInProgress: z.boolean().optional(),
    showInReview: z.boolean().optional(),
    showDone: z.boolean().optional(),
    showCanceled: z.boolean().optional(),
  })
  .strict();

// Filters accepted by tasks' listAllTasks.
const listFilters = z.object({
  projectId: id.optional(),
  statuses: z.array(taskStatus).optional(),
  priorities: z.array(taskPriority).optional(),
  labelIds: z.array(id).optional(),
  activeOnly: z.boolean().default(false),
  parentTaskId: id.nullable().optional(),
  search: z.string().optional(),
  sort: z.enum(["manual", "priority", "due"]).default("manual"),
});

// ---------------------------------------------------------------------------
// This plugin's contract. app.tsx imports the inferred types.
// ---------------------------------------------------------------------------
export const rpcContract = defineRpcContract({
  board_projects: {
    input: z.null(),
    output: z.object({
      projects: z.array(taskProjectSchema),
      bbProjects: z.array(bbProjectSchema),
    }),
  },
  board_tasks: {
    input: listFilters,
    output: z.object({ tasks: z.array(taskSchema) }),
  },
  board_task: {
    input: z.object({ taskKey: z.string() }),
    output: z.object({ task: taskSchema.nullable() }),
  },
  board_labels: {
    input: z.object({ projectId: id }),
    output: z.object({ labels: z.array(labelSchema) }),
  },
  board_settings_get: {
    input: z.null(),
    output: boardSettingsSchema,
  },
  board_settings_set: {
    input: boardSettingsPatchSchema,
    output: boardSettingsSchema,
  },
  board_update: {
    input: z
      .object({
        taskId: id,
        title: z.string().optional(),
        description: z.string().optional(),
        status: taskStatus.optional(),
        priority: taskPriority.optional(),
        dueDate: dateStr.optional(),
        parentTaskId: id.nullable().optional(),
        labelIds: z.array(id).optional(),
      })
      .strict(),
    output: taskResult,
  },
  board_create: {
    input: z.object({
      projectId: id,
      title: z.string().trim().min(1),
      description: z.string().default(""),
      status: taskStatus.default("backlog"),
      priority: taskPriority.default("none"),
      dueDate: dateStr.default(null),
      labelIds: z.array(id).default([]),
    }),
    output: taskResult,
  },
  board_delete: {
    input: z.object({ taskId: id }),
    output: z.object({ deleted: z.boolean() }),
  },
  board_move: {
    input: z.object({
      taskId: id,
      status: taskStatus,
      beforeTaskId: id.nullable().optional(),
      afterTaskId: id.nullable().optional(),
    }),
    output: taskResult,
  },
  board_comment: {
    input: z.object({
      taskId: id,
      body: z.string(),
      notify: z.boolean(),
    }),
    output: z.object({ comment: commentSchema }),
  },
  board_comments: {
    input: z.object({ taskId: id }),
    output: z.object({ comments: z.array(commentSchema) }),
  },
  board_label: {
    input: z.object({
      projectId: id,
      name: z.string().trim().min(1),
      color: z.string(),
    }),
    output: z.object({ label: labelSchema }),
  },
});

// Realtime channel app.tsx listens on; published after every write so every
// open board refetches, no matter which surface made the change.
export const BOARD_CHANGED_CHANNEL = "tasks-kanban-changed";

/** Proxy one method of the built-in tasks plugin. */
function proxy(bb: BbPluginApi) {
  return {
    call: async <T>(
      method: string,
      input: unknown,
      outputSchema: z.ZodType<T>,
    ): Promise<T> => {
      // bb.sdk is bind-gated; this only ever runs from rpc handlers on the
      // real server, where it is bound.
      return bb.sdk.plugins.callRpc<T>({
        pluginId: "tasks",
        method,
        input: input as never,
        outputSchema,
      });
    },
  };
}

function emit(bb: BbPluginApi, extra: Record<string, unknown> = {}) {
  bb.realtime.publish(BOARD_CHANGED_CHANNEL, {
    at: new Date().toISOString(),
    ...extra,
  });
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("tasks-kanban loaded");

  const tasks = () => proxy(bb);

  // Declarative settings: the host renders them on this plugin's settings
  // page. onChange fires on every effective-value change, so every open
  // board refetches (the channel also covers task writes).
  //
  // Labels are localized at define time from the host locale (Node exposes
  // the OS language through navigator.language): this is the best the
  // server can know before the user picks the "Board language" setting
  // itself. The board content follows that setting at all times.
  const hostLocale = detectLocale();
  const st = (key: MessageKey) => translate(hostLocale, key);
  const settings = bb.settings.define({
    language: {
      type: "select",
      label: st("settings.language"),
      description: st("settings.language.desc"),
      options: ["auto", "en", "ru"],
      experimental_optionLabels: {
        auto: st("settings.language.auto"),
        en: st("settings.language.en"),
        ru: st("settings.language.ru"),
      },
      default: "auto",
      experimental_schema: z.enum(["auto", "en", "ru"]),
    },
    sort: {
      type: "select",
      label: st("settings.sort"),
      description: st("settings.sort.desc"),
      options: ["manual", "due", "priority"],
      experimental_optionLabels: {
        manual: st("settings.sort.manual"),
        due: st("settings.sort.due"),
        priority: st("settings.sort.priority"),
      },
      default: "due",
      experimental_schema: z.enum(["manual", "due", "priority"]),
    },
    cardDescription: {
      type: "boolean",
      label: st("settings.cardDescription"),
      description: st("settings.cardDescription.desc"),
      default: true,
    },
    showBacklog: {
      type: "boolean",
      label: st("settings.showBacklog"),
      default: true,
    },
    showTodo: {
      type: "boolean",
      label: st("settings.showTodo"),
      default: true,
    },
    showInProgress: {
      type: "boolean",
      label: st("settings.showInProgress"),
      default: true,
    },
    showInReview: {
      type: "boolean",
      label: st("settings.showInReview"),
      default: true,
    },
    showDone: {
      type: "boolean",
      label: st("settings.showDone"),
      default: true,
    },
    showCanceled: {
      type: "boolean",
      label: st("settings.showCanceled"),
      default: true,
    },
  });
  settings.onChange(() => emit(bb, { settings: true }));

  bb.rpc.register(rpcContract, {
    board_projects: async () => {
      const [projects, bbProjects] = await Promise.all([
        tasks().call("listProjects", {}, outProjects),
        tasks().call("listBbProjects", null, outBbProjects),
      ]);
      return { projects: projects.projects, bbProjects: bbProjects.bbProjects };
    },

    board_tasks: async (filters) => {
      const res = await tasks().call("listAllTasks", filters, outTasks);
      return { tasks: res.tasks };
    },

    board_task: async ({ taskKey }) => {
      const res = await tasks().call("getTaskByKey", { taskKey }, outTask);
      return { task: res.task };
    },

    board_labels: async ({ projectId }) => {
      const res = await tasks().call("listLabels", { projectId }, outLabels);
      return { labels: res.labels };
    },

    board_settings_get: async () => settings.get(),

    board_settings_set: async (patch) => settings.experimental_set(patch),

    board_update: async (patch) => {
      const res = await tasks().call("updateTask", patch, taskResult);
      if (res.ok) emit(bb, { taskId: patch.taskId });
      return res;
    },

    board_create: async (input) => {
      const res = await tasks().call("createTask", input, taskResult);
      if (res.ok) emit(bb, { projectId: input.projectId });
      return res;
    },

    board_delete: async ({ taskId }) => {
      const res = await tasks().call("deleteTask", { taskId }, outDeleted);
      if (res.deleted) emit(bb, { taskId });
      return { deleted: res.deleted };
    },

    board_move: async (move) => {
      const res = await tasks().call("boardMove", move, taskResult);
      if (res.ok) emit(bb, { taskId: move.taskId });
      return res;
    },

    board_comment: async ({ taskId, body, notify }) => {
      const res = await tasks().call(
        "createComment",
        { taskId, body, notify },
        outComment,
      );
      emit(bb, { taskId });
      return { comment: res.comment };
    },

    board_comments: async ({ taskId }) => {
      const res = await tasks().call("listComments", { taskId }, outComments);
      return { comments: res.comments };
    },

    board_label: async ({ projectId, name, color }) => {
      const res = await tasks().call(
        "createLabel",
        { projectId, name, color },
        outLabel,
      );
      emit(bb, { projectId });
      return { label: res.label };
    },
  });

  bb.onDispose(() => bb.log.info("tasks-kanban disposed"));
}
