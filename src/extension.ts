import * as vscode from 'vscode';
import { renderMarkdown } from './renderer';

export function activate(context: vscode.ExtensionContext) {
  // Register our webview as the editor for *.md files.
  // "priority: default" in package.json means VS Code opens .md files with
  // us automatically. User can still access raw text via "Reopen Editor With".
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'inlinemd.preview',
      new InlineMDEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Keep the command as a manual fallback
  context.subscriptions.push(
    vscode.commands.registerCommand('inlinemd.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('inlineMD: Open a Markdown file first.');
        return;
      }
      vscode.commands.executeCommand('vscode.openWith', editor.document.uri, 'inlinemd.preview');
    })
  );
}

class InlineMDEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };

    panel.webview.html = buildWebviewHtml(panel.webview, this.context.extensionUri);

    // Initial render fires when webview signals it's ready (JS loaded and listening).
    // Sending postMessage before that silently drops the message.
    panel.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'ready':
          this.sendContent(document, panel);
          break;
        case 'getLines':
          this.handleGetLines(message.start, message.end, document, panel);
          break;
        case 'save':
          this.handleSave(message.start, message.end, message.newText, document);
          break;
      }
    });

    // Re-render on every edit (reads from TextDocument in-memory, not disk)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        this.sendContent(e.document, panel);
      }
    });

    panel.onDidDispose(() => changeSubscription.dispose());
  }

  private sendContent(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    panel.webview.postMessage({ type: 'render', html: renderMarkdown(document.getText()) });
  }

  private handleGetLines(
    start: number, end: number,
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel
  ): void {
    const lineCount     = document.lineCount;
    const contextStart  = Math.max(0, start - 2);
    const contextEnd    = Math.min(lineCount, end + 2);

    const lines: string[] = [];
    for (let i = contextStart; i < contextEnd; i++) {
      lines.push(document.lineAt(i).text);
    }

    panel.webview.postMessage({
      type: 'lines',
      lines,
      targetStart: start,
      targetEnd: end,
      contextStart,
      filePath: document.fileName,
    });
  }

  private async handleSave(
    start: number, end: number,
    newText: string,
    document: vscode.TextDocument
  ): Promise<void> {
    const lastLineIndex = end - 1;
    const lastLine = document.lineAt(lastLineIndex);

    const range = new vscode.Range(
      new vscode.Position(start, 0),
      new vscode.Position(lastLineIndex, lastLine.text.length)
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, newText);
    await vscode.workspace.applyEdit(edit);
  }
}

function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'preview.js'));
  const nonce = getNonce();

  // Read the active VS Code user markdown config settings
  const config = vscode.workspace.getConfiguration('markdown');
  const fontFamily = config.get<string>('preview.fontFamily') || '-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, "Ubuntu", "Droid Sans", sans-serif';
  const fontSize = config.get<number>('preview.fontSize') || 14;
  const lineHeight = config.get<number>('preview.lineHeight') || 1.6;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${stylesUri}" />
  <style nonce="${nonce}">
    :root {
      --markdown-font-family: ${fontFamily};
      --markdown-font-size: ${fontSize}px;
      --markdown-line-height: ${lineHeight};
    }
  </style>
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
