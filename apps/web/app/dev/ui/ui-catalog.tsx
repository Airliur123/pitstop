'use client';

import {
  Alert,
  AlertDialog,
  AppHeader,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  FacilityChip,
  FormField,
  Input,
  MobileBottomNavigation,
  PlaceCard,
  RadioGroup,
  SearchField,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  Toast,
} from '@pitstop/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const previewSchema = z.object({
  name: z.string().trim().min(3, 'Gunakan minimal 3 karakter.'),
  notes: z.string().trim().max(120, 'Maksimum 120 karakter.'),
});

type PreviewForm = z.infer<typeof previewSchema>;

function CatalogSection({
  children,
  description,
  title,
}: Readonly<{ children: React.ReactNode; description?: string; title: string }>) {
  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:p-6">
      <div>
        <h2 className="text-[length:var(--pitstop-type-heading-h2-size)] font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function UiCatalog() {
  const [submitted, setSubmitted] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setFocus,
  } = useForm<PreviewForm>({
    defaultValues: { name: '', notes: '' },
  });

  const submit = handleSubmit((values) => {
    const result = previewSchema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'notes') {
          setError(field, { message: issue.message, type: 'zod' });
        }
      }
      setFocus(result.error.issues[0]?.path[0] === 'notes' ? 'notes' : 'name');
      return;
    }
    setSubmitted(true);
  });

  return (
    <div className="min-h-dvh bg-app pb-28">
      <AppHeader backHref="/" title="Component Catalog" />
      <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6" id="main-content">
        <header>
          <Badge tone="warning">Development only · UI Preview</Badge>
          <h1 className="mt-3 text-[length:var(--pitstop-type-heading-h1-size)] font-bold">
            PitStop Design System
          </h1>
          <p className="mt-2 max-w-2xl text-muted">
            Variants, interaction states, long content, dan responsive behavior tanpa API atau
            database.
          </p>
        </header>

        <CatalogSection title="Actions">
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Text</Button>
            <Button variant="destructive">Danger</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
          </div>
        </CatalogSection>

        <CatalogSection
          title="Forms"
          description="Contoh React Hook Form + Zod, bukan form produk."
        >
          <form className="grid max-w-xl gap-4" noValidate onSubmit={submit}>
            <FormField
              label="Nama preview"
              required
              {...(errors.name?.message ? { error: errors.name.message } : {})}
            >
              {(field) => (
                <Input
                  {...field}
                  {...register('name')}
                  autoComplete="off"
                  placeholder="Contoh komponen"
                />
              )}
            </FormField>
            <FormField
              description="Maksimum 120 karakter."
              label="Catatan preview"
              {...(errors.notes?.message ? { error: errors.notes.message } : {})}
            >
              {(field) => <Textarea {...field} {...register('notes')} />}
            </FormField>
            <FormField label="Pencarian">
              {(field) => <SearchField {...field} placeholder="Cari komponen" />}
            </FormField>
            <Select
              defaultValue="accessible"
              label="Kualitas"
              options={[
                { label: 'Accessible', value: 'accessible' },
                { label: 'Responsive', value: 'responsive' },
              ]}
            />
            <Checkbox defaultChecked label="Keyboard ready" name="keyboard" />
            <RadioGroup
              defaultValue="mobile"
              label="Viewport"
              name="viewport"
              options={[
                { label: 'Mobile', value: 'mobile' },
                { label: 'Desktop', value: 'desktop' },
              ]}
            />
            <Switch label="Reduced motion aware" name="motion" />
            <Button type="submit">Validasi preview</Button>
            {submitted ? (
              <Alert title="Preview valid" tone="success">
                Tidak ada data yang disimpan.
              </Alert>
            ) : null}
          </form>
        </CatalogSection>

        <CatalogSection title="Display and status">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="open" />
            <StatusBadge status="soon" />
            <StatusBadge status="closed" />
            <StatusBadge status="unknown" />
            <StatusBadge status="pending" />
            <StatusBadge status="approved" />
            <StatusBadge status="rejected" />
            <FacilityChip label="Toilet" state="available" />
            <FacilityChip label="Parkir" state="unavailable" />
            <Chip>≤ Rp10.000</Chip>
            <Chip selected>≤ Rp15.000</Chip>
          </div>
          <PlaceCard
            distance="1,2 km · ±4 menit"
            menu="Nasi telur Rp12.000"
            price="Mulai Rp10.000"
            title="Warung dengan nama sangat panjang untuk menguji pembungkusan teks"
          />
        </CatalogSection>

        <CatalogSection title="Feedback">
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert title="Informasi" tone="info">
              Konten informatif.
            </Alert>
            <Alert title="Peringatan" tone="warning">
              Periksa kembali input.
            </Alert>
            <Alert title="Berhasil" tone="success">
              Perubahan tersimpan.
            </Alert>
            <Alert title="Gagal" tone="danger">
              Terjadi kesalahan.
            </Alert>
            <Toast title="Status diperbarui">Toast menggunakan live region.</Toast>
            <Skeleton className="h-28" />
          </div>
          <div className="flex items-center gap-3">
            <Spinner />
            <span>Loading memiliki nama aksesibel.</span>
          </div>
          <EmptyState title="Belum ada data">Coba ubah filter atau kembali nanti.</EmptyState>
          <ErrorState />
        </CatalogSection>

        <CatalogSection title="Overlays and keyboard">
          <div className="flex flex-wrap gap-3">
            <Dialog
              description="Escape menutup dialog dan fokus kembali ke trigger."
              title="Dialog preview"
              trigger={<Button variant="secondary">Buka dialog</Button>}
            >
              <p className="text-sm">Konten generik untuk pengujian fokus.</p>
            </Dialog>
            <Sheet
              description="Bottom sheet mengikuti radius modal 24 px."
              title="Pilih opsi"
              trigger={<Button variant="secondary">Buka sheet</Button>}
            >
              <div className="grid grid-cols-2 gap-2">
                <Chip>Opsi satu</Chip>
                <Chip selected>Opsi dua</Chip>
              </div>
            </Sheet>
            <AlertDialog
              description="Aksi ini hanya simulasi dan tidak mengubah data."
              title="Konfirmasi preview"
              trigger={<Button variant="destructive">Buka konfirmasi</Button>}
            />
          </div>
        </CatalogSection>

        <CatalogSection title="Tabs">
          <Tabs
            defaultValue="normal"
            items={[
              { content: <Card>Normal state</Card>, label: 'Normal', value: 'normal' },
              {
                content: <Card>Long text and narrow viewport state</Card>,
                label: 'Responsive',
                value: 'responsive',
              },
              { content: <Card>Error state</Card>, label: 'Error', value: 'error' },
            ]}
          />
        </CatalogSection>
      </main>
      <MobileBottomNavigation />
    </div>
  );
}
