import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import TabStrip from '../src/lib/components/TabStrip.svelte';
import { contrastRatio, focusElement, moveRovingFocus } from '../src/lib/accessibility/focus';

it('uses roving focus with Home and End and names dirty state without color alone', async () => {
  const onActivate = vi.fn();
  render(TabStrip, { documents: [{ id: 'a', title: 'a.txt', dirty: true }, { id: 'b', title: 'b.txt', dirty: false }], activeId: 'a', onActivate, onClose: vi.fn(), onReorder: vi.fn() });
  const first = screen.getByRole('tab', { name: /a.txt/ });
  await fireEvent.keyDown(first, { key: 'End' });
  expect(onActivate).toHaveBeenCalledWith('b');
  expect(screen.getAllByLabelText('Unsaved changes')).toHaveLength(1);
  expect(moveRovingFocus(0, 2, 'Home')).toBe(0);
  expect(moveRovingFocus(0, 2, 'End')).toBe(1);
  expect(contrastRatio('#202124', '#fffdf8')).toBeGreaterThanOrEqual(4.5);
  expect(focusElement(null)).toBe(false);
});
