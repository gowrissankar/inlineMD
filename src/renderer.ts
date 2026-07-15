import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const md = new MarkdownIt({
  html: true,
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

// Frontmatter (YAML preamble) plugin: hides frontmatter but keeps lines in map
md.block.ruler.before('code', 'yaml_preamble', (state, startLine, endLine, silent) => {
  if (startLine !== 0) { return false; }
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.src.slice(startPos, max) !== '---') { return false; }

  let nextLine = startLine;
  let found = false;
  while (++nextLine < endLine) {
    const pos = state.bMarks[nextLine] + state.tShift[nextLine];
    const tail = state.eMarks[nextLine];
    if (state.src.slice(pos, tail) === '---') {
      found = true;
      break;
    }
  }

  if (!found) { return false; }
  if (silent) { return true; }

  state.line = nextLine + 1;
  const token = state.push('yaml_preamble', '', 0);
  token.map = [startLine, state.line];
  return true;
});

md.renderer.rules.yaml_preamble = () => '';

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
