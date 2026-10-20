/**
 * Tiny inline markup for content strings:
 *   [[key|text]]  glossary link (key = glossary id)
 *   [[key]]       glossary link showing the term itself
 *   **text**      strong
 *   {typ}         "typical" tag, {ex} "common example" tag
 *   ^2 ^3         superscripts
 */
export interface MarkupCtx {
  glossary: Record<string, { term: string }>;
  tags: { typical: string; example: string };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function md(src: string, ctx: MarkupCtx): string {
  let s = esc(src);
  s = s.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_m, key: string, text?: string) => {
    const g = ctx.glossary[key];
    if (!g) throw new Error(`Unknown glossary key: ${key}`);
    return `<a class="term" href="#g-${key}" data-term="${key}">${text ?? g.term}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\{typ\}/g, `<span class="tag-typical">${ctx.tags.typical}</span>`);
  s = s.replace(/\{ex\}/g, `<span class="tag-typical">${ctx.tags.example}</span>`);
  s = s.replace(/\^([0-9])/g, '<sup>$1</sup>');
  return s;
}

/** Strip markup to plain text (for meta descriptions and aria labels). */
export function plain(src: string): string {
  return src
    .replace(/\[\[[a-z0-9-]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([a-z0-9-]+)\]\]/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\{typ\}|\{ex\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export { esc };
