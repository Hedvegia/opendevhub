---
"opendevhub": patch
---

Fix `devcontainer up` and terminals still failing with `posix_spawnp failed` on macOS after a `pnpm install` while opendevhub is running: node-pty's `spawn-helper` execute bit is now restored right before each spawn, not only at startup.
