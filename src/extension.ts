import * as vscode from 'vscode';
//entry point
export function activate(context: vscode.ExtensionContext) {
  console.log('[inlineMD] extension activated');

  const command = vscode.commands.registerCommand('inlinemd.openPreview', () => {
    vscode.window.showInformationMessage('inlineMD: hello from the extension!');
  });
  context.subscriptions.push(command);
}

export function deactivate() { }
