/**
 * dsh-open-folder — host plugin body (v0.4).
 *
 * Two jobs:
 *
 * 1. Keep the Loader entry a valid, startable cordis plugin (the
 *    client-modules scan requires an enabled entry with a live fiber).
 *
 * 2. Provide a plugin-native open endpoint at
 *    `POST /plugins/dsh-open-folder/open`. The browser client half prefers it
 *    over the built-in `host.openPath` RPC because the built-in Windows
 *    implementation opens folders through `powershell.exe Invoke-Item`, which
 *    silently fails to surface an Explorer window for paths containing
 *    non-ASCII characters (e.g. `E:\Launcher\服务器\Bedrock\Manager_Fluent`).
 *    Spawning `explorer.exe` directly (CreateProcessW, UTF-16 argv) opens
 *    such paths reliably; darwin/linux use `open` / `xdg-open`.
 *
 * The endpoint is an exact route on the shared web server, same origin as
 * the GUI, and validates that the requested path is absolute and exists.
 *
 * `webServer` is declared as a hard dependency (inject), mirroring the
 * pattern used by shipped bundle plugins (dsh-browser etc.); the route is
 * registered inside an effect so it is installed once the fiber activates and
 * removed on unload. A small probe file is written under
 * `$DSH_HOME/logs/` on activation to make "did the host half actually load"
 * verifiable after a restart.
 */
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";

const name = "dsh-open-folder";
const OPEN_PATH = "/plugins/dsh-open-folder/open";
const inject = ["webServer"];

/** Start a detached native opener without waiting for (or trusting) its exit code. */
function spawnDetached(command, args) {
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.unref();
		child.on("error", () => {
			/* openers like explorer.exe always "succeed" asynchronously, so we
			 * optimistically acknowledge and let the OS resolve it. */
		});
		return true;
	} catch {
		return false;
	}
}

/** Open one absolute path with the OS default application. */
function openNativePath(path) {
	const platform = process.platform;
	if (platform === "win32") return spawnDetached("explorer.exe", [path]);
	if (platform === "darwin") return spawnDetached("open", [path]);
	if (platform === "linux") return spawnDetached("xdg-open", [path]);
	return false;
}

/** Write a small activation probe so a restart's load can be verified. */
function writeProbe(detail) {
	try {
		const home = process.env.DSH_HOME || join(homedir(), ".dsh");
		const file = join(home, "logs", "dsh-open-folder.probe.txt");
		writeFileSync(file, `${new Date().toISOString()} ${detail}\n`, { flag: "a" });
	} catch {}
}

function apply(ctx) {
	writeProbe("host half apply() running; webServer injected=" + (ctx.webServer !== void 0));

	ctx.effect(() => {
		try {
			const dispose = ctx.webServer.register({
				kind: "exact",
				path: OPEN_PATH,
				handler: async (req, res) => {
					const send = (status, payload) => {
						try {
							res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
							res.end(JSON.stringify(payload));
						} catch {}
					};
					try {
						if (req.method !== "POST") {
							send(405, { ok: false, error: "method not allowed" });
							return;
						}
						let raw = "";
						for await (const chunk of req) raw += chunk;
						let path = "";
						try {
							const parsed = JSON.parse(raw || "{}");
							if (typeof parsed?.path === "string") path = parsed.path;
						} catch {}
						if (path === "" || !isAbsolute(path)) {
							send(400, { ok: false, error: "path must be an absolute string" });
							return;
						}
						if (!existsSync(path)) {
							send(404, { ok: false, error: `path does not exist: ${path}` });
							return;
						}
						if (!openNativePath(path)) {
							send(500, { ok: false, error: "no native opener on this platform" });
							return;
						}
						send(200, { ok: true, opened: true });
					} catch (error) {
						send(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
					}
				}
			});
			writeProbe(`open endpoint registered: ${OPEN_PATH}`);
			console.log(`[${name}] open endpoint registered at ${OPEN_PATH}`);
			return dispose;
		} catch (error) {
			writeProbe(`open endpoint FAILED: ${error instanceof Error ? error.message : String(error)}`);
			console.warn(`[${name}] failed to register open endpoint:`, error);
			return () => {};
		}
	}, `${name}: open endpoint`);

	ctx.effect(() => () => void 0, `${name} lifecycle`);
}

export { apply, inject, name };
