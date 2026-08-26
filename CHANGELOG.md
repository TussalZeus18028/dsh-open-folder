# Changelog

## v0.7.0 (2026-08-26)

- **Modern settings page redesign**: hero header (icon + title + subtitle), icon-led feature cards with an "Active" badge and feature tags, a refined toggle switch, and a dedicated last-opened card — all theme-token based for light/dark skins.
- Switch "on" state uses the success color and a white knob with a subtle border so it stays visible under every skin (some skins define the brand color as white).

## v0.6.0 (2026-08-26)

- **Toast notification switch**: Settings → Folder tools now has a "Show notifications" toggle (persisted in localStorage); when off, the bottom-right success/error toasts are suppressed (events are still logged internally).
- **Settings section renamed**: "打开文件夹 / Open folder" → "文件夹工具 / Folder tools", making the section a home for future folder/workspace tools.

## v0.5.0 (2026-08-26)

- **Product-style settings page**: the Settings → Open folder section is now a concise usage note with the last opened path; the developer-style diagnostics (version, capability status, event log, error history, test button) are no longer shown (diagnostics recording stays in place for future troubleshooting).
- `useState` no longer used by the settings component.

## v0.4.0 (2026-08-26)

- **Chinese paths open reliably**: plugin-native `POST /plugins/dsh-open-folder/open` endpoint spawns `explorer.exe` directly (UTF-16 argv), fixing the built-in `host.openPath` Windows opener (`powershell.exe Invoke-Item`) which returns success without surfacing a window for non-ASCII paths. Client prefers the endpoint and falls back to the built-in RPC.
- **Light/dark theme fix**: settings page buttons/cards/toasts now use real `--dsw-alias-*` theme tokens (previously used non-existent tokens, so the test button was unreadable in light mode).
- Host half declares `webServer` via inject so the endpoint route is registered reliably.

## v0.3.0 (2026-08-26)

- **Settings diagnostics section** (Settings → Open folder): host capability status, live event log (menu injection, resolved paths, RPC results, errors), error history, and a "test open current session folder" button.
- **Success confirmation toast** with the opened path (useful when the Explorer window opens on a remote/other desktop).

## v0.2.0 (2026-08-26)

- **Workspace identification fixed**: session rows and workspace group rows are siblings in the DOM, not parent/child; the plugin now scans preceding siblings for the workspace project row, so every rendered session row resolves to the correct folder (blank "新会话" rows, duplicate titles, archived rows).
- **Capability pre-check** via `host.describe().canOpenPath`: the menu item is not injected when the host cannot open local paths.
- **Menu targeting**: only session-row menus are injected; workspace ⋯ menus are excluded.
- **No polling**: re-injection driven by MutationObserver + pointer events.

## v0.1.0 (2026-08-26)

- Initial release: injects "打开文件夹 / Open folder" into the session-row ⋯ menu and opens the session's workspace folder via `host.openPath`.
