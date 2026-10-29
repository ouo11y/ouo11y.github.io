// A tiny inline formatter for short strings passed as props (why / what to do / release notes):
// `code`, **bold** and [text](url). Everything else is escaped.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(s = ''): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) =>
      `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener"' : ''}>${text}</a>`);
}

// "2026-10-26" → "26 Oct"
export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
