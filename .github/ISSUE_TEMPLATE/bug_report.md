name: Bug report
about: Something on the board does not match what BB Tasks shows
title: ""
labels: bug
assignees: ""
---

## What happened

<!-- What you saw on the board, and what you expected instead. -->

## Ground-truth state

Run these and paste the output (redact anything private):

```sh
bb --version
bb plugin logs tasks-kanban | tail -50
bb tasks show <TASK-KEY> --json
```

## Steps to reproduce

1.
2.
3.

## Board vs. tracker

<!-- Which card, which lane on the board, which status in `bb tasks list`? -->
