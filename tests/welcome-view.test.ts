import { fireEvent, render, screen } from '@testing-library/svelte';
import WelcomeView from '../src/lib/components/WelcomeView.svelte';

it('filters languages and selects Python', async () => {
  const onSelect = vi.fn();
  render(WelcomeView, { onSelect, onOpenExisting: vi.fn() });

  expect(screen.getByText('Hello! What will you code in today?')).toBeInTheDocument();
  await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'pyt' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Python' }));

  expect(onSelect).toHaveBeenCalledWith('python');
});
