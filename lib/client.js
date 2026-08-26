/**
 * dsh-open-folder — browser client half (v0.3).
 *
 * 1) Adds an "打开文件夹 / Open folder" item to the workspace session row
 *    overflow (⋯) menu and opens the session's folder with the host OS via
 *    the `host.openPath` RPC.
 * 2) Registers its own settings page (settings.section "打开文件夹"), which
 *    acts as a diagnostics console: host capability status, a live event log
 *    of every menu open / resolved path / RPC result / error, the error
 *    history, and a "test open current session folder" button — so when
 *    something "does nothing", the reason is visible here.
 *
 * The session-row menus are rendered by the shipped workspace UI with no
 * public menu-item slot, so the menu item is injected into the open menu DOM.
 * Reliability notes:
 *
 * 1. WORKSPACE IDENTIFICATION: session rows and workspace group rows are
 *    SIBLINGS inside one `[role=tree]` container. We scan PRECEDING SIBLINGS
 *    at every ancestor level for the workspace project row
 *    (`[role=treeitem][aria-expanded]`) and resolve the folder from that
 *    workspace's registry entry. Every rendered session row therefore maps to
 *    a folder (blank "新会话" rows, duplicate titles and archived rows too).
 * 2. CAPABILITY GATE: `host.openPath` is only offered when
 *    `host.describe().canOpenPath` is true; otherwise the menu item is not
 *    injected and the settings page says why.
 * 3. MENU TARGETING: only session menus are touched — workspace ⋯ buttons
 *    are explicitly excluded, and an open menu is only injected when armed by
 *    a session button recently or already accepted; the fork/archive label
 *    check stays as a backup discriminator.
 * 4. NO POLLING: re-injection is driven by a MutationObserver plus the
 *    pointer events the menu already generates — no interval.
 * 5. VISIBLE FEEDBACK: success shows a confirmation notice with the opened
 *    path (so a host-side Explorer window that opens on a remote/other
 *    desktop is still acknowledged); failures show a notice AND are recorded
 *    in the settings diagnostics page.
 */
