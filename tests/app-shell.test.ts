import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';

it('renders the PrismPad shell without IDE panels', () => {
  render(App);
  expect(screen.getByRole('application', { name: 'PrismPad' })).toBeInTheDocument();
  expect(screen.queryByText('Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('Explorer')).not.toBeInTheDocument();
});
