import { fireEvent, render, screen } from '@testing-library/svelte';
import TabStrip from '../src/lib/components/TabStrip.svelte';

const documents = [
  { id: 'a', title: 'app.py', dirty: true },
  { id: 'b', title: 'README.md', dirty: false }
];

it('renders connected tabs and exposes activate and close actions', async () => {
  const onActivate = vi.fn();
  const onClose = vi.fn();
  render(TabStrip, { documents, activeId: 'a', onActivate, onClose, onReorder: vi.fn() });

  const activeTab = screen.getByRole('tab', { name: /app.py/ });
  expect(activeTab).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('tab-a')).toHaveClass('is-dirty');

  await fireEvent.click(screen.getByRole('tab', { name: /README.md/ }));
  expect(onActivate).toHaveBeenCalledWith('b');

  await fireEvent.click(screen.getByRole('button', { name: 'Close app.py' }));
  expect(onClose).toHaveBeenCalledWith('a');
});

it('reorders only tabs from the current document set', async () => {
  const onReorder = vi.fn();
  render(TabStrip, { documents, activeId: 'a', onActivate: vi.fn(), onClose: vi.fn(), onReorder });

  await fireEvent.dragStart(screen.getByTestId('tab-a'));
  await fireEvent.drop(screen.getByTestId('tab-b'));

  expect(onReorder).toHaveBeenCalledWith('a', 'b');
});

it('returns focus to the editor on Escape and exposes one dirty announcement', async () => {
  const onEscape = vi.fn();
  render(TabStrip, { documents, activeId: 'a', onActivate: vi.fn(), onClose: vi.fn(), onReorder: vi.fn(), onEscape });
  const tab = screen.getByRole('tab', { name: /app.py/ });
  tab.focus();
  await fireEvent.keyDown(tab, { key: 'Escape' });
  expect(onEscape).toHaveBeenCalledOnce();
  expect(screen.getAllByLabelText('Unsaved changes')).toHaveLength(1);
});
