import DOMPurify from 'dompurify';
import { marked } from 'marked';

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul'
];

const escapeText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const createInertRenderer = () => {
  const renderer = new marked.Renderer();

  // Raw HTML is never passed to the browser's HTML parser, even through DOMPurify.
  renderer.html = () => '';
  // Images are text-only so the source URL is never parsed as an HTML attribute.
  renderer.image = ({ text }) => escapeText(text);
  // Render only a link's Markdown label. Its destination is intentionally discarded.
  renderer.link = function ({ tokens }) {
    return this.parser.parseInline(tokens);
  };

  return renderer;
};

/** Produces the inert string that is passed directly to DOMPurify. */
export const renderMarkdownBeforeSanitization = (source: string): string =>
  marked.parse(source, {
    async: false,
    breaks: false,
    gfm: true,
    renderer: createInertRenderer()
  });

/**
 * Produces inert HTML for the local preview. Attributes are intentionally
 * omitted, so links remain readable but cannot navigate or fetch resources.
 */
export const renderMarkdown = (source: string): string => {
  const rendered = renderMarkdownBeforeSanitization(source);
  return DOMPurify.sanitize(rendered, {
    ALLOWED_ATTR: [],
    ALLOWED_TAGS,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true
  });
};
