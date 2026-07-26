import { describe, expect, it, vi } from 'vitest';

import {
  createManualLocationResolver,
  createManualLocationSearchController,
  MANUAL_LOCATION_AREAS,
  ManualLocationResolutionError,
  type ManualLocationResolver,
  type ManualLocationResult,
} from './manual-location-resolver';

const tamboraArea = MANUAL_LOCATION_AREAS[0];
const kalideresArea = MANUAL_LOCATION_AREAS[2];
if (!tamboraArea || !kalideresArea) {
  throw new Error('Manual location test fixtures are incomplete.');
}

function signal() {
  return new AbortController().signal;
}

describe('deterministic manual location resolver', () => {
  it('uses exactly the four areas from the Phase 5 design', () => {
    expect(MANUAL_LOCATION_AREAS.map((area) => `${area.label}, ${area.secondaryLabel}`)).toEqual([
      'Tambora, Jakarta Barat',
      'Grogol Petamburan, Jakarta Barat',
      'Kalideres, Jakarta Barat',
      'Cengkareng, Jakarta Barat',
    ]);
  });

  it('searches normalized labels and resolves a stable id', async () => {
    const resolver = createManualLocationResolver();

    await expect(resolver.search('  grogol   petamburan ', signal())).resolves.toEqual([
      expect.objectContaining({
        id: 'grogol-petamburan-jakarta-barat',
        latitude: -6.167,
        longitude: 106.7972,
      }),
    ]);
    await expect(resolver.getById('kalideres-jakarta-barat', signal())).resolves.toEqual(
      expect.objectContaining({ label: 'Kalideres' }),
    );
  });

  it.each([
    ['', 'INVALID_FORMAT'],
    ['12', 'INVALID_FORMAT'],
    ['Jakarta', 'TOO_BROAD'],
    ['area-yang-tidak-ada', 'NOT_FOUND'],
  ] as const)('returns typed error %s -> %s', async (query, reason) => {
    const resolver = createManualLocationResolver();
    const request = resolver.search(query, signal());

    await expect(request).rejects.toMatchObject({
      name: 'ManualLocationResolutionError',
      reason,
    });
  });

  it('classifies an invalid provider result as unusable', async () => {
    const resolver = createManualLocationResolver([
      {
        id: 'broken-area',
        label: 'Broken Area',
        latitude: Number.NaN,
        longitude: 106.8,
      },
    ]);

    await expect(resolver.getById('broken-area', signal())).rejects.toMatchObject({
      reason: 'UNUSABLE_RESULT',
    });
    await expect(resolver.search('broken', signal())).rejects.toMatchObject({
      reason: 'UNUSABLE_RESULT',
    });
  });

  it('honors AbortSignal without converting cancellation into an invalid location', async () => {
    const resolver = createManualLocationResolver();
    const controller = new AbortController();
    controller.abort();

    await expect(resolver.search('Tambora', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(
      await resolver.search('Tambora', controller.signal).catch((error: unknown) => error),
    ).not.toBeInstanceOf(ManualLocationResolutionError);
  });
});

describe('latest manual search controller', () => {
  it('aborts the previous request and suppresses a resolver that returns stale data', async () => {
    const pending: Array<{
      resolve(value: readonly ManualLocationResult[]): void;
      signal: AbortSignal;
    }> = [];
    const resolver: ManualLocationResolver = {
      getById: vi.fn(),
      search: vi.fn((_query: string, requestSignal: AbortSignal) => {
        return new Promise<readonly ManualLocationResult[]>((resolve) => {
          pending.push({ resolve, signal: requestSignal });
        });
      }),
    };
    const controller = createManualLocationSearchController(resolver);

    const first = controller.search('Tambora');
    const second = controller.search('Kalideres');

    expect(pending[0]?.signal.aborted).toBe(true);
    pending[1]?.resolve([kalideresArea]);
    await expect(second).resolves.toEqual([kalideresArea]);

    pending[0]?.resolve([tamboraArea]);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('can explicitly cancel the active request', async () => {
    let resolveRequest: ((value: readonly ManualLocationResult[]) => void) | undefined;
    const resolver: ManualLocationResolver = {
      getById: vi.fn(),
      search: vi.fn(
        (_query: string, _signal: AbortSignal) =>
          new Promise<readonly ManualLocationResult[]>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    };
    const controller = createManualLocationSearchController(resolver);
    const request = controller.search('Tambora');

    controller.cancel();
    resolveRequest?.([tamboraArea]);

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
