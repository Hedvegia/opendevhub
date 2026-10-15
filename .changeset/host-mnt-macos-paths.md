---
"opendevhub": patch
---

Fix worktree host paths on macOS with Docker Desktop: bind mount sources the daemon reports under `/host_mnt/...` are mapped back to the machine path, so new worktrees (for example from a Jira ticket) are recorded at an existing folder instead of the non-existent `/host_mnt` one.
