import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import StatusBar from '../src/lib/components/StatusBar.svelte';

it('shows semantic document metadata and returns focus after a narrow setting popover closes', async () => {
  const onChange = vi.fn();
  render(StatusBar, {
    language: 'Python', cursor: { line: 2, column: 4 }, encoding: 'UTF-8', lineEnding: 'CRLF',
    preferences: { theme: 'system', fontSize: 14, wordWrap: true, tabWidth: 4, indentStyle: 'spaces', indentationGuides: true, visibleWhitespace: false, autoReloadCleanFiles: true },
    onPreferencesChange: onChange
  });

  expect(screen.getByTestId('status-language')).toHaveTextContent('Python');
  expect(screen.getByTestId('status-cursor')).toHaveTextContent('Ln 2, Col 4');
  expect(screen.getByTestId('status-encoding')).toHaveTextContent('UTF-8');
  expect(screen.getByTestId('status-line-ending')).toHaveTextContent('CRLF');
  const indentation = screen.getByTestId('status-indentation');
  await fireEvent.click(indentation);
  expect(screen.getByRole('dialog', { name: 'Indentation settings' })).toBeInTheDocument();
  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(indentation).toHaveFocus();
});
