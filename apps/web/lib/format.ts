export function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    currency: 'IDR',
    maximumFractionDigits: 0,
    style: 'currency',
  })
    .format(amount)
    .replace(/\s/g, '');
}

export function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m`;
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(distanceMeters / 1_000)} km`;
}

export function formatTime(value: string | null) {
  return value ? value.slice(0, 5).replace(':', '.') : null;
}
