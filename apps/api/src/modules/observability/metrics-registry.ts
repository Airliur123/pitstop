import { Injectable } from '@nestjs/common';
import { assertSafeMetricLabels } from '@pitstop/config/security';

type MetricLabels = Readonly<Record<string, string>>;
type MetricType = 'counter' | 'gauge' | 'histogram';

interface MetricDefinition {
  readonly help: string;
  readonly labels: readonly string[];
  readonly type: MetricType;
}

interface HistogramValue {
  readonly buckets: number[];
  count: number;
  sum: number;
}

const HISTOGRAM_BUCKETS_SECONDS = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;

const METRICS = {
  pitstop_api_active_requests: {
    help: 'Current number of API requests being processed.',
    labels: [],
    type: 'gauge',
  },
  pitstop_api_errors_total: {
    help: 'API responses classified as errors.',
    labels: ['error_class', 'route', 'status_class'],
    type: 'counter',
  },
  pitstop_api_request_duration_seconds: {
    help: 'API request processing duration.',
    labels: ['method', 'route'],
    type: 'histogram',
  },
  pitstop_api_requests_total: {
    help: 'API requests completed.',
    labels: ['method', 'route', 'status_class'],
    type: 'counter',
  },
  pitstop_dependency_available: {
    help: 'Whether a required dependency was available during the latest check.',
    labels: ['dependency'],
    type: 'gauge',
  },
  pitstop_dependency_operation_failures_total: {
    help: 'Bounded dependency operation failures observed by health and diagnostics.',
    labels: ['dependency', 'operation'],
    type: 'counter',
  },
  pitstop_domain_backlog: {
    help: 'Current bounded domain backlog.',
    labels: ['kind'],
    type: 'gauge',
  },
  pitstop_rate_limit_rejections_total: {
    help: 'Requests rejected by an API rate limiter.',
    labels: ['scope'],
    type: 'counter',
  },
  pitstop_worker_jobs_total: {
    help: 'Worker job outcomes from the latest heartbeat snapshot.',
    labels: ['outcome'],
    type: 'gauge',
  },
  pitstop_worker_queue_jobs: {
    help: 'BullMQ queue state from the latest worker heartbeat snapshot.',
    labels: ['state'],
    type: 'gauge',
  },
  pitstop_worker_stale_lease_recoveries_total: {
    help: 'Stale integration leases recovered by the worker.',
    labels: [],
    type: 'gauge',
  },
  pitstop_worker_up: {
    help: 'Whether the worker heartbeat is fresh.',
    labels: [],
    type: 'gauge',
  },
} as const satisfies Readonly<Record<string, MetricDefinition>>;

export type MetricName = keyof typeof METRICS;

@Injectable()
export class MetricsRegistry {
  private readonly values = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramValue>();

  increment(name: MetricName, labels: MetricLabels = {}, value = 1): void {
    this.requireType(name, 'counter');
    const key = metricKey(name, labels);
    this.values.set(key, (this.values.get(key) ?? 0) + finiteNonNegative(value));
  }

  set(name: MetricName, labels: MetricLabels = {}, value: number): void {
    this.requireType(name, 'gauge');
    this.values.set(metricKey(name, labels), finiteNonNegative(value));
  }

  add(name: MetricName, labels: MetricLabels = {}, value: number): void {
    this.requireType(name, 'gauge');
    const key = metricKey(name, labels);
    this.values.set(key, Math.max(0, (this.values.get(key) ?? 0) + finiteNumber(value)));
  }

  observe(name: MetricName, labels: MetricLabels, value: number): void {
    this.requireType(name, 'histogram');
    const key = metricKey(name, labels);
    const histogram = this.histograms.get(key) ?? {
      buckets: HISTOGRAM_BUCKETS_SECONDS.map(() => 0),
      count: 0,
      sum: 0,
    };
    const observed = finiteNonNegative(value);
    histogram.count += 1;
    histogram.sum += observed;
    HISTOGRAM_BUCKETS_SECONDS.forEach((boundary, index) => {
      if (observed <= boundary) histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1;
    });
    this.histograms.set(key, histogram);
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, definition] of Object.entries(METRICS) as [MetricName, MetricDefinition][]) {
      lines.push(`# HELP ${name} ${definition.help}`, `# TYPE ${name} ${definition.type}`);
      if (definition.type === 'histogram') {
        this.renderHistograms(lines, name);
      } else {
        for (const [key, value] of this.values) {
          const parsed = parseMetricKey(key);
          if (parsed.name === name) lines.push(`${name}${renderLabels(parsed.labels)} ${value}`);
        }
      }
    }
    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.values.clear();
    this.histograms.clear();
  }

  private renderHistograms(lines: string[], name: MetricName): void {
    for (const [key, value] of this.histograms) {
      const parsed = parseMetricKey(key);
      if (parsed.name !== name) continue;
      HISTOGRAM_BUCKETS_SECONDS.forEach((boundary, index) => {
        lines.push(
          `${name}_bucket${renderLabels({ ...parsed.labels, le: String(boundary) })} ${value.buckets[index] ?? 0}`,
        );
      });
      lines.push(
        `${name}_bucket${renderLabels({ ...parsed.labels, le: '+Inf' })} ${value.count}`,
        `${name}_sum${renderLabels(parsed.labels)} ${value.sum}`,
        `${name}_count${renderLabels(parsed.labels)} ${value.count}`,
      );
    }
  }

  private requireType(name: MetricName, type: MetricType): void {
    if (METRICS[name].type !== type) {
      throw new TypeError(`Metric ${name} is not a ${type}`);
    }
  }
}

export function metricRouteTemplate(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 120) return 'unmatched';
  if (!/^\/[A-Za-z0-9_/:.*{}-]*$/.test(value)) return 'unmatched';
  return value;
}

function metricKey(name: MetricName, labels: MetricLabels): string {
  const definition = METRICS[name];
  const labelKeys = Object.keys(labels).sort();
  const expected = [...definition.labels].sort();
  if (
    labelKeys.length !== expected.length ||
    labelKeys.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`Invalid labels for metric ${name}`);
  }
  assertSafeMetricLabels(labels);
  const safeLabels = Object.fromEntries(
    labelKeys.map((key) => [key, safeMetricLabelValue(labels[key])]),
  );
  return `${name}\u0000${JSON.stringify(safeLabels)}`;
}

function parseMetricKey(key: string): { readonly labels: MetricLabels; readonly name: string } {
  const separator = key.indexOf('\u0000');
  return {
    name: key.slice(0, separator),
    labels: JSON.parse(key.slice(separator + 1)) as MetricLabels,
  };
}

function safeMetricLabelValue(value: string | undefined): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 120 ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new TypeError('Metric label value is not bounded and safe');
  }
  return value;
}

function renderLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return `{${entries
    .map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

function finiteNonNegative(value: number): number {
  const finite = finiteNumber(value);
  if (finite < 0) throw new TypeError('Metric values must not be negative');
  return finite;
}

function finiteNumber(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('Metric values must be finite');
  return value;
}
