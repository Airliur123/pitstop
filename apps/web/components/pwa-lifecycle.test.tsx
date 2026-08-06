import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { UpdateNotice } from './pwa-lifecycle';

it('announces an available update without applying it until the keyboard-accessible button is used', () => {
  const onApply = vi.fn();
  render(<UpdateNotice onApply={onApply} status="available" />);

  expect(screen.getByText('Versi baru PitStop tersedia')).toBeVisible();
  expect(onApply).not.toHaveBeenCalled();

  const applyButton = screen.getByRole('button', { name: 'Muat versi baru' });
  applyButton.focus();
  fireEvent.keyDown(applyButton, { key: 'Enter' });
  fireEvent.click(applyButton);

  expect(applyButton).toHaveFocus();
  expect(onApply).toHaveBeenCalledTimes(1);
});

it('explains that a failed activation did not automatically reload a form', () => {
  render(<UpdateNotice onApply={() => undefined} status="failed" />);
  expect(screen.getByText(/Formulir Anda tidak dimuat ulang otomatis/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
});
