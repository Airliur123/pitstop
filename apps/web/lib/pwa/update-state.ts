export type PwaUpdateStatus = 'applying' | 'available' | 'failed' | 'idle';

export type PwaUpdateEvent =
  | { readonly type: 'APPLY' }
  | { readonly type: 'AVAILABLE' }
  | { readonly type: 'FAILED' }
  | { readonly type: 'RESET' };

export function reducePwaUpdateStatus(
  status: PwaUpdateStatus,
  event: PwaUpdateEvent,
): PwaUpdateStatus {
  switch (event.type) {
    case 'AVAILABLE':
      return 'available';
    case 'APPLY':
      return status === 'available' || status === 'failed' ? 'applying' : status;
    case 'FAILED':
      return status === 'applying' ? 'failed' : status;
    case 'RESET':
      return 'idle';
  }
}

export function shouldReloadForControllerChange(
  activationWasRequested: boolean,
  reloadAlreadyStarted: boolean,
) {
  return activationWasRequested && !reloadAlreadyStarted;
}
