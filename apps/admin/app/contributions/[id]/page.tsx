import {
  AdminTopbar,
  Alert,
  Badge,
  Breadcrumb,
  Card,
  FacilityChip,
  SectionHeader,
  StatusBadge,
} from '@pitstop/ui';
import { notFound } from 'next/navigation';

import { AccessDenied } from '../../../components/access-denied';
import { AdminShell } from '../../../components/admin-shell';
import { ModerationActions } from '../../../components/moderation-actions';
import { AdminApiProblem } from '../../../lib/api/client';
import { getAdminContribution } from '../../../lib/api/server';
import { requireAuthenticatedUser } from '../../../lib/auth';
import {
  actionLabels,
  categoryLabels,
  formatDateTime,
  formatMoney,
  sourceLabels,
  toUiStatus,
} from '../../../lib/format';

export const dynamic = 'force-dynamic';

const facilityLabels = {
  MUSALA: 'Musala',
  PARKING: 'Parkir',
  POWER_OUTLET: 'Stopkontak',
  SEATING: 'Tempat duduk',
  SHADE: 'Peneduh',
  TOILET: 'Toilet',
  WIFI: 'Wi-Fi',
} as const;

const dayLabels = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

export default async function ContributionDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const user = await requireAuthenticatedUser();
  if (user.role !== 'ADMIN') return <AccessDenied email={user.email} />;
  const { id } = await params;
  let contribution;
  try {
    contribution = await getAdminContribution(id);
  } catch (error) {
    if (error instanceof AdminApiProblem && error.status === 404) notFound();
    throw error;
  }
  const payload = contribution.payload;

  return (
    <AdminShell current="moderation" userEmail={user.email}>
      <Breadcrumb
        items={[
          { href: '/contributions', label: 'Kontribusi' },
          { label: payload.placeName ?? contribution.id },
        ]}
      />
      <div className="mt-4">
        <AdminTopbar
          description={`ID ${contribution.id} · versi ${contribution.version}`}
          title={payload.placeName ?? 'Kontribusi tanpa nama'}
          trailing={<StatusBadge status={toUiStatus(contribution.status)} />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <SectionHeader
              description="Payload asli yang tersimpan sebagai sumber kanonis kontribusi."
              title="Data kontribusi"
            />
            <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Nama tempat" value={payload.placeName} />
              <Detail
                label="Kategori"
                value={payload.category ? categoryLabels[payload.category] : undefined}
              />
              <Detail className="sm:col-span-2" label="Alamat" value={payload.address} />
              <Detail label="Wilayah/area" value={payload.area} />
              <Detail label="Patokan" value={payload.landmark} />
              <Detail
                label="Menu utama"
                value={
                  payload.mainMenu?.name
                    ? `${payload.mainMenu.name} · ${formatMoney(payload.mainMenu.priceAmount)}`
                    : undefined
                }
              />
              <Detail
                label="Kisaran harga"
                value={
                  payload.priceRange
                    ? `${formatMoney(payload.priceRange.minimum)}–${formatMoney(
                        payload.priceRange.maximum,
                      )}`
                    : undefined
                }
              />
              <Detail
                label="Budget maksimum relevan"
                value={
                  payload.maximumUsefulBudget ? formatMoney(payload.maximumUsefulBudget) : undefined
                }
              />
              <Detail className="sm:col-span-2" label="Catatan" value={payload.notes} />
            </dl>
            {payload.mapsUrl ? (
              <Alert className="mt-5" title="Kandidat peta belum diverifikasi" tone="warning">
                Tautan kontributor hanya petunjuk.{' '}
                <a
                  className="font-semibold text-brand underline"
                  href={payload.mapsUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Buka kandidat peta
                </a>{' '}
                dan masukkan koordinat terverifikasi saat menyetujui.
              </Alert>
            ) : null}
          </Card>

          <Card>
            <SectionHeader title="Fasilitas dan jam operasional" />
            <div className="mt-5 flex flex-wrap gap-2">
              {payload.facilities?.length ? (
                payload.facilities.map((facility) => (
                  <FacilityChip
                    key={facility.code}
                    label={facilityLabels[facility.code]}
                    state={
                      facility.status === 'AVAILABLE'
                        ? 'available'
                        : facility.status === 'NOT_AVAILABLE'
                          ? 'unavailable'
                          : 'unknown'
                    }
                  />
                ))
              ) : (
                <span className="text-sm text-muted">Belum ada data fasilitas.</span>
              )}
            </div>
            {payload.operatingHours?.length ? (
              <table className="mt-5 w-full text-left text-sm">
                <caption className="sr-only">Jam operasional yang dikirim kontributor</caption>
                <tbody className="divide-y divide-border">
                  {payload.operatingHours.map((hours) => (
                    <tr key={hours.dayOfWeek}>
                      <th className="py-3 font-semibold" scope="row">
                        {dayLabels[hours.dayOfWeek]}
                      </th>
                      <td className="py-3 text-right">
                        {hours.isClosed
                          ? 'Tutup'
                          : hours.is24Hours
                            ? '24 jam'
                            : `${hours.opensAt ?? '—'}–${hours.closesAt ?? '—'}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-5 text-sm text-muted">Belum ada jam operasional.</p>
            )}
          </Card>

          <Card>
            <SectionHeader
              description="Log append-only dari klaim sampai publikasi."
              title="Riwayat moderasi"
            />
            {contribution.history.length === 0 ? (
              <p className="mt-5 text-sm text-muted">Belum ada aktivitas moderasi.</p>
            ) : (
              <ol className="mt-5 divide-y divide-border">
                {contribution.history.map((event) => (
                  <li className="py-4" key={event.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{actionLabels[event.action]}</p>
                      <time className="text-sm text-muted" dateTime={event.createdAt}>
                        {formatDateTime(event.createdAt)}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {event.actor.email} · {event.previousStatus} → {event.nextStatus} · versi{' '}
                      {event.contributionVersion}
                    </p>
                    {event.reason ? <p className="mt-2 text-sm">{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6" aria-label="Status dan tindakan moderasi">
          <Card>
            <SectionHeader title="Konteks review" />
            <dl className="mt-5 space-y-4">
              <Detail
                label="Kontributor"
                value={
                  contribution.contributor
                    ? `${contribution.contributor.email} · ${contribution.contributor.id}`
                    : 'Sumber tanpa akun'
                }
              />
              <Detail label="Sumber" value={sourceLabels[contribution.source]} />
              <Detail label="Dikirim" value={formatDateTime(contribution.submittedAt)} />
              <Detail
                label="Reviewer aktif"
                value={
                  contribution.currentReviewer
                    ? `${contribution.currentReviewer.email}${contribution.currentReviewer.claimExpired ? ' · klaim kedaluwarsa' : ''}`
                    : 'Belum diambil'
                }
              />
              {contribution.decisionReason ? (
                <Detail label="Alasan keputusan" value={contribution.decisionReason} />
              ) : null}
            </dl>
          </Card>

          {contribution.verifiedLocation ? (
            <Card>
              <SectionHeader title="Lokasi terverifikasi" />
              <dl className="mt-5 space-y-4">
                <Detail
                  label="Koordinat"
                  value={`${contribution.verifiedLocation.latitude}, ${contribution.verifiedLocation.longitude}`}
                />
                <Detail
                  label="Wilayah"
                  value={`${contribution.verifiedLocation.district}, ${contribution.verifiedLocation.city}, ${contribution.verifiedLocation.province}`}
                />
                <Detail label="Kode pos" value={contribution.verifiedLocation.postalCode} />
                <Detail
                  label="Tujuan publikasi"
                  value={
                    contribution.publicationTarget?.mode === 'MERGE_EXISTING'
                      ? `Place ${contribution.publicationTarget.targetPlaceId}`
                      : 'Buat Place baru'
                  }
                />
              </dl>
              {contribution.mergedPlaceId ? (
                <Badge className="mt-5" tone="success">
                  Place {contribution.mergedPlaceId}
                </Badge>
              ) : null}
            </Card>
          ) : null}

          {contribution.duplicateHints.length > 0 ? (
            <Card>
              <SectionHeader
                description="Petunjuk worker untuk keputusan manusia; tidak ada merge atau reject otomatis."
                title="Kandidat duplikat"
              />
              <ol className="mt-5 space-y-4">
                {contribution.duplicateHints.map((hint) => (
                  <li
                    className="rounded-button border border-border p-3"
                    key={hint.candidatePlaceId}
                  >
                    <p className="font-semibold">Place {hint.candidatePlaceId}</p>
                    <p className="mt-1 text-sm text-muted">
                      {hint.distanceMeters} m · skor {Math.round(hint.score * 100)}%
                    </p>
                    <p className="mt-1 text-xs text-muted">{hint.matchedSignals.join(' · ')}</p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <Card>
            <SectionHeader
              description="Hanya tindakan valid untuk status dan pemegang klaim saat ini yang ditampilkan."
              title="Tindakan"
            />
            <div className="mt-5">
              <ModerationActions adminId={user.id} contribution={contribution} />
            </div>
          </Card>
        </aside>
      </div>
    </AdminShell>
  );
}

function Detail({
  className,
  label,
  value,
}: Readonly<{ className?: string; label: string; value: string | null | undefined }>) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value || '—'}</dd>
    </div>
  );
}
