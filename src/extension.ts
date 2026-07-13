import * as vscode from 'vscode';
import { renderMarkdown } from './renderer';

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const openPreviewCommand = vscode.commands.registerCommand(
    'inlinemd.openPreview',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('inlineMD: Open a Markdown file first.');
        return;
      }
      openPreview(context, editor.document);
    }
  );

  // onDidChangeTextDocument listens for live update
  const onDocChange = vscode.workspace.onDidChangeTextDocument((e) => {
    if (panel && e.document.languageId === 'markdown') {
      sendContent(e.document);
    }
  });

  context.subscriptions.push(openPreviewCommand, onDocChange);
}

//lifetime of the panel
function openPreview(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    sendContent(document);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'inlinemd.preview',
    'inlineMD',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );

  panel.webview.html = buildWebviewHtml(panel.webview, context.extensionUri);
  sendContent(document);

  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
}

function sendContent(document: vscode.TextDocument): void {
  if (!panel) { return; }
  panel.webview.postMessage({ type: 'render', html: renderMarkdown(document.getText()) });
}

//webview UI
function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'preview.js'));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>inlineMD</title>
</head>
<body>
  <div id="preview"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

//nonce: CSP security requirement ( to prevent script injection )
function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function deactivate() { }
