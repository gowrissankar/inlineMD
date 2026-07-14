import * as vscode from 'vscode';
import { renderMarkdown } from './renderer';

let panel: vscode.WebviewPanel | undefined;
let currentDocument: vscode.TextDocument | undefined;

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

  // Re-render on every keystroke — reads from TextDocument (in-memory, not disk)
  const onDocChange = vscode.workspace.onDidChangeTextDocument((e) => {
    if (panel && e.document.languageId === 'markdown') {
      sendContent(e.document);
    }
  });

  context.subscriptions.push(openPreviewCommand, onDocChange);
}

function openPreview(context: vscode.ExtensionContext, document: vscode.TextDocument): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    sendContent(document);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'inlinemd.preview',
    'inlineMD',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );

  panel.webview.html = buildWebviewHtml(panel.webview, context.extensionUri);
  sendContent(document);

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage((message) => {
    switch (message.type) {
      case 'getLines':
        handleGetLines(message.start, message.end);
        break;
      case 'save':
        handleSave(message.start, message.end, message.newText);
        break;
    }
  }, null, context.subscriptions);

  panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
}

function sendContent(document: vscode.TextDocument): void {
  if (!panel) { return; }
  currentDocument = document;
  panel.webview.postMessage({ type: 'render', html: renderMarkdown(document.getText()) });
}

// Reads ~5 lines around the target block and sends them to the webview
function handleGetLines(start: number, end: number): void {
  if (!panel || !currentDocument) { return; }

  const lineCount = currentDocument.lineCount;
  const contextStart = Math.max(0, start - 2);
  const contextEnd = Math.min(lineCount, end + 2);

  const lines: string[] = [];
  for (let i = contextStart; i < contextEnd; i++) {
    lines.push(currentDocument.lineAt(i).text);
  }

  panel.webview.postMessage({
    type: 'lines',
    lines,
    targetStart: start,
    targetEnd: end,
    contextStart,
    filePath: currentDocument.fileName,
  });
}

async function handleSave(start: number, end: number, newText: string): Promise<void> {
  if (!currentDocument) { return; }

  const lastLineIndex = end - 1;
  const lastLine = currentDocument.lineAt(lastLineIndex);

  const range = new vscode.Range(
    new vscode.Position(start, 0),
    new vscode.Position(lastLineIndex, lastLine.text.length)
  );

  const edit = new vscode.WorkspaceEdit();
  edit.replace(currentDocument.uri, range, newText);
  await vscode.workspace.applyEdit(edit);
}

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

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function deactivate() { }
