import { fireEvent, render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';

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
