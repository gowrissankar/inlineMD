//VScode webview : embedded browser window inside the editor
(function () {
  const vscode = acquireVsCodeApi();
  const preview = document.getElementById('preview');

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'render') {
      const scrollTop = preview.scrollTop;
      preview.innerHTML = message.html;
      preview.scrollTop = scrollTop;
    }
  });
})();
