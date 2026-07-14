import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (_) {}
    }
    return ''; // use external default escaping
  }
});

// Core plugin: stamp data-line-start / data-line-end on every block token that
// has source map info. token.map = [startLine, endLine] (0-indexed, end exclusive).
md.core.ruler.push('inject_line_mapping', (state) => {
  for (const token of state.tokens) {
    if (token.map) {
      token.attrSet('data-line-start', String(token.map[0]));
      token.attrSet('data-line-end',   String(token.map[1]));
    }
  }
});

export function renderMarkdown(text: string): string {
  return md.render(text);
}
