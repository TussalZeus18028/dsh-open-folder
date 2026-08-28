/**
 * dsh-open-folder — browser client half (v0.8).
 *
 * 1) Adds an "打开文件夹 / Open folder" item to the workspace session row
 *    overflow (⋯) menu and opens the session's folder with the host OS via
 *    the `host.openPath` RPC.
 * 2) Registers its own settings page (settings.section "打开文件夹"), which
 *    acts as a diagnostics console: host capability status, a live event log
 *    of every menu open / resolved path / RPC result / error, the error
 *    history, and a "test open current session folder" button — so when
 *    something "does nothing", the reason is visible here.
 * 3) Hosts the settings-panel scrollbar fix (moved here from
 *    dsh-conflict-checker v0.2): a toggleable nav-list scrollbar for the
 *    settings panel, persisted in localStorage.
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
		const VERSION = "0.8.0";
		const MAX_EVENTS = 40;
		const MAX_ERRORS = 8;
		const OPEN_ENDPOINT = "/plugins/dsh-open-folder/open";
		const TOAST_KEY = "dsh-open-folder.toast-enabled";
		const SCROLLFIX_KEY = "dsh-open-folder.scrollfix-enabled";

		/** 16px folder-open glyph (IconFolderOpen16 path data). */
		const FOLDER_ICON_SVG =
			'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
			'<path d="M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" fill="currentColor"/>' +
			'<path opacity="0.2" d="M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z" fill="currentColor"/>' +
			"</svg>";

		/** 15px bell glyph (Feather "bell"). */
		const BELL_ICON_SVG =
			'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
			'<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
			"</svg>";

		/** 15px clock glyph (Feather "clock"). */
		const CLOCK_ICON_SVG =
			'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
			'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' +
			"</svg>";

		/** 15px scroll glyph (Feather "scroll"). */
		const SCROLL_ICON_SVG =
			'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
			'<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>' +
			"</svg>";

		/** Localized strings; every user-visible message comes from here. */
		const T = {
			zh: {
				sectionLabel: "文件夹工具",
				sectionSubtitle: "侧边栏会话的文件夹与文件工具",
				intro: "在侧边栏的会话行 ⋯ 菜单中，点击「打开文件夹」，即可在系统文件管理器中打开该会话所属工作区的文件夹。打开成功后，右下角会显示已打开的路径。",
				enabledBadge: "已启用",
				tagZh: "支持中文路径",
				tagLang: "随界面语言显示",
				toastLabel: "显示通知提示",
				toastHint: "打开成功或失败时，在右下角显示提示条。",
				toastOn: "已开启",
				toastOff: "已关闭",
				scrollfixLabel: "设置面板滚动条修复",
				scrollfixHint: "当设置面板导航列内容过多被底部裁切时，自动为导航列启用滚动条，让所有设置项完整可见。默认开启。",
				scrollfixOn: "已开启",
				scrollfixOff: "已关闭",
				lastOpenedLabel: "最近打开",
				lastOpenedNone: "（暂无）",
				item: "打开文件夹",
				opened: (path) => `已打开文件夹：${path}`,
				failResolve: (label) => `打开文件夹失败：无法确定“${label}”所属工作区的目录`,
				failOpen: (reason) => `打开文件夹失败：${reason}`,
				failNoCapability: "打开文件夹失败：当前宿主不支持打开本地路径"
			},
			en: {
				sectionLabel: "Folder tools",
				sectionSubtitle: "Folder and file tools for sidebar sessions",
				intro: 'Click "Open folder" in the ⋯ menu of a session row in the sidebar to open that session\'s workspace folder in your file manager. After a successful open, the path is shown in a notification at the bottom-right.',
				enabledBadge: "Active",
				tagZh: "Non-ASCII paths",
				tagLang: "Follows UI language",
				toastLabel: "Show notifications",
				toastHint: "Show a toast at the bottom-right when opening succeeds or fails.",
				toastOn: "On",
				toastOff: "Off",
				scrollfixLabel: "Settings panel scrollbar fix",
				scrollfixHint: "When the settings nav list is taller than its box, enable a scrollbar on the nav column so every entry stays reachable. On by default.",
				scrollfixOn: "On",
				scrollfixOff: "Off",
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

		/** Settings-page component (modern product-style). Props: { useDiagnostics, api }. */
		function OpenFolderSection(props) {
			const useDiagnostics = props.useDiagnostics;
			const api = props.api;
			const diag = useDiagnostics !== void 0 ? useDiagnostics((s) => s) : null;
			const t = api.t();
			const fmt = (at) => {
				try { return new Date(at).toLocaleString(); } catch { return String(at); }
			};
			const lastOpened = diag?.lastOpened ?? null;
			const toastEnabled = diag?.toastEnabled !== false;
			const scrollfixEnabled = diag?.scrollfixEnabled !== false;

			const toggleToast = () => {
				api.setToastEnabled(!toastEnabled);
			};

			const toggleScrollfix = () => {
				api.setScrollfixEnabled(!scrollfixEnabled);
			};

			return el("div", { className: "dof-root" },
				// Hero header
				el("div", { className: "dof-hero" },
					el("div", { className: "dof-hero-icon" },
						el("span", { dangerouslySetInnerHTML: { __html: FOLDER_ICON_SVG } })),
					el("div", { className: "dof-hero-text" },
						el("div", { className: "dof-hero-title" }, t.sectionLabel),
						el("div", { className: "dof-hero-sub" }, t.sectionSubtitle))
				),

				// Feature card
				el("div", { className: "dof-card" },
					el("div", { className: "dof-card-head" },
						el("span", { className: "dof-card-icon" },
							el("span", { dangerouslySetInnerHTML: { __html: FOLDER_ICON_SVG } })),
						el("div", { className: "dof-card-title" }, t.item),
						el("span", { className: "dof-badge" }, t.enabledBadge)
					),
					el("p", { className: "dof-desc" }, t.intro),
					el("div", { className: "dof-tag-row" },
						el("span", { className: "dof-tag" }, t.tagZh),
						el("span", { className: "dof-tag" }, t.tagLang))
				),

				// Notification toggle card
				el("div", { className: "dof-card" },
					el("div", { className: "dof-card-head" },
						el("span", { className: "dof-card-icon" },
							el("span", { dangerouslySetInnerHTML: { __html: BELL_ICON_SVG } })),
						el("div", { className: "dof-card-title" }, t.toastLabel),
						el("div", { className: "dof-switch-wrap" },
							el("button", {
								type: "button",
								role: "switch",
								"aria-checked": toastEnabled ? "true" : "false",
								"aria-label": t.toastLabel,
								className: "dof-switch" + (toastEnabled ? " on" : ""),
								onClick: toggleToast
							}, el("span", { className: "dof-switch-knob" })),
							el("span", { className: "dof-switch-state " + (toastEnabled ? "dof-ok" : "dof-neu") }, toastEnabled ? t.toastOn : t.toastOff))
					),
					el("p", { className: "dof-desc" }, t.toastHint)
				),

				// Settings scrollbar fix toggle card
				el("div", { className: "dof-card" },
					el("div", { className: "dof-card-head" },
						el("span", { className: "dof-card-icon" },
							el("span", { dangerouslySetInnerHTML: { __html: SCROLL_ICON_SVG } })),
						el("div", { className: "dof-card-title" }, t.scrollfixLabel),
						el("div", { className: "dof-switch-wrap" },
							el("button", {
								type: "button",
								role: "switch",
								"aria-checked": scrollfixEnabled ? "true" : "false",
								"aria-label": t.scrollfixLabel,
								className: "dof-switch" + (scrollfixEnabled ? " on" : ""),
								onClick: toggleScrollfix
							}, el("span", { className: "dof-switch-knob" })),
							el("span", { className: "dof-switch-state " + (scrollfixEnabled ? "dof-ok" : "dof-neu") }, scrollfixEnabled ? t.scrollfixOn : t.scrollfixOff))
					),
					el("p", { className: "dof-desc" }, t.scrollfixHint)
				),

				// Last opened card
				el("div", { className: "dof-card" },
					el("div", { className: "dof-card-head" },
						el("span", { className: "dof-card-icon" },
							el("span", { dangerouslySetInnerHTML: { __html: CLOCK_ICON_SVG } })),
						el("div", { className: "dof-card-title" }, t.lastOpenedLabel)
					),
					lastOpened !== null
						? el("div", { className: "dof-lastopened" },
							el("span", { className: "dof-path" }, lastOpened.path),
							el("span", { className: "dof-tm" }, fmt(lastOpened.at)))
						: el("p", { className: "dof-desc dof-neu" }, t.lastOpenedNone)
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
				test: null,
				toastEnabled: (() => {
					try {
						const v = localStorage.getItem(TOAST_KEY);
						if (v !== null) return v !== "0";
					} catch {}
					return true;
				})(),
				scrollfixEnabled: (() => {
					try {
						const v = localStorage.getItem(SCROLLFIX_KEY);
						if (v !== null) return v !== "0";
					} catch {}
					return true;
				})()
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

			/** A visible, self-dismissing notice (dark/light theme aware).
			 * Suppressed when the user turned toast notifications off in settings. */
			const showToast = (message, kind) => {
				try {
					if (store.getSnapshot().toastEnabled !== true) return;
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
					setToastEnabled: (enabled) => {
						store.set((s) => ({ ...s, toastEnabled: enabled === true }));
						try {
							localStorage.setItem(TOAST_KEY, enabled === true ? "1" : "0");
						} catch {}
					},
					setScrollfixEnabled: (enabled) => {
						store.set((s) => ({ ...s, scrollfixEnabled: enabled === true }));
						try {
							localStorage.setItem(SCROLLFIX_KEY, enabled === true ? "1" : "0");
						} catch {}
						if (enabled === true) startScrollFix();
						else stopScrollFix();
					},
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
						".dof-root{max-width:640px;display:flex;flex-direction:column;gap:14px}",
						".dof-hero{display:flex;align-items:center;gap:14px;padding:2px 2px 4px}",
						".dof-hero-icon{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,#f2f2f2);background:color-mix(in srgb,var(--dsw-alias-label-primary,#f2f2f2) 10%,transparent);flex:none}",
						".dof-hero-icon svg{width:22px;height:22px}",
						".dof-hero-title{font-size:17px;font-weight:650;color:var(--dsw-alias-label-primary,#f2f2f2);letter-spacing:.2px}",
						".dof-hero-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#8f8f96);margin-top:3px}",
						".dof-card{border:1px solid var(--dsw-alias-border-l1,#2e2e34);border-radius:14px;padding:16px 18px;background:var(--dsw-alias-bg-layer-1,#1c1c20);box-shadow:0 1px 2px rgba(0,0,0,.12)}",
						".dof-card-head{display:flex;align-items:center;gap:11px;margin-bottom:10px}",
						".dof-card-icon{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#c9c9cf);background:var(--dsw-alias-bg-layer-2,#26262b);flex:none}",
						".dof-card-icon svg{width:15px;height:15px}",
						".dof-card-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#f2f2f2);flex:1}",
						".dof-badge{flex:none;font-size:11px;font-weight:500;line-height:20px;padding:0 10px;border-radius:999px;color:var(--dsw-alias-state-success-primary,#3ba272);background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#3ba272) 14%,transparent)}",
						".dof-desc{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#a9a9b0);margin:0}",
						".dof-tag-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
						".dof-tag{font-size:11px;line-height:24px;padding:0 12px;border-radius:999px;color:var(--dsw-alias-label-secondary,#a9a9b0);border:1px solid var(--dsw-alias-border-l1,#2e2e34);background:var(--dsw-alias-bg-layer-2,#202024)}",
						".dof-switch-wrap{display:flex;align-items:center;gap:8px;flex:none}",
						".dof-switch{position:relative;width:40px;height:22px;border-radius:11px;border:none;background:var(--dsw-alias-border-l2,#3d3d45);cursor:pointer;padding:0;transition:background .18s}",
						".dof-switch.on{background:var(--dsw-alias-state-success-primary,#22c55e)}",
						".dof-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.18);box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .18s}",
						".dof-switch.on .dof-switch-knob{left:20px}",
						".dof-switch-state{font-size:12px}",
						".dof-lastopened{display:flex;flex-direction:column;gap:4px}",
						".dof-path{font-size:12.5px;color:var(--dsw-alias-label-primary,#f2f2f2);word-break:break-all;font-variant-numeric:tabular-nums}",
						".dof-tm{font-size:11px;color:var(--dsw-alias-label-secondary,#8f8f96)}",
						".dof-ok{color:var(--dsw-alias-state-success-primary,#3ba272)}",
						".dof-neu{color:var(--dsw-alias-label-secondary,#8f8f96)}"
					].join("\n");
					document.head.appendChild(tag);
				}
			} catch {}

			// ------------------------------------------------------------------
			// Settings panel scrollbar fix (moved here from dsh-conflict-checker
			// v0.2, where it was unrelated to conflict checking). The settings
			// NAV LIST gets its own scrollable box: the list container keeps a
			// fixed height inside the panel and its items are prevented from
			// shrinking (flex-shrink: 0), so when the settings-page list is
			// taller than the box a long, grabbable vertical scrollbar appears
			// in the nav column and scrolls through every entry. When the list
			// fits, the track stays reserved (scrollbar-gutter: stable) so
			// nothing jumps. Toggling off removes every fix tag and inline
			// style and forces a reflow, so the page reverts to the native
			// state immediately.
			// ------------------------------------------------------------------

			const SCROLLFIX_TAG = "dsh-open-folder-scrollfix";
			const SCROLLFIX_CSS = [
				'[data-dsh-surface="settings"] [class*="navList"]{overflow-y:scroll!important;overflow-x:hidden!important;scrollbar-gutter:stable;min-height:0;flex:1 1 auto}',
				'[data-dsh-surface="settings"] [class*="navList"] > *{flex-shrink:0!important}',
				'[data-dsh-surface="settings"] [class*="navList"]::-webkit-scrollbar{width:10px;height:10px}',
				'[data-dsh-surface="settings"] [class*="navList"]::-webkit-scrollbar-track{background:transparent}',
				'[data-dsh-surface="settings"] [class*="navList"]::-webkit-scrollbar-thumb{background:var(--dsh-scrollbar-thumb,rgba(128,128,128,.5));border-radius:5px;border:2px solid transparent;background-clip:padding-box;min-height:40px}',
				'[data-dsh-surface="settings"] [class*="navList"]::-webkit-scrollbar-thumb:hover{background:var(--dsh-scrollbar-thumb-hover,rgba(128,128,128,.7));border:2px solid transparent;background-clip:padding-box}'
			].join("\n");

			let scrollfixStyle = null;
			let scrollfixObserver = null;
			let scrollfixActive = false;

			const scrollfixReflow = () => {
				if (typeof document === "undefined") return;
				void document.body.offsetHeight;
			};

			const scrollfixNavLists = () => {
				if (typeof document === "undefined") return [];
				const panel = document.querySelector('[data-dsh-surface="settings"]');
				if (!panel) return [];
				const out = [];
				const lists = panel.querySelectorAll('[class*="navList"]');
				for (let i = 0; i < lists.length; i++) {
					const n = lists[i];
					if (n.getBoundingClientRect().height > 20) out.push(n);
				}
				return out;
			};

			const scrollfixRemoveTags = () => {
				if (typeof document === "undefined") return;
				const tags = document.querySelectorAll('style[data-plugin="' + SCROLLFIX_TAG + '"]');
				for (let i = 0; i < tags.length; i++) {
					if (tags[i].parentNode) tags[i].parentNode.removeChild(tags[i]);
				}
				scrollfixStyle = null;
			};

			const scrollfixClearWrapper = () => {
				if (typeof document === "undefined") return;
				const panel = document.querySelector('[data-dsh-surface="settings"]');
				if (!panel) return;
				const navs = panel.querySelectorAll('[class*="_nav"]');
				for (let i = 0; i < navs.length; i++) {
					const n = navs[i];
					// Only clear the OUTER wrappers (those without a navList
					// child are containers, not the scroll list itself).
					if (n.querySelector('[class*="navList"]') !== null) continue;
					if (n.style && n.style.overflowY) n.style.overflowY = "";
				}
			};

			const startScrollFix = () => {
				if (scrollfixActive) return;
				scrollfixActive = true;
				if (typeof document === "undefined") return;
				// Remove any leftover tags from a previous load of this plugin
				// (a stale style tag with !important rules would keep the
				// scrollbar after switching the toggle off).
				scrollfixRemoveTags();
				const tag = document.createElement("style");
				tag.dataset.plugin = SCROLLFIX_TAG;
				tag.textContent = SCROLLFIX_CSS;
				document.head.appendChild(tag);
				scrollfixStyle = tag;
				// Clear stale scroll styling on the OUTER nav wrapper left
				// behind by earlier versions.
				scrollfixClearWrapper();
				// Inline fallback so the CURRENT open panel gets the nav-list
				// scrollbar instantly: force the list box scrollable and stop
				// its children from being flex-shrunk.
				for (const list of scrollfixNavLists()) {
					if (getComputedStyle(list).overflowY !== "scroll") list.style.overflowY = "scroll";
					for (let i = 0; i < list.children.length; i++) {
						list.children[i].style.flexShrink = "0";
					}
				}
				scrollfixReflow();
				scrollfixObserver = new MutationObserver(() => {
					if (!scrollfixActive) return;
					scrollfixClearWrapper();
					for (const list of scrollfixNavLists()) {
						if (getComputedStyle(list).overflowY !== "scroll") list.style.overflowY = "scroll";
						for (let i = 0; i < list.children.length; i++) {
							list.children[i].style.flexShrink = "0";
						}
					}
				});
				scrollfixObserver.observe(document.documentElement, { childList: true, subtree: true });
			};

			const stopScrollFix = () => {
				if (!scrollfixActive) return;
				scrollfixActive = false;
				if (scrollfixObserver) { scrollfixObserver.disconnect(); scrollfixObserver = null; }
				// Remove EVERY fix tag (not just the one this instance
				// remembers): stale !important rules from an earlier load are
				// what moved the scrollbar after toggling off.
				scrollfixRemoveTags();
				// Undo inline fallback on every nav list and its children,
				// plus any outer nav wrapper leftover, then reflow.
				if (typeof document !== "undefined") {
					scrollfixClearWrapper();
					for (const list of scrollfixNavLists()) {
						list.style.overflowY = "";
						for (let i = 0; i < list.children.length; i++) {
							list.children[i].style.flexShrink = "";
						}
					}
					scrollfixReflow();
				}
			};

			// Start on load when the user left the fix enabled.
			if (store.getSnapshot().scrollfixEnabled === true) startScrollFix();
		}

		const inject = ["connection", "sessions", "workspaces", "locale"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
