export type DependencyAvailability = 'down' | 'up';

export interface WorkerDiagnostics {
  readonly lastHeartbeatAt: string | null;
  readonly lastSuccessfulActivityAt: string | null;
  readonly state: 'ready' | 'stale' | 'stopping' | 'unavailable';
}

export interface QueueDiagnostics {
  readonly active: number;
  readonly delayed: number;
  readonly dlq: number;
  readonly failed: number;
  readonly waiting: number;
}

export interface DomainBacklogDiagnostics {
  readonly contributionsPending: number;
  readonly googleFormDlq: number;
  readonly googleFormInbox: number;
  readonly reportsPendingOrInReview: number;
}

export interface AdminSystemDiagnostics {
  readonly backlog: DomainBacklogDiagnostics;
  readonly dependencies: {
    readonly database: DependencyAvailability;
    readonly queue: DependencyAvailability;
    readonly redis: DependencyAvailability;
  };
  readonly environment: string;
  readonly generatedAt: string;
  readonly queues: QueueDiagnostics;
  readonly release: string;
  readonly service: 'pitstop-api';
  readonly status: 'not_ready' | 'ready';
  readonly worker: WorkerDiagnostics;
}
