import * as vscode from "vscode";
import type { LogEntry, OutputChannelManager } from "./output.js";

export class LogViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private viewDisposables: vscode.Disposable[] = [];

  constructor(private readonly output: OutputChannelManager) {
    this.disposables.push(
      this.output.onDidLog((entry) => {
        this.postMessage({ type: "append", entry });
      })
    );
    this.disposables.push(
      this.output.onDidClear(() => {
        this.postMessage({ type: "clear" });
      })
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeViewDisposables();
    this.view = view;
    view.webview.options = {
      enableScripts: true,
    };
    view.webview.html = this.getHtml(view.webview);
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage(async (msg: { type?: string; href?: string }) => {
        if (msg.type === "openLink" && msg.href) {
          try {
            await vscode.env.openExternal(vscode.Uri.parse(msg.href));
          } catch {
            // ignore invalid links
          }
        }
      })
    );
    this.viewDisposables.push(
      view.onDidDispose(() => {
        this.disposeViewDisposables();
        this.view = undefined;
      })
    );

    this.postMessage({ type: "seed", entries: this.output.getHistory() });
  }

  dispose(): void {
    this.disposeViewDisposables();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.view = undefined;
  }

  private postMessage(message: unknown): void {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage(message).then(undefined, () => undefined);
  }

  private disposeViewDisposables(): void {
    this.viewDisposables.forEach((d) => d.dispose());
    this.viewDisposables = [];
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --info: var(--vscode-charts-blue);
      --ok: var(--vscode-charts-green);
      --warn: var(--vscode-charts-yellow);
      --err: var(--vscode-charts-red);
      --link: var(--vscode-textLink-foreground);
    }
    body {
      margin: 0;
      padding: 8px;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }
    #list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .row {
      border: 1px solid var(--border);
      border-left-width: 4px;
      border-radius: 6px;
      padding: 6px 8px;
      background: color-mix(in srgb, var(--bg) 92%, var(--fg) 8%);
    }
    .row.info { border-left-color: var(--info); }
    .row.ok { border-left-color: var(--ok); }
    .row.warn { border-left-color: var(--warn); }
    .row.err { border-left-color: var(--err); }
    .meta {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 11px;
    }
    .level { font-weight: 700; }
    .level.info { color: var(--info); }
    .level.ok { color: var(--ok); }
    .level.warn { color: var(--warn); }
    .level.err { color: var(--err); }
    .cat {
      font-family: var(--vscode-editor-font-family);
      background: color-mix(in srgb, var(--bg) 80%, var(--fg) 20%);
      border-radius: 4px;
      padding: 0 4px;
    }
    .msg {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
    }
    a {
      color: var(--link);
      text-decoration: underline;
      cursor: pointer;
    }
    .empty {
      color: var(--muted);
      border: 1px dashed var(--border);
      border-radius: 6px;
      padding: 10px;
    }
  </style>
</head>
<body>
  <div id="list"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const list = document.getElementById("list");

    function escapeHtml(text) {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function linkify(text) {
      const urlRe = /https?:\\/\\/[^\\s<>"']+/g;
      let result = "";
      let last = 0;
      let match;
      while ((match = urlRe.exec(text)) !== null) {
        const url = match[0];
        const start = match.index;
        result += escapeHtml(text.slice(last, start));
        result += '<a data-url="' + encodeURIComponent(url) + '">' + escapeHtml(url) + '</a>';
        last = start + url.length;
      }
      result += escapeHtml(text.slice(last));
      return result;
    }

    function renderEmpty() {
      if (list.childElementCount > 0) return;
      const div = document.createElement("div");
      div.className = "empty";
      div.textContent = "No logs yet. Run sync to see realtime logs.";
      list.appendChild(div);
    }

    function clearEmpty() {
      const empty = list.querySelector(".empty");
      if (empty) empty.remove();
    }

    function append(entry) {
      clearEmpty();
      const row = document.createElement("div");
      row.className = "row " + entry.level.toLowerCase();
      const levelCls = entry.level.toLowerCase();
      row.innerHTML =
        '<div class="meta">' +
          '<span>' + entry.timestamp + '</span>' +
          '<span class="level ' + levelCls + '">' + entry.level + '</span>' +
          '<span class="cat">' + entry.category + '</span>' +
        '</div>' +
        '<div class="msg">' + linkify(entry.message) + '</div>';
      list.appendChild(row);
      if (list.childElementCount > 500) {
        list.firstElementChild.remove();
      }
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "clear") {
        list.innerHTML = "";
        renderEmpty();
        return;
      }
      if (msg.type === "seed") {
        list.innerHTML = "";
        (msg.entries || []).forEach(append);
        renderEmpty();
        return;
      }
      if (msg.type === "append" && msg.entry) {
        append(msg.entry);
      }
    });

    list.addEventListener("click", (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("a[data-url]")
        : null;
      if (target) {
        event.preventDefault();
        const encoded = target.getAttribute("data-url");
        if (encoded) {
          vscode.postMessage({ type: "openLink", href: decodeURIComponent(encoded) });
        }
      }
    });

    renderEmpty();
  </script>
</body>
</html>`;
  }
}
