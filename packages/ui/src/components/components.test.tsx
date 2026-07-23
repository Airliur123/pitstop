import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Home } from 'lucide-react';
import { expect, test } from 'vitest';

import { Button, IconButton } from './button';
import { StatusBadge } from './display';
import { Skeleton, Toast } from './feedback';
import { Checkbox, FormField, Input, Select } from './form-controls';
import { AdminSidebar, MobileBottomNavigation, Tabs } from './navigation';
import { Dialog, Sheet } from './overlays';

test('button exposes the Figma variants', () => {
  const { rerender } = render(<Button>Primary</Button>);
  expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('bg-interactive');

  rerender(<Button variant="secondary">Secondary</Button>);
  expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('border-border-brand');

  rerender(<Button variant="destructive">Danger</Button>);
  expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('bg-surface-danger');
});

test('loading button is disabled and announces busy state', () => {
  render(<Button loading>Submit</Button>);
  const button = screen.getByRole('button', { name: /memuat/i });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
});

test('icon button requires and exposes an accessible name', () => {
  render(
    <IconButton aria-label="Beranda">
      <Home aria-hidden="true" />
    </IconButton>,
  );
  expect(screen.getByRole('button', { name: 'Beranda' })).toBeVisible();
});

test('input is associated with its label and description', () => {
  render(
    <FormField description="Teks bantuan" label="Nama">
      {(properties) => <Input {...properties} />}
    </FormField>,
  );
  expect(screen.getByLabelText('Nama')).toHaveAccessibleDescription('Teks bantuan');
});

test('invalid field associates its error through aria-describedby', () => {
  render(
    <FormField error="Nama wajib diisi" label="Nama">
      {(properties) => <Input {...properties} />}
    </FormField>,
  );
  const input = screen.getByLabelText('Nama');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Nama wajib diisi');
});

test('checkbox toggles from the keyboard', async () => {
  const user = userEvent.setup();
  render(<Checkbox label="Keyboard ready" />);
  await user.tab();
  expect(screen.getByRole('checkbox', { name: 'Keyboard ready' })).toHaveFocus();
  await user.keyboard(' ');
  expect(screen.getByRole('checkbox', { name: 'Keyboard ready' })).toBeChecked();
});

test('select opens and selects an option with the keyboard', async () => {
  const user = userEvent.setup();
  render(
    <Select
      label="Kualitas"
      options={[
        { label: 'Accessible', value: 'accessible' },
        { label: 'Responsive', value: 'responsive' },
      ]}
    />,
  );
  await user.tab();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('option', { name: 'Accessible' })).toBeVisible();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(screen.getByRole('combobox', { name: 'Kualitas' })).toHaveTextContent('Responsive');
});

test('dialog closes with Escape and restores focus', async () => {
  const user = userEvent.setup();
  render(
    <Dialog title="Dialog preview" trigger={<Button>Buka dialog</Button>}>
      Konten
    </Dialog>,
  );
  const trigger = screen.getByRole('button', { name: 'Buka dialog' });
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'Dialog preview' })).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

test('sheet supports keyboard open and Escape close', async () => {
  const user = userEvent.setup();
  render(
    <Sheet title="Sheet preview" trigger={<Button>Buka sheet</Button>}>
      Konten sheet
    </Sheet>,
  );
  await user.tab();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('dialog', { name: 'Sheet preview' })).toBeVisible();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('tabs support arrow-key navigation', async () => {
  const user = userEvent.setup();
  render(
    <Tabs
      defaultValue="one"
      items={[
        { content: 'Panel one', label: 'One', value: 'one' },
        { content: 'Panel two', label: 'Two', value: 'two' },
      ]}
    />,
  );
  await user.tab();
  expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
});

test('toast uses an appropriate live region', () => {
  const { rerender } = render(<Toast title="Tersimpan" />);
  expect(screen.getByRole('status')).toHaveTextContent('Tersimpan');
  rerender(<Toast destructive title="Gagal" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Gagal');
});

test('status badge always includes a text label', () => {
  render(<StatusBadge status="soon" />);
  expect(screen.getByText('Segera tutup')).toBeVisible();
});

test('skeleton is hidden from the accessibility tree', () => {
  render(<Skeleton />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
});

test('mobile bottom navigation marks the current page', () => {
  render(<MobileBottomNavigation current="activity" />);
  expect(screen.getByRole('link', { name: 'Aktivitas' })).toHaveAttribute('aria-current', 'page');
});

test('admin sidebar exposes keyboard-accessible navigation', async () => {
  const user = userEvent.setup();
  render(<AdminSidebar current="moderation" />);
  await user.tab();
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveFocus();
  expect(screen.getByRole('link', { name: 'Moderasi' })).toHaveAttribute('aria-current', 'page');
});

test('representative components have no serious or critical axe violations', async () => {
  const { container } = render(
    <main>
      <FormField error="Wajib diisi" label="Nama">
        {(properties) => <Input {...properties} />}
      </FormField>
      <StatusBadge status="open" />
      <MobileBottomNavigation />
    </main>,
  );
  const result = await axe.run(container, {
    rules: {
      // jsdom has no canvas implementation; browser-level Playwright axe keeps this rule enabled.
      'color-contrast': { enabled: false },
    },
  });
  const blocking = result.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(blocking).toEqual([]);
});
