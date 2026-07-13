import MarkdownIt from 'markdown-it';
// markdown -> HTML tokens
// **bold** -> <strong>bold</strong>

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

md.core.ruler.push('inject_line_mapping', (state) => {
  for (const token of state.tokens) {
    if (token.map) {
      token.attrSet('start', String(token.map[0]));
      token.attrSet('end', String(token.map[1]));
    }
  }
});
//intercept and modify the tags
// # Hello -> <h1 start="0" end="1">Hello</h1>

export function renderMarkdown(text: string): string {
  return md.render(text);
}
