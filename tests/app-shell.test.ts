import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { vi } from 'vitest';

vi.mock('../src/lib/native/file-api', () => ({
  chooseOpenPaths: vi.fn(async () => []),
  chooseSavePath: vi.fn(async () => null),
  confirmLargeFile: vi.fn(async () => true),
  openFile: vi.fn(),
  saveFile: vi.fn(),
  subscribeToFileDrops: vi.fn(async () => () => undefined)
}));

import App from '../src/App.svelte';
import { chooseOpenPaths } from '../src/lib/native/file-api';

it('renders the PrismPad shell and welcome experience without IDE panels', () => {
  render(App);
  expect(screen.getByRole('application', { name: 'PrismPad' })).toBeInTheDocument();
  expect(screen.getByText('Hello! What will you code in today?')).toBeInTheDocument();
  expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
});

it('replaces the welcome view with a connected document tab after language selection', async () => {
  render(App);

  await fireEvent.click(screen.getByRole('button', { name: 'Python' }));

  expect(screen.queryByText('Hello! What will you code in today?')).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Untitled/ })).toHaveAttribute('aria-selected', 'true');
});

it('switches the shell between the approved light and dark theme tokens', async () => {
  render(App);

  await fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }));

  expect(screen.getByRole('application', { name: 'PrismPad' })).toHaveAttribute('data-theme', 'dark');
  expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');
});

it('uses the native open flow and scopes file keyboard shortcuts to the application shell', async () => {
  render(App);
  const app = screen.getByRole('application', { name: 'PrismPad' });

  await fireEvent.click(screen.getByRole('button', { name: /open existing file/i }));
  await waitFor(() => expect(chooseOpenPaths).toHaveBeenCalledOnce());

  await fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'n', ctrlKey: true });
  expect(screen.queryByRole('tab', { name: /Untitled/ })).not.toBeInTheDocument();

  await fireEvent.keyDown(app, { key: 'n', ctrlKey: true });
  expect(screen.getByRole('tab', { name: /Untitled/ })).toBeInTheDocument();
});
