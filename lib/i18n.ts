// Tiny i18n for the Tasks Kanban UI.
//
// Two locales (en, ru). The locale is picked once from the browser language
// (navigator.language) when the app bundle loads; Russian browsers get the
// Russian strings, everything else gets English. Strings live in one place so
// adding a locale is a matter of adding one dictionary below.

export type Locale = "en" | "ru";

export const en = {
  "panel.title": "Task board",
  "lanes.backlog": "Backlog",
  "lanes.todo": "To Do",
  "lanes.in_progress": "In Progress",
  "lanes.in_review": "In Review",
  "lanes.done": "Done",
  "lanes.canceled": "Canceled",
  "priorities.urgent": "Urgent",
  "priorities.high": "High",
  "priorities.medium": "Medium",
  "priorities.low": "Low",
  "priorities.none": "None",
  "board.loading": "loading…",
  "board.meta": "{count} tasks · live in BB Tasks",
  "board.refresh": "Refresh",
  "board.newTask": "New task",
  "board.tracker": "Tracker",
  "board.laneEmpty": "empty",
  "dialog.newTaskTitle": "New task",
  "dialog.newTaskIn": "Into tracker “{name}” ({prefix}-NN)",
  "dialog.fieldTitle": "Title",
  "dialog.fieldTitlePlaceholder": "Title",
  "dialog.fieldDescription": "Description",
  "dialog.fieldDescriptionPlaceholder": "Description (what exactly to do)",
  "dialog.fieldStatus": "Status",
  "dialog.fieldPriority": "Priority",
  "dialog.fieldDueDate": "Due date",
  "dialog.fieldLabels": "Labels",
  "dialog.noLabels": "no labels",
  "dialog.comments": "Comments",
  "dialog.noComments": "none yet",
  "dialog.commentPlaceholder": "Comment…",
  "dialog.save": "Save",
  "dialog.cancel": "Cancel",
  "dialog.delete": "Delete",
  "dialog.create": "Create",
  "dialog.taskNote":
    "The fields below change the real BB Tasks task; comments go into its history.",
  "dialog.deleteConfirm": "Delete task {key}?",
  "toast.saved": "{key} — saved",
  "toast.deleted": "{key} deleted",
  "toast.created": "Task {key} created",
  "toast.moved": "{key} moved to {status}",
} as const;

export const ru = {
  "panel.title": "Доска задач",
  "lanes.backlog": "Бэклог",
  "lanes.todo": "К исполнению",
  "lanes.in_progress": "В работе",
  "lanes.in_review": "На проверке",
  "lanes.done": "Готово",
  "lanes.canceled": "Отменено",
  "priorities.urgent": "Срочно",
  "priorities.high": "Высокий",
  "priorities.medium": "Средний",
  "priorities.low": "Низкий",
  "priorities.none": "Нет",
  "board.loading": "загрузка…",
  "board.meta": "задач: {count} · меняются в BB Tasks",
  "board.refresh": "Обновить",
  "board.newTask": "Задача",
  "board.tracker": "Трекер",
  "board.laneEmpty": "пусто",
  "dialog.newTaskTitle": "Новая задача",
  "dialog.newTaskIn": "В трекер «{name}» ({prefix}-NN)",
  "dialog.fieldTitle": "Название",
  "dialog.fieldTitlePlaceholder": "Название",
  "dialog.fieldDescription": "Описание",
  "dialog.fieldDescriptionPlaceholder": "Описание (что именно сделать)",
  "dialog.fieldStatus": "Статус",
  "dialog.fieldPriority": "Приоритет",
  "dialog.fieldDueDate": "Дедлайн",
  "dialog.fieldLabels": "Лейблы",
  "dialog.noLabels": "нет лейблов",
  "dialog.comments": "Комментарии",
  "dialog.noComments": "пока нет",
  "dialog.commentPlaceholder": "Комментарий…",
  "dialog.save": "Сохранить",
  "dialog.cancel": "Отмена",
  "dialog.delete": "Удалить",
  "dialog.create": "Создать",
  "dialog.taskNote":
    "Поля ниже меняют реальную задачу BB Tasks; комментарии идут в её историю.",
  "dialog.deleteConfirm": "Удалить задачу {key}?",
  "toast.saved": "{key} — сохранено",
  "toast.deleted": "{key} удалена",
  "toast.created": "Создана задача {key}",
  "toast.moved": "{key} перенесена в «{status}»",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = typeof en;

const DICT: Record<Locale, Messages> = { en, ru };

/**
 * Resolve the UI locale from the browser language.
 * Runs in the browser only (the app bundle); safe to call at module scope.
 */
export function detectLocale(): Locale {
  try {
    const nav =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : "en";
    return nav.toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch {
    return "en";
  }
}

/**
 * Translate one key with optional {placeholders}. Falls back to the key
 * itself so a missing string is visible instead of blank.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = DICT[locale][key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