window.__ModuleLoader__.load({
	id: "dsh-open-folder",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { createElement: el } = React;

		const PLUGIN = "dsh-open-folder";
		const VERSION = "0.5.0";
		const MAX_EVENTS = 40;
		const MAX_ERRORS = 8;
		const OPEN_ENDPOINT = "/plugins/dsh-open-folder/open";

		/** 16px folder-open glyph (IconFolderOpen16 path data). */
		const FOLDER_ICON_SVG =
			'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
			'<path d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" fill="currentColor"/>' +
			'<path opacity="0.2" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z" fill="currentColor"/>' +
			"</svg>";

		/** Localized strings; every user-visible message comes from here. */
		const T = {
			zh: {
				sectionLabel: "打开文件夹",
				intro: "在侧边栏的会话行 ⋯ 菜单中，点击「打开文件夹」，即可在系统文件管理器中打开该会话所属工作区的文件夹。",
				introPoint1: "打开成功后，右下角会显示已打开的路径。",
				introPoint2: "支持含中文的路径；菜单项随界面语言显示「打开文件夹 / Open folder」。",
				lastOpenedLabel: "最近打开",
				lastOpenedNone: "（暂无）",
				item: "打开文件夹",
				opened: (path) => `已打开文件夹：${path}`,
				failResolve: (label) => `打开文件夹失败：无法确定“${label}”所属工作区的目录`,
				failOpen: (reason) => `打开文件夹失败：${reason}`,
				failNoCapability: "打开文件夹失败：当前宿主不支持打开本地路径"
			},
			en: {
				sectionLabel: "Open folder",
				intro: 'Click "Open folder" in the ⋯ menu of a session row in the sidebar to open that session\'s workspace folder in your file manager.',
				introPoint1: "After a successful open, the path is shown in a notification at the bottom-right.",
				introPoint2: "Paths containing non-ASCII characters are supported; the menu item follows the UI language (\"Open folder\" / \"打开文件夹\").",
				lastOpenedLabel: "Last opened",
				lastOpenedNone: "(none)",
				item: "Open folder",
				opened: (path) => `Opened folder: ${path}`,
				failResolve: (label) => `Failed to open folder: cannot resolve the workspace directory of "${label}"`,
				failOpen: (reason) => `Failed to open folder: ${reason}`,
				failNoCapability: "Failed to open folder: this host cannot open local paths"
			}
		};

		/** Aria-label shapes of the session-row and workspace-row overflow buttons. */
		const SESSION_ARIA_ZH = /^会话[“"](.*)[”"]的操作$/;
		const SESSION_ARIA_EN = /^Session actions for (.*)$/;
		const WORKSPACE_ARIA_ZH = /^工作区[“"](.*)[”"]的操作$/;
		const WORKSPACE_ARIA_EN = /^Workspace actions for (.*)$/;

		/** Label texts that additionally identify a session-row menu (backup discriminator). */
		const SESSION_MENU_LABELS = ["分叉会话", "归档会话", "Fork session", "Archive session"];

		/** How long a recorded button activation still counts as "this menu's opener". */
		const ARM_TTL = 15000;

		/** Tiny snapshot store driving the diagnostics page (zustand-like). */
		function createStore(initial) {
			let snapshot = initial;
			const listeners = new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe: (fn) => {
					listeners.add(fn);
					return () => { listeners.delete(fn); };
				},
				set: (patch) => {
					const next = typeof patch === "function" ? patch(snapshot) : patch;
					if (next === snapshot) return;
					snapshot = next;
					for (const fn of [...listeners]) fn();
				}
			};
		}

		/** Settings-page component (product-style: usage notes + last opened).
		 * Props: { useDiagnostics, api }. */
		function OpenFolderSection(props) {
			const useDiagnostics = props.useDiagnostics;
			const api = props.api;
			const diag = useDiagnostics !== void 0 ? useDiagnostics((s) => s) : null;
			const t = api.t();
			const fmt = (at) => {
				try { return new Date(at).toLocaleString(); } catch { return String(at); }
			};
			const lastOpened = diag?.lastOpened ?? null;

			return el("div", { className: "dof-root" },
				el("div", { className: "dof-card" },
					el("p", { className: "dof-note" }, t.intro),
					el("p", { className: "dof-note" }, t.introPoint1),
					el("p", { className: "dof-note" }, t.introPoint2),
					el("div", { className: "dof-row" },
						el("span", { className: "k" }, t.lastOpenedLabel),
						lastOpened !== null
							? el("span", { className: "dof-path" }, lastOpened.path, el("span", { className: "dof-tm" }, " · " + fmt(lastOpened.at)))
							: el("span", { className: "dof-neu" }, t.lastOpenedNone))
				)
			);
		}

		function apply(ctx) {
			const connection = ctx.get("connection");
			const sessions = ctx.get("sessions");
			const workspaces = ctx.get("workspaces");
			const locale = ctx.get("locale");

			const store = createStore({
				status: { ready: false, canOpenPath: false, describeError: null },
				stats: { opened: 0, failed: 0 },
				events: [],
				errors: [],
				lastOpened: null,
				test: null
			});

			const uiLang = () => {
				try {
					const active = locale?.getSnapshot?.()?.active;
					if (active === "zh" || active === "en") return active;
				} catch {}
				const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
				return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
			};
			const t = () => T[uiLang()] ?? T.en;
			const log = (kind, text) => {
				store.set((s) => ({
					...s,
					events: [...s.events, { at: Date.now(), kind, text }].slice(-MAX_EVENTS),
					errors: kind === "error" ? [...s.errors, { at: Date.now(), text }].slice(-MAX_ERRORS) : s.errors
				}));
			};

			/** The session row whose menu is about to open / just opened. */
			let pending = null;
			/** Open menu element → its bound target snapshot. */
			const menuSnapshots = new WeakMap();
			/** host.describe result. */
			const capability = { ready: false, canOpenPath: false };

			const isSessionButton = (btn) =>
				SESSION_ARIA_ZH.test(btn?.getAttribute("aria-label") ?? "") ||
				SESSION_ARIA_EN.test(btn?.getAttribute("aria-label") ?? "");
			const isWorkspaceButton = (btn) =>
				WORKSPACE_ARIA_ZH.test(btn?.getAttribute("aria-label") ?? "") ||
				WORKSPACE_ARIA_EN.test(btn?.getAttribute("aria-label") ?? "");

			const titleFromButton = (btn) => {
				const aria = btn?.getAttribute("aria-label") ?? "";
				const zh = SESSION_ARIA_ZH.exec(aria);
				if (zh !== null) return zh[1].trim();
				const en = SESSION_ARIA_EN.exec(aria);
				if (en !== null) return en[1].trim();
				return "";
			};

			/**
			 * Workspace title of the group the row sits in. Session rows are
			 * SIBLINGS of their workspace project row, so we scan PRECEDING
			 * siblings at every ancestor level for a project row
			 * (`role=treeitem` with `aria-expanded`); its first text line is the
			 * workspace display title. Returns "" when no group is found.
			 */
			const workspaceLabelOf = (row) => {
				let current = row;
				for (let depth = 0; current instanceof Element && depth < 6; depth++) {
					const parent = current.parentElement;
					if (!(parent instanceof Element)) break;
					const children = Array.from(parent.children);
					const idx = children.indexOf(current);
					if (idx > 0) {
						for (let i = idx - 1; i >= 0; i--) {
							const sib = children[i];
							if (!(sib instanceof Element)) continue;
							if (!sib.matches('[role="treeitem"][aria-expanded]')) continue;
							const text = (sib.innerText ?? "").trim();
							const first = text.split("\n")[0].trim();
							if (first !== "") return first;
						}
					}
					current = parent;
				}
				return "";
			};

			const rowOf = (btn) => {
				if (!(btn instanceof Element)) return null;
				const row = btn.closest('[role="treeitem"]');
				return row instanceof Element ? row : null;
			};

			/** A visible, self-dismissing notice (dark/light theme aware). */
			const showToast = (message, kind) => {
				try {
					let box = document.getElementById("dsh-open-folder-toast");
					if (box === null) {
						box = document.createElement("div");
						box.id = "dsh-open-folder-toast";
						box.style.cssText =
							"position:fixed;right:16px;bottom:16px;z-index:99999;max-width:420px;" +
							"background:var(--dsw-alias-bg-overlay,#26262b);color:var(--dsw-alias-label-primary,#f2f2f2);" +
							"border:1px solid var(--dsw-alias-border-l2,#3d3d45);border-radius:10px;" +
							"padding:10px 14px;font-size:13px;line-height:1.5;" +
							"box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;" +
							"opacity:1;transition:opacity .25s;";
						document.body.appendChild(box);
					}
					box.textContent = message;
					box.style.borderColor = kind === "ok"
						? "var(--dsw-alias-state-success-primary,#3ba272)"
						: "var(--dsw-alias-state-error-primary,#e5534b)";
					box.style.opacity = "1";
					clearTimeout(box._dshTimer);
					box._dshTimer = setTimeout(() => {
						box.style.opacity = "0";
					}, 6000);
				} catch {}
			};

			/** Resolve the folder to open for one row target (workspace-first). */
			const resolvePath = (target) => {
				try {
					const wsItems = workspaces.list.getSnapshot().items ?? [];
					const sessionList = sessions.list.getSnapshot();
					const findWs = (title) => {
						for (const item of wsItems) {
							const view = item?.view ?? item?.getSnapshot?.()?.view;
							if (view !== null && typeof view === "object" && view.title === title) return view;
						}
						return null;
					};
					const sessionIdInWs = (view, title) => {
						if (!Array.isArray(view.sessionIds)) return null;
						for (const id of view.sessionIds) {
							const s = sessionList.byId[id];
							if (s === void 0) continue;
							if (s.displayTitle === title || s.title === title) return id;
						}
						return null;
					};

					// 1) The workspace group the row physically sits in (strongest).
					if (target.workspaceLabel !== "") {
						const ws = findWs(target.workspaceLabel);
						if (ws !== null) {
							const matchedId = sessionIdInWs(ws, target.title);
							if (matchedId !== null) {
								const s = sessionList.byId[matchedId];
								if (typeof s?.cwd === "string" && s.cwd !== "") return s.cwd;
							}
							if (typeof ws.path === "string" && ws.path !== "") return ws.path;
							if (typeof ws.cwd === "string" && ws.cwd !== "") return ws.cwd;
						}
					}
					// 2) Exact session-title match (flat layout / group not found).
					let matchedId;
					for (const id of sessionList.ids) {
						const s = sessionList.byId[id];
						if (s === void 0) continue;
						if (s.displayTitle !== target.title && s.title !== target.title) continue;
						if (typeof s.cwd === "string" && s.cwd !== "") return s.cwd;
						if (matchedId === void 0) matchedId = id;
					}
					if (matchedId !== void 0) {
						for (const item of wsItems) {
							const view = item?.view ?? item?.getSnapshot?.()?.view;
							if (view !== null && typeof view === "object" && Array.isArray(view.sessionIds) && view.sessionIds.includes(matchedId)) {
								if (typeof view.path === "string" && view.path !== "") return view.path;
								if (typeof view.cwd === "string" && view.cwd !== "") return view.cwd;
							}
						}
					}
					// 3) Current session, last resort.
					const current = sessionList.current;
					if (current !== void 0) {
						const s = sessionList.byId[current];
						if (typeof s?.cwd === "string" && s.cwd !== "") return s.cwd;
						for (const item of wsItems) {
							const view = item?.view ?? item?.getSnapshot?.()?.view;
							if (view !== null && typeof view === "object" && Array.isArray(view.sessionIds) && view.sessionIds.includes(current)) {
								if (typeof view.path === "string" && view.path !== "") return view.path;
							}
						}
					}
				} catch (error) {
					console.warn(`[${PLUGIN}] resolvePath failed:`, error);
				}
				return null;
			};

			/** Target for the current session (settings-page test button). */
			const currentTarget = () => {
				try {
					const list = sessions.list.getSnapshot();
					if (list.current !== void 0) {
						const s = list.byId[list.current];
						if (s !== void 0) {
							return { title: s.displayTitle ?? s.title ?? "", workspaceLabel: "", anchor: null };
						}
					}
				} catch {}
				return { title: "", workspaceLabel: "", anchor: null };
			};

			/** Ask the host to open a resolved path; records stats + events + toast.
			 * Preferred: the plugin-native open endpoint (reliable for paths with
			 * non-ASCII characters, which the built-in `Invoke-Item` opener fails
			 * to surface). Falls back to the built-in `host.openPath` RPC when the
			 * endpoint is unavailable (e.g. the host half has not been reloaded). */
			const requestOpen = async (path, source) => {
				log("info", `请求宿主打开：${path}（${source}）`);
				const succeed = () => {
					store.set((s) => ({
						...s,
						stats: { ...s.stats, opened: s.stats.opened + 1 },
						lastOpened: { at: Date.now(), path }
					}));
					log("ok", `打开成功：${path}`);
					showToast(t().opened(path), "ok");
					return { ok: true, path };
				};
				const fail = (reason) => {
					store.set((s) => ({ ...s, stats: { ...s.stats, failed: s.stats.failed + 1 } }));
					log("error", `打开失败：${reason}`);
					showToast(t().failOpen(reason), "error");
					return { ok: false, error: reason };
				};
				try {
					// 1) plugin-native endpoint (explorer.exe / open / xdg-open).
					// Any endpoint failure falls through to the built-in RPC below.
					let endpointOk = false;
					let endpointReason = null;
					try {
						const res = await fetch(OPEN_ENDPOINT, {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ path })
						});
						let data = null;
						try { data = await res.json(); } catch {}
						if (res.status === 200 && data?.ok === true) endpointOk = true;
						else endpointReason = data?.error ?? `HTTP ${res.status}`;
					} catch (endpointError) {
						endpointReason = endpointError instanceof Error ? endpointError.message : String(endpointError);
					}
					if (endpointOk) return succeed();
					log("info", `插件端点不可用（${endpointReason}），回退内置 host.openPath`);
					// 2) fallback: built-in host.openPath RPC.
					const response = await connection.api.host.openPath({ path });
					if (response?.result?.ok === true) return succeed();
					const reason = response?.result?.error?.message ?? String(response?.result?.error ?? "unknown");
					return fail(reason);
				} catch (error) {
					return fail(error instanceof Error ? error.message : String(error));
				}
			};

			const openFolder = async (target, source) => {
				if (target === null || target === void 0) return;
				closeMenu(target);
				const label = target.title === "" ? "?" : target.title;
				const path = resolvePath(target);
				if (path === null || path === "") {
					store.set((s) => ({ ...s, stats: { ...s.stats, failed: s.stats.failed + 1 } }));
					log("error", `未能解析“${label}”的工作目录`);
					showToast(t().failResolve(label), "error");
					return;
				}
				log("info", `解析路径：${path}（会话“${label}”）`);
				void requestOpen(path, source ?? "菜单");
			};

			/** Cancel the menu's closeOnPointerLeave arm: synthesize the same
			 * pointerenter condition React's own cancel path uses. */
			const cancelArm = (anchor) => {
				try {
					const span = anchor?.parentElement;
					if (!(span instanceof Element)) return;
					span.dispatchEvent(new PointerEvent("pointerover", {
						bubbles: true,
						relatedTarget: document.body
					}));
				} catch {}
			};

			/** Close the open menu, preferring the anchor's own toggle. */
			const closeMenu = (target) => {
				const openMenu = document.querySelector('[role="menu"]');
				if (openMenu === null) return;
				const openSnapshot = menuSnapshots.get(openMenu);
				try {
					const anchor = target.anchor ?? openSnapshot?.anchor;
					if (anchor?.isConnected === true) anchor.click();
				} catch {}
				if (document.querySelector('[role="menu"]') !== null) {
					document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
				}
			};

			/** Append the injected item to one open session-row menu. */
			const injectIntoMenu = (menu) => {
				if (!capability.ready || !capability.canOpenPath) return;
				const items = [...menu.querySelectorAll('[role="menuitem"]')];
				if (items.some((button) => button.dataset.dshOpenFolderItem === "1")) return;
				const alreadyAccepted = menuSnapshots.has(menu);
				const isSessionMenu = items.some((button) => SESSION_MENU_LABELS.includes(button.innerText.trim()));
				if (!alreadyAccepted && !isSessionMenu) return;
				if (!alreadyAccepted && (pending === null || Date.now() - pending.at > ARM_TTL)) return;
				const viewport = menu.querySelector('[role="presentation"]');
				if (!(viewport instanceof Element)) return;

				const snapshot = {
					title: pending.title,
					workspaceLabel: pending.workspaceLabel,
					anchor: pending.anchor
				};
				menuSnapshots.set(menu, snapshot);
				log("info", `已向会话“${snapshot.title}”的菜单注入“${t().item}”`);

				const reference = items[0];
				const spans = reference?.querySelectorAll("span") ?? [];
				const wrap = document.createElement("div");
				wrap.className = reference?.parentElement?.className ?? "";
				const button = document.createElement("button");
				button.type = "button";
				button.role = "menuitem";
				button.className = reference?.className ?? "";
				button.dataset.dshOpenFolderItem = "1";
				const icon = document.createElement("span");
				icon.className = spans[0]?.className ?? "";
				icon.innerHTML = FOLDER_ICON_SVG;
				const label = document.createElement("span");
				label.className = spans[1]?.className ?? "";
				label.textContent = t().item;
				button.append(icon, label);
				wrap.appendChild(button);
				viewport.appendChild(wrap);
			};

			// Probe whether the host can open native paths; injection stays off
			// until the answer is in (and stays off forever when it is "no").
			try {
				connection.api.host.describe({}).then((response) => {
					capability.ready = true;
					capability.canOpenPath = response?.result?.ok === true && response?.result?.value?.canOpenPath === true;
					store.set((s) => ({
						...s,
						status: {
							ready: true,
							canOpenPath: capability.canOpenPath,
							describeError: response?.result?.ok === true ? null : (response?.result?.error?.message ?? "describe failed")
						}
					}));
					log(capability.canOpenPath ? "ok" : "error",
						capability.canOpenPath ? "宿主能力检测：支持打开本地路径" : "宿主能力检测：不支持打开本地路径（菜单项已禁用）");
				}).catch((error) => {
					capability.ready = true;
					store.set((s) => ({
						...s,
						status: { ready: true, canOpenPath: false, describeError: error instanceof Error ? error.message : String(error) }
					}));
					log("error", `宿主能力检测失败：${error instanceof Error ? error.message : String(error)}`);
				});
			} catch (error) {
				capability.ready = true;
				store.set((s) => ({
					...s,
					status: { ready: true, canOpenPath: false, describeError: error instanceof Error ? error.message : String(error) }
				}));
			}

			// Settings page (diagnostics console).
			const slots = ctx.get("slots");
			if (slots !== void 0) {
				const api = {
					t: () => t(),
					testOpen: async () => {
						const target = currentTarget();
						const path = resolvePath(target);
						if (path === null || path === "") {
							const msg = t().failResolve(target.title === "" ? "?" : target.title);
							store.set((s) => ({ ...s, test: { ok: false, error: msg } }));
							log("error", `测试失败：${msg}`);
							return { ok: false };
						}
						store.set((s) => ({ ...s, test: { ok: false, running: true, path } }));
						const result = await requestOpen(path, "设置页测试");
						store.set((s) => ({ ...s, test: { ok: result.ok, path, error: result.error ?? null } }));
						return result;
					}
				};
				slots.inject("settings.section", () => {
					const dispose = slots.register({
						name: "settings.section",
						id: "open-folder",
						order: 180,
						label: () => t().sectionLabel,
						inject: () => ({ hooks: { diagnostics: store }, api })
					}, OpenFolderSection);
					return dispose;
				});
			}

			ctx.effect(() => {
				const recordTarget = (btn) => {
					const row = rowOf(btn);
					pending = {
						title: titleFromButton(btn),
						workspaceLabel: workspaceLabelOf(row),
						anchor: btn,
						at: Date.now()
					};
				};
				const onPointerDown = (event) => {
					const btn = event.target instanceof Element ? event.target.closest("button[aria-label]") : null;
					if (isSessionButton(btn)) recordTarget(btn);
				};
				const onClickCapture = (event) => {
					const btn = event.target instanceof Element ? event.target.closest("button[aria-label]") : null;
					if (isSessionButton(btn)) recordTarget(btn);
				};
				const onFocusIn = (event) => {
					const btn = event.target instanceof Element ? event.target.closest("button[aria-label]") : null;
					if (isSessionButton(btn)) recordTarget(btn);
				};
				const onPointerOver = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					const menu = target.closest('[role="menu"]');
					if (menu === null) return;
					const anchor = menuSnapshots.get(menu)?.anchor ?? pending?.anchor;
					if (anchor !== void 0) cancelArm(anchor);
					scan();
				};
				const onDelegatedClick = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					const item = target.closest('[data-dsh-open-folder-item="1"]');
					if (item === null) return;
					const menu = item.closest('[role="menu"]');
					const snapshot = (menu !== null && menuSnapshots.get(menu) !== void 0)
						? menuSnapshots.get(menu)
						: (pending ?? null);
					if (snapshot === null) return;
					event.preventDefault();
					event.stopPropagation();
					void openFolder(snapshot, "菜单");
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("click", onClickCapture, true);
				document.addEventListener("focusin", onFocusIn, true);
				document.addEventListener("pointerover", onPointerOver, true);
				document.addEventListener("click", onDelegatedClick, true);

				let scheduled = false;
				const scan = () => {
					if (scheduled) return;
					scheduled = true;
					queueMicrotask(() => {
						scheduled = false;
						for (const menu of document.querySelectorAll('[role="menu"]')) {
							try {
								injectIntoMenu(menu);
							} catch (error) {
								console.warn(`[${PLUGIN}] injectIntoMenu failed:`, error);
							}
						}
					});
				};
				const observer = new MutationObserver(scan);
				observer.observe(document.body, { childList: true, subtree: true });

				return () => {
					observer.disconnect();
					document.removeEventListener("pointerdown", onPointerDown, true);
					document.removeEventListener("click", onClickCapture, true);
					document.removeEventListener("focusin", onFocusIn, true);
					document.removeEventListener("pointerover", onPointerOver, true);
					document.removeEventListener("click", onDelegatedClick, true);
					pending = null;
				};
			}, `${PLUGIN}: session-menu open-folder hook`);

			// Section styles (theme-following, injected once).
			try {
				const id = "dsh-open-folder/css";
				if (document.getElementById(id) === null) {
					const tag = document.createElement("style");
					tag.id = id;
					tag.textContent = [
						".dof-root{max-width:640px}",
						".dof-card{border:1px solid var(--dsw-alias-border-l1,#3d3d45);border-radius:10px;padding:12px 14px;margin:0 0 12px;background:var(--dsw-alias-bg-layer-1,#202024)}",
						".dof-h{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f2f2)}",
						".dof-row{display:flex;gap:8px;font-size:12px;line-height:22px;color:var(--dsw-alias-label-secondary,#c9c9cf)}",
						".dof-row .k{flex:none;width:150px;color:var(--dsw-alias-label-secondary,#8f8f96)}",
						".dof-ok{color:var(--dsw-alias-state-success-primary,#3ba272)}",
						".dof-bad{color:var(--dsw-alias-state-error-primary,#e5534b)}",
						".dof-neu{color:var(--dsw-alias-label-secondary,#8f8f96)}",
						".dof-path{word-break:break-all}",
						".dof-tm{color:var(--dsw-alias-label-secondary,#8f8f96)}",
						".dof-evt{font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#c9c9cf);word-break:break-all}",
						".dof-evt .tm{color:var(--dsw-alias-label-secondary,#8f8f96);margin-right:8px;font-variant-numeric:tabular-nums}",
						".dof-evt.error{color:var(--dsw-alias-state-error-primary,#e5534b)}",
						".dof-evt.ok{color:var(--dsw-alias-state-success-primary,#3ba272)}",
						".dof-note{font-size:12px;color:var(--dsw-alias-label-secondary,#8f8f96);line-height:1.6;margin:0 0 12px}",
						".dof-testrow{margin:8px 0}",
						".dof-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1,#3d3d45);background:var(--dsw-alias-bg-layer-2,#2b2b31);color:var(--dsw-alias-label-primary,#f2f2f2);font-size:12px;cursor:pointer}",
						".dof-btn:hover{background:var(--dsw-alias-bg-overlay,#33333b)}",
						".dof-btn:disabled{opacity:.5;cursor:default}",
						".dof-testresult{margin-top:8px;font-size:12px;line-height:1.6;word-break:break-all}"
					].join("\n");
					document.head.appendChild(tag);
				}
			} catch {}
		}

		const inject = ["connection", "sessions", "workspaces", "locale"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
