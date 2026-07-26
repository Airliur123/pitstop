import type { PublicPlaceListItem, PublicRecommendation } from '@pitstop/contracts';
import { Card, FacilityChip, LinkButton, StatusBadge } from '@pitstop/ui';

import { formatDistance, formatRupiah } from '../lib/format';

function statusFor(place: PublicPlaceListItem | PublicRecommendation) {
  if (!('openStatus' in place)) return 'unknown' as const;
  return place.openStatus === 'OPEN'
    ? ('open' as const)
    : place.openStatus === 'CLOSING_SOON'
      ? ('soon' as const)
      : place.openStatus === 'CLOSED'
        ? ('closed' as const)
        : ('unknown' as const);
}

export function PlaceResultCard({
  compact = false,
  place,
}: Readonly<{
  compact?: boolean;
  place: PublicPlaceListItem | PublicRecommendation;
}>) {
  const price =
    ('cheapestQualifyingItem' in place ? place.cheapestQualifyingItem : null) ??
    place.cheapestAvailableMainItem;
  if (compact) {
    return (
      <Card className="flex min-h-20 items-center gap-2.5 rounded-button px-3 py-2.5 shadow-none">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold">{place.name}</h3>
          <p className="mt-1 text-[13px] text-muted">
            {formatDistance(place.distanceMeters)}
            {price ? ` · ${formatRupiah(price.priceAmount)}` : ''}
          </p>
        </div>
        <LinkButton className="shrink-0" href={`/places/${place.slug}`} variant="ghost">
          Detail
        </LinkButton>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-bold">{place.name}</h3>
        <StatusBadge status={statusFor(place)} />
      </div>
      <p className="text-[13px] text-muted">{formatDistance(place.distanceMeters)}</p>
      {price ? (
        <>
          <p className="text-[15px] font-semibold text-brand">
            Mulai {formatRupiah(price.priceAmount)}
          </p>
          <p className="text-sm">
            {price.name} {formatRupiah(price.priceAmount)}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">Harga menu belum tersedia.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {place.facilitySummary.slice(0, 3).map((facility) => (
          <FacilityChip
            key={facility.code}
            label={facility.name}
            state={
              facility.status === 'AVAILABLE'
                ? 'available'
                : facility.status === 'NOT_AVAILABLE'
                  ? 'unavailable'
                  : 'unknown'
            }
          />
        ))}
      </div>
      <LinkButton className="w-full" href={`/places/${place.slug}`} variant="ghost">
        Detail
      </LinkButton>
    </Card>
  );
}
