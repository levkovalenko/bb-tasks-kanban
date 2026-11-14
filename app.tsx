// tasks-kanban — frontend: a project-wide Kanban over BB Tasks.
//
// One nav panel ("Task board"). It lists the linked tasks project's tasks
// grouped into BB's six statuses, lets you drag cards between lanes (real
// moves via the tasks plugin's boardMove), open a task to edit its fields,
// manage labels, comment, create, and delete tasks. Every mutation goes
// through server.ts, which proxies into the built-in tasks plugin — so this
// board and `bb tasks` are the same data.
//
// The UI is bilingual (en/ru), picked from the browser language; strings
// live in lib/i18n.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DragEvent } from "react";
import {
  definePluginApp,
  useBbContext,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type {
  BoardSettings,
  Label,
  Task,
  TaskProject,
  rpcContract,
} from "./server";
import { BOARD_CHANGED_CHANNEL } from "./server";
import {
  detectLocale,
  translate,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Priority = "urgent" | "high" | "medium" | "low" | "none";
type Status =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "canceled";

const LANES: { id: Status; title: string }[] = [
  { id: "backlog", title: "lanes.backlog" },
  { id: "todo", title: "lanes.todo" },
  { id: "in_progress", title: "lanes.in_progress" },
  { id: "in_review", title: "lanes.in_review" },
  { id: "done", title: "lanes.done" },
  { id: "canceled", title: "lanes.canceled" },
];

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];
const STATUSES: Status[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
];

const PRIORITY_TONE: Record<Priority, string> = {
  urgent: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-muted text-muted-foreground border-border",
  none: "hidden",
};

// UI locale: starts from the browser language, then follows the "Board
// language" setting (auto keeps the browser language). Components read t()
// from context, so changing the setting re-renders the board in place.
export type TFn = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;
const TCtx = createContext<TFn>((key, vars) =>
  translate(detectLocale(), key, vars),
);
function useT(): TFn {
  return useContext(TCtx);
}
function localeFromSetting(language?: "auto" | "en" | "ru"): Locale {
  return language === "en" ? "en" : language === "ru" ? "ru" : detectLocale();
}

function msg(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

function useBoard() {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId: bbProjectId } = useBbContext();
  const [taskProjects, setTaskProjects] = useState<TaskProject[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [settings, setSettings] = useState<BoardSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    rpc
      .call("board_projects", null)
      .then(({ projects, bbProjects }) => {
        setTaskProjects(projects);
        setSelected((current) => {
          if (current !== null && projects.some((p) => p.id === current)) {
            return current;
          }
          const linked = projects.find((p) => p.linkedBbProjectId === bbProjectId);
          return linked?.id ?? projects[0]?.id ?? null;
        });
      })
      .catch((cause) => setError(msg(cause)));
  }, [rpc, bbProjectId]);

  const loadTasks = useCallback(() => {
    if (selected === null) return;
    rpc
      .call("board_tasks", {
        projectId: selected,
        activeOnly: false,
        sort: settings?.sort ?? "due",
      })
      .then((res) => {
        setTasks(res.tasks);
        setError(null);
      })
      .catch((cause) => setError(msg(cause)));
    rpc
      .call("board_labels", { projectId: selected })
      .then((res) => setLabels(res.labels))
      .catch(() => undefined);
  }, [rpc, selected, settings]);

  const loadSettings = useCallback(() => {
    rpc
      .call("board_settings_get", null)
      .then(setSettings)
      .catch(() => undefined);
  }, [rpc]);

  const refetch = useCallback(() => {
    loadProjects();
    loadTasks();
  }, [loadProjects, loadTasks]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  // server.ts publishes after every write — from this page, another client,
  // the bb tasks CLI, or an agent — and after every settings change, so the
  // board never goes stale.
  useRealtime(BOARD_CHANGED_CHANNEL, () => {
    loadTasks();
    loadSettings();
  });

  return {
    rpc,
    taskProjects,
    selected,
    setSelected,
    tasks,
    labels,
    settings,
    error,
    setError,
    refetch,
  };
}

type BoardApi = ReturnType<typeof useBoard>;
const BoardCtx = createContext<BoardApi | null>(null);
function useBoardInner(): BoardApi {
  const board = useContext(BoardCtx);
  if (board === null) throw new Error("BoardCtx missing");
  return board;
}

function dueTone(due: string | null, status: Status): string {
  if (due === null || status === "done" || status === "canceled") return "";
  const today = new Date().toISOString().slice(0, 10);
  return due < today ? "text-destructive font-semibold" : "";
}

function Card({
  task,
  labelNames,
  showDescription,
  onOpen,
  onDragStart,
  onDropBefore,
}: {
  task: Task;
  labelNames: Map<string, string>;
  showDescription: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDropBefore: (e: DragEvent) => void;
}) {
  const t = useT();
  const dueCls = dueTone(task.dueDate, task.status);
  const overdue = dueCls !== "";
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropBefore}
      onClick={onOpen}
      className="cursor-grab rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40 active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-primary">{task.key}</span>
        {task.priority !== "none" ? (
          <span
            className={cn(
              "rounded border px-1.5 py-px text-[10px] font-medium",
              PRIORITY_TONE[task.priority],
            )}
          >
            {t(`priorities.${task.priority}` as MessageKey)}
          </span>
        ) : null}
        {task.dueDate ? (
          <span
            className={cn(
              "ml-auto text-[11px] tabular-nums text-muted-foreground",
              dueCls,
            )}
          >
            {overdue ? "⚠ " : ""}
            {task.dueDate.slice(8, 10)}.{task.dueDate.slice(5, 7)}.{task.dueDate.slice(2, 4)}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-snug">{task.title}</p>
      {showDescription && task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {task.description}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {task.labelIds.map((labelId) => {
          const name = labelNames.get(labelId);
          return name ? (
            <span
              key={labelId}
              className="rounded-full bg-primary/10 px-2 py-px text-[10px] text-primary"
            >
              {name}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}

function Lane({
  lane,
  tasks,
  labelNames,
  showDescription,
  onOpen,
  onDropTask,
  onDropBefore,
}: {
  lane: (typeof LANES)[number];
  tasks: Task[];
  labelNames: Map<string, string>;
  showDescription: boolean;
  onOpen: (task: Task) => void;
  onDropTask: (taskId: string, status: Status) => void;
  onDropBefore: (taskId: string, status: Status, beforeTaskId: string) => void;
}) {
  const t = useT();
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) onDropTask(id, lane.id);
      }}
      className={cn(
        "flex min-h-40 w-64 shrink-0 flex-col rounded-xl border bg-muted/30 transition-colors",
        over && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t(lane.title as MessageKey)}</span>
        <span className="rounded-full bg-muted px-2 text-[11px]">{tasks.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((task) => (
          <Card
            key={task.id}
            task={task}
            labelNames={labelNames}
            showDescription={showDescription}
            onOpen={() => onOpen(task)}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/task-id", task.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDropBefore={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData("text/task-id");
              if (id && id !== task.id) onDropBefore(id, lane.id, task.id);
            }}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            {t("board.laneEmpty")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const selectCls =
  "h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary/60";

function TaskDialog({
  task,
  project,
  labels,
  onClose,
  onSaved,
}: {
  task: Task;
  project: TaskProject;
  labels: Label[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { rpc } = useBoardInner();
  const t = useT();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [status, setStatus] = useState<Status>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [labelIds, setLabelIds] = useState<string[]>(task.labelIds);
  const [comments, setComments] = useState<
    {
      id: string;
      authorName: string;
      createdAt: string;
      body: string;
    }[] | null
  >(null);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchComments = useCallback(() => {
    rpc
      .call("board_comments", { taskId: task.id })
      .then((res) =>
        setComments(
          res.comments.map((c) => ({
            id: c.id,
            authorName: c.authorName,
            createdAt: c.createdAt,
            body: c.body,
          })),
        ),
      )
      .catch(() => setComments([]));
  }, [rpc, task.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await rpc.call("board_update", {
        taskId: task.id,
        title: title.trim() === "" ? undefined : title.trim(),
        description,
        status,
        priority,
        dueDate: dueDate === "" ? null : dueDate,
        labelIds,
      });
      if (!res.ok) throw new Error(res.error.message);
      toast.success(t("toast.saved", { key: task.key }));
      onSaved();
      onClose();
    } catch (cause) {
      toast.error(msg(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("dialog.deleteConfirm", { key: task.key }))) return;
    setBusy(true);
    try {
      const { deleted } = await rpc.call("board_delete", { taskId: task.id });
      if (deleted) {
        toast.success(t("toast.deleted", { key: task.key }));
        onSaved();
        onClose();
      }
    } catch (cause) {
      toast.error(msg(cause));
    } finally {
      setBusy(false);
    }
  };

  const addComment = async () => {
    const body = commentText.trim();
    if (body === "") return;
    setBusy(true);
    try {
      await rpc.call("board_comment", { taskId: task.id, body, notify: false });
      setCommentText("");
      fetchComments();
    } catch (cause) {
      toast.error(msg(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-primary">{task.key}</span>
            <span className="text-xs text-muted-foreground">{project.name}</span>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t("dialog.fieldTitle")}
            className="h-9 text-base font-semibold"
          />
        </DialogHeader>
        <DialogDescription>{t("dialog.taskNote")}</DialogDescription>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("dialog.fieldStatus")}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className={selectCls}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`lanes.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("dialog.fieldPriority")}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={selectCls}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priorities.${p}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("dialog.fieldDueDate")}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={selectCls}
            />
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("dialog.fieldLabels")}
            <div className="flex flex-wrap gap-1 pt-1">
              {labels.map((label) => {
                const active = labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() =>
                      setLabelIds((ids) =>
                        active ? ids.filter((x) => x !== label.id) : [...ids, label.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2 py-px text-[11px]",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {label.name}
                  </button>
                );
              })}
              {labels.length === 0 ? <span>{t("dialog.noLabels")}</span> : null}
            </div>
          </div>
        </div>
        <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          {t("dialog.fieldDescription")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:border-primary/60"
          />
        </label>
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("dialog.comments")}
          </p>
          <div className="mt-1 max-h-40 space-y-2 overflow-y-auto">
            {(comments ?? []).map((c) => (
              <div key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
                <div className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{c.authorName}</span>
                  <span>{c.createdAt.slice(0, 10)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px]">{c.body}</p>
              </div>
            ))}
            {comments !== null && comments.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("dialog.noComments")}</p>
            ) : null}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("dialog.commentPlaceholder")}
              aria-label={t("dialog.commentPlaceholder")}
            />
            <Button
              onClick={addComment}
              disabled={busy || commentText.trim() === ""}
              aria-label={t("dialog.commentPlaceholder")}
            >
              <Icon name="MessageSquare" className="size-4" />
            </Button>
          </div>
        </div>
        <DialogFooter className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={remove}
            disabled={busy}
          >
            <Icon name="Trash2" className="size-4" />
            {t("dialog.delete")}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={save} disabled={busy}>
            {t("dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewTaskDialog({
  project,
  labels,
  onClose,
  onCreated,
}: {
  project: TaskProject;
  labels: Label[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { rpc } = useBoardInner();
  const t = useT();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (title.trim() === "") return;
    setBusy(true);
    try {
      const res = await rpc.call("board_create", {
        projectId: project.id,
        title: title.trim(),
        description,
        status,
        priority,
        dueDate: dueDate === "" ? null : dueDate,
        labelIds,
      });
      if (!res.ok) throw new Error(res.error.message);
      toast.success(t("toast.created", { key: res.task.key }));
      onCreated();
      onClose();
    } catch (cause) {
      toast.error(msg(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialog.newTaskTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialog.newTaskIn", { name: project.name, prefix: project.prefix })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("dialog.fieldTitlePlaceholder")}
            aria-label={t("dialog.fieldTitle")}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t("dialog.fieldDescriptionPlaceholder")}
            className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus-visible:border-primary/60"
          />
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("dialog.fieldStatus")}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
                className={selectCls}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`lanes.${s}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("dialog.fieldPriority")}
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={selectCls}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("dialog.fieldDueDate")}
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={selectCls}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => {
              const active = labelIds.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  onClick={() =>
                    setLabelIds((ids) =>
                      active ? ids.filter((x) => x !== label.id) : [...ids, label.id],
                    )
                  }
                  className={cn(
                    "rounded-full border px-2 py-px text-[11px]",
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {label.name}
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={create} disabled={busy || title.trim() === ""}>
            <Icon name="SectionAdd" className="size-4" />
            {t("dialog.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BoardPage() {
  const board = useBoard();
  const { taskProjects, selected, setSelected, tasks, labels, settings, error } =
    board;
  const { rpc } = board;
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const project = taskProjects?.find((p) => p.id === selected) ?? null;
  const labelNames = useMemo(
    () => new Map(labels.map((l) => [l.id, l.name])),
    [labels],
  );
  // UI locale: the "Board language" setting, auto = browser language.
  const locale = localeFromSetting(settings?.language);
  const t = useCallback<TFn>(
    (key, vars) => translate(locale, key, vars),
    [locale],
  );
  // Lanes the user wants visible (every column is toggleable in settings).
  const visibleLanes = useMemo(() => {
    const visible: Record<Status, boolean> = {
      backlog: settings?.showBacklog ?? true,
      todo: settings?.showTodo ?? true,
      in_progress: settings?.showInProgress ?? true,
      in_review: settings?.showInReview ?? true,
      done: settings?.showDone ?? true,
      canceled: settings?.showCanceled ?? true,
    };
    return LANES.filter((lane) => visible[lane.id]);
  }, [settings]);
  const byLane = useMemo(() => {
    const map = new Map<Status, Task[]>();
    for (const lane of LANES) map.set(lane.id, []);
    for (const task of tasks ?? []) map.get(task.status)?.push(task);
    return map;
  }, [tasks]);

  const move = useCallback(
    (taskId: string, status: Status, beforeTaskId?: string) => {
      rpc
        .call("board_move", {
          taskId,
          status,
          beforeTaskId: beforeTaskId ?? null,
        })
        .then((res) => {
          if (!res.ok) toast.error(res.error.message);
        })
        .catch((cause) => toast.error(msg(cause)));
    },
    [rpc],
  );

  return (
    <TCtx.Provider value={t}>
      <BoardCtx.Provider value={board}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <h1 className="text-sm font-semibold">{t("panel.title")}</h1>
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className={cn(selectCls, "max-w-72")}
            aria-label={t("board.tracker")}
          >
            {(taskProjects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            {tasks === null
              ? t("board.loading")
              : t("board.meta", { count: tasks.length })}
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={board.refetch}
              aria-label={t("board.refresh")}
            >
              <Icon name="FolderSync" className="size-4" />
            </Button>
            <Button size="sm" onClick={() => setCreating(true)} disabled={!project}>
              <Icon name="SectionAdd" className="size-4" />
              {t("board.newTask")}
            </Button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-1 gap-3 overflow-x-auto px-4 py-3">
          {visibleLanes.map((lane) => (
            <Lane
              key={lane.id}
              lane={lane}
              tasks={byLane.get(lane.id) ?? []}
              labelNames={labelNames}
              showDescription={settings?.cardDescription ?? true}
              onOpen={setOpenTask}
              onDropTask={(taskId, status) => move(taskId, status)}
              onDropBefore={(taskId, status, before) => move(taskId, status, before)}
            />
          ))}
        </div>
        {openTask && project ? (
          <TaskDialog
            task={openTask}
            project={project}
            labels={labels}
            onClose={() => setOpenTask(null)}
            onSaved={board.refetch}
          />
        ) : null}
        {creating && project ? (
          <NewTaskDialog
            project={project}
            labels={labels}
            onClose={() => setCreating(false)}
            onCreated={board.refetch}
          />
        ) : null}
      </div>
      </BoardCtx.Provider>
    </TCtx.Provider>
  );
}

// The default export must be definePluginApp(...). navPanel adds the page to
// the left navigation — visible for the whole project, any thread, any device.
export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "board",
    // Panel label from the initial locale (slot registration is static);
    // the board content itself follows the "Board language" setting.
    title: translate(detectLocale(), "panel.title"),
    icon: "SectionMove",
    path: "board",
    component: BoardPage,
  });
});
