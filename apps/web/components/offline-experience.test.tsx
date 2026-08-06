import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { OfflineExperience } from './offline-experience';

it('shows a private-data-safe offline explanation and announces reconnection', () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  render(<OfflineExperience />);

  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Koneksi sedang tidak tersedia' })).toBeVisible();
  expect(
    screen.getByText(/tidak menampilkan data tersimpan sebagai informasi terbaru/),
  ).toBeVisible();
  expect(screen.getByText(/Login, Aktivitas, kontribusi, laporan/)).toBeVisible();

  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  act(() => window.dispatchEvent(new Event('online')));
  expect(screen.getByRole('heading', { name: 'Koneksi kembali tersedia' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeEnabled();
});
