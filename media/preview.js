(function () {
  const vscode = acquireVsCodeApi();
  const preview = document.getElementById('preview');

  // Each line row in the widget is exactly this tall — gutter and content must match
  const LINE_H = 20;

  let currentWidget = null;
  let currentTarget = null;

  // Track the line range of the last edited block to flash it after re-render
  let lastSavedStart = null;
  let lastSavedEnd = null;

  // Messages from extension host
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'render') {
      currentWidget = null;
      currentTarget = null;
      document.body.style.overflow = ''; // Unlock scroll

      const scrollTop = preview.scrollTop;
      preview.innerHTML = msg.html;
      preview.scrollTop = scrollTop;

      // Flash the edited element
      if (lastSavedStart !== null) {
        const query = `[data-line-start="${lastSavedStart}"][data-line-end="${lastSavedEnd}"]`;
        const updatedEl = preview.querySelector(query);
        if (updatedEl) {
          updatedEl.classList.add('flash-saved');
          // Clean up
          setTimeout(() => updatedEl.classList.remove('flash-saved'), 1000);
        }
        lastSavedStart = null;
        lastSavedEnd = null;
      }
    } else if (msg.type === 'lines') {
      showWidget(msg);
    }
  });

  //double click to peek
  document.addEventListener('dblclick', (e) => {
    if (currentWidget && currentWidget.contains(e.target)) { return; }

    let el = e.target;
    while (el && el !== preview) {
      if (el.dataset && el.dataset.lineStart !== undefined) { break; }
      el = el.parentElement;
    }
    if (!el || el === preview) { return; }

    closeWidget();
    currentTarget = el;
    vscode.postMessage({
      type: 'getLines',
      start: parseInt(el.dataset.lineStart, 10),
      end: parseInt(el.dataset.lineEnd, 10),
    });
  });

  // Intercept relative link clicks to open them in VS Code natively
  document.addEventListener('click', (e) => {
    let el = e.target;
    while (el && el !== preview) {
      if (el.tagName === 'A' && el.getAttribute('href')) {
        const href = el.getAttribute('href');
        // Check if it is a relative local link (does not start with a protocol or hash)
        if (!/^https?:\/\//i.test(href) && !href.startsWith('#')) {
          e.preventDefault();
          vscode.postMessage({ type: 'openLink', href });
        }
        break;
      }
      el = el.parentElement;
    }
  });

  //esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentWidget) { closeWidget(); }
  });

  document.addEventListener('mousedown', (e) => {
    if (currentWidget && !currentWidget.contains(e.target)) { closeWidget(); }
  });

  function closeWidget() {
    if (currentWidget) {
      currentWidget.remove();
      currentWidget = null;
      currentTarget = null;
      document.body.style.overflow = ''; // Restore scroll when widget closes
    }
  }

  function showWidget(data) {
    const { lines, targetStart, targetEnd, contextStart, filePath } = data;

    const widget = document.createElement('div');
    widget.className = 'peek-widget';

    //header
    const header = document.createElement('div');
    header.className = 'peek-header';
    const fileName = filePath.split(/[\\/]/).pop();
    header.innerHTML =
      `<span class="peek-filename">${fileName}</span>` +
      `<span class="peek-range">L${targetStart + 1}–${targetEnd}</span>`;
    widget.appendChild(header);

    // Body: gutter | content
    const body = document.createElement('div');
    body.className = 'peek-body';

    const gutter = document.createElement('div');
    gutter.className = 'peek-gutter';

    const content = document.createElement('div');
    content.className = 'peek-content';

    let textarea = null;
    const targetLineTexts = [];
    let pastTarget = false;

    lines.forEach((lineText, i) => {
      const lineNum = contextStart + i;
      const isTarget = lineNum >= targetStart && lineNum < targetEnd;

      // Gutter number — same line height as content rows
      const gutterNum = document.createElement('div');
      gutterNum.className = 'peek-gutter-num' + (isTarget ? ' active' : '');
      gutterNum.textContent = String(lineNum + 1);
      gutter.appendChild(gutterNum);

      if (isTarget) {
        targetLineTexts.push(lineText);
      } else {
        if (targetLineTexts.length > 0 && !pastTarget) {
          textarea = buildTextarea(targetLineTexts);
          content.appendChild(textarea);
          pastTarget = true;
        }
        const div = document.createElement('div');
        div.className = 'peek-line-context';
        div.textContent = lineText || '\u00A0';
        content.appendChild(div);
      }
    });

    if (targetLineTexts.length > 0 && !pastTarget) {
      textarea = buildTextarea(targetLineTexts);
      content.appendChild(textarea);
    }

    body.appendChild(gutter);
    body.appendChild(content);
    widget.appendChild(body);

    currentWidget = widget;
    currentTarget.insertAdjacentElement('afterend', widget);
    // Lock scrolling on the main page while editing
    document.body.style.overflow = 'hidden';

    if (textarea) {
      // Enter = save, Shift+Enter = newline (default textarea behaviour)
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          lastSavedStart = targetStart;
          lastSavedEnd = targetEnd;
          vscode.postMessage({
            type: 'save',
            start: targetStart,
            end: targetEnd,
            newText: textarea.value,
          });
        }
      });
      setTimeout(() => textarea.focus(), 0);
    }
  }

  function buildTextarea(lines) {
    const ta = document.createElement('textarea');
    ta.className = 'peek-editor';
    ta.value = lines.join('\n');
    ta.spellcheck = false;
    ta.style.height = (lines.length * LINE_H) + 'px';

    // Enable Tab indentation inside peek editor
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 4;
      }
    });

    return ta;
  }

  // Signal to the extension that the webview JS is loaded and ready to receive messages
  vscode.postMessage({ type: 'ready' });

})();
