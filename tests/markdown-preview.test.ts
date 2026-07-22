import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

vi.mock('../src/lib/native/file-api', () => ({
  chooseOpenPaths: vi.fn(async () => []),
  chooseSavePath: vi.fn(async () => null),
  confirmLargeFile: vi.fn(async () => true),
  confirmOverwrite: vi.fn(async () => false),
  openFile: vi.fn(),
  saveFile: vi.fn(),
  watchPath: vi.fn(async () => undefined),
  unwatchPath: vi.fn(async () => undefined),
  subscribeToExternalChanges: vi.fn(async () => () => undefined),
  subscribeToFileDrops: vi.fn(async () => () => undefined)
}));

vi.mock('../src/lib/native/store-api', () => ({
  loadPreferencesWithStatus: vi.fn(async () => ({ preferences: {
    theme: 'system', fontSize: 14, wordWrap: true, tabWidth: 4, indentStyle: 'spaces',
    indentationGuides: true, visibleWhitespace: false, autoReloadCleanFiles: true
  }, recovered: false })),
  savePreferences: vi.fn(async () => undefined),
  loadSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => undefined),
  restoreSession: vi.fn(async () => ({ activePath: null, files: [], skipped: [] }))
}));

import App from '../src/App.svelte';
import {
  renderMarkdown,
  renderMarkdownBeforeSanitization
} from '../src/lib/markdown/render-markdown';
import MarkdownPreview from '../src/lib/components/MarkdownPreview.svelte';

describe('renderMarkdown', () => {
  it('renders safe GFM structures without retaining active markup or URLs', () => {
    const html = renderMarkdown(`# Heading

- one
- two

| Name | Value |
| --- | --- |
| safe | \`code\` |

**bold** and *emphasis* with [a link](https://example.test).`);

    expect(html).toContain('<h1>Heading</h1>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>emphasis</em>');
    expect(html).toContain('a link');
    expect(html).not.toContain('<a');
    expect(html).not.toMatch(/\s(?:href|src|action|formaction|xlink:href)=/i);
  });

  it('never gives DOMPurify raw markup or resource-bearing attributes', () => {
    const rendered = renderMarkdownBeforeSanitization(`<iframe src="https://example.test"></iframe><style>body {}</style>
<script>alert(1)</script><form action="/submit"><svg><circle></circle></svg></form>
![remote](https://example.test/image.png) ![relative](/image.png) ![data](data:image/png;base64,AAAA)
[inline](blob:local) [reference][safe] <file:///secret> <javascript:alert(1)>
[nested <img src="https://example.test/nested.png"> label](http://example.test)

[safe]: https://example.test/reference`);

    expect(rendered).not.toMatch(/<\s*(?:a|img|iframe|form|svg|style|script)\b/i);
    expect(rendered).not.toMatch(/\s(?:href|src|action|formaction|xlink:href)\s*=/i);
  });

  it('removes executable, embedded, styled, and malformed active content', () => {
    const html = renderMarkdown(`<script>alert(1)</script><style>body { display: none }</style>
<iframe src="https://example.test"></iframe><object data="file:///secret"></object><embed src="data:text/html,test">
<form action="https://example.test"><input autofocus><button formaction="javascript:alert(1)">go</button></form>
<svg><a xlink:href="javascript:alert(1)"><circle onload="alert(1)"></circle></a></svg><math><mi>x</mi></math>
<div onclick="alert(1)" style="color:red">text</div><broken><script>alert(2)</script>`);

    expect(html).not.toMatch(/<(?:script|style|iframe|object|embed|form|input|button|svg|math|broken)\b/i);
    expect(html).not.toMatch(/\son\w+=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/(?:javascript|data|file):/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it('removes every image and dangerous URL protocol before HTML insertion', () => {
    const html = renderMarkdown(`![remote](https://example.test/image.png)
![data](data:image/png;base64,AAAA)
<img src="file:///secret.png" onerror="alert(1)">
[js](javascript:alert(1)) [http](http://example.test) [file](file:///secret)`);

    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/\s(?:href|src)=/i);
    expect(html).not.toMatch(/(?:javascript|data|https?|file):/i);
  });
});

describe('MarkdownPreview', () => {
  it('renders an accessible inert preview region and updates from source without writing it', async () => {
    const source = '# Initial\n\nA paragraph.';
    const view = render(MarkdownPreview, { source });

    const preview = screen.getByRole('region', { name: 'Markdown preview' });
    expect(preview).toHaveTextContent('Initial');
    expect(preview.querySelector('a')).toBeNull();

    await view.rerender({ source: '## Updated\n\n[read me](https://example.test)' });

    expect(preview).toHaveTextContent('Updated');
    expect(preview.querySelector('a')).toBeNull();
    expect(source).toBe('# Initial\n\nA paragraph.');
  });

  it('does not take focus while source changes update the preview', async () => {
    const focusTarget = document.createElement('button');
    document.body.append(focusTarget);
    focusTarget.focus();
    const view = render(MarkdownPreview, { source: '# Initial' });

    await view.rerender({ source: '# Updated' });

    expect(document.activeElement).toBe(focusTarget);
    focusTarget.remove();
  });

  it('keeps parser failures non-blocking and text-only', () => {
    const parse = vi.spyOn(marked, 'parse').mockImplementation(() => {
      throw new Error('<strong>unsafe error</strong>');
    });
    render(MarkdownPreview, { source: '<script>source must not become HTML</script>' });

    expect(screen.getByRole('status')).toHaveTextContent('Markdown preview is temporarily unavailable.');
    expect(screen.getByRole('status')).not.toContainHTML('<strong>unsafe error</strong>');
    parse.mockRestore();
  });

  it('keeps sanitizer failures non-blocking and text-only', () => {
    const sanitize = vi.spyOn(DOMPurify, 'sanitize').mockImplementation(() => {
      throw new Error('<strong>unsafe error</strong>');
    });
    render(MarkdownPreview, { source: '# Safe heading' });

    expect(screen.getByRole('status')).toHaveTextContent('Markdown preview is temporarily unavailable.');
    expect(screen.getByRole('status')).not.toContainHTML('<strong>unsafe error</strong>');
    sanitize.mockRestore();
  });
});

describe('Markdown preview shell integration', () => {
  it('is available only for Markdown and toggles the split without changing the document', async () => {
    render(App);
    await fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    const tab = screen.getByRole('tab', { name: /Untitled/ });

    await fireEvent.click(screen.getByRole('button', { name: 'View' }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Markdown preview' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('region', { name: 'Markdown preview' })).not.toBeInTheDocument();

    await fireEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Markdown preview' })).toBeInTheDocument();
    expect(tab).not.toHaveClass('is-dirty');
    expect(screen.getByRole('button', { name: 'View' })).toHaveFocus();

    await fireEvent.click(screen.getByRole('button', { name: 'File' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'New' }));
    await fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Markdown preview' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Markdown preview' })).not.toBeInTheDocument();
  });
});
