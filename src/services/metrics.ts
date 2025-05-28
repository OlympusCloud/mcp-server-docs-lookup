import { EventEmitter } from 'events';
import logger from '../utils/logger';

export interface Metric {
  name: string;
  value: number;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: Record<string, string>;
  timestamp: Date;
}

export interface MetricsSummary {
  requests: {
    total: number;
    byEndpoint: Record<string, number>;
    byStatus: Record<string, number>;
    averageResponseTime: number;
  };
  search: {
    total: number;
    averageLatency: number;
    averageResults: number;
    byStrategy: Record<string, number>;
  };
  repositories: {
    total: number;
    synced: number;
    syncErrors: number;
    averageSyncTime: number;
    lastSync: Record<string, Date>;
  };
  documents: {
    total: number;
    totalChunks: number;
    averageChunksPerDocument: number;
    byType: Record<string, number>;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    activeConnections: number;
  };
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private startTime: Date;

  constructor() {
    super();
    this.startTime = new Date();
    this.setupSystemMetrics();
  }

  private setupSystemMetrics(): void {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.recordGauge('system.memory.heapUsed', process.memoryUsage().heapUsed);
      this.recordGauge('system.memory.heapTotal', process.memoryUsage().heapTotal);
      this.recordGauge('system.memory.rss', process.memoryUsage().rss);
      this.recordGauge('system.memory.external', process.memoryUsage().external);
      
      const cpuUsage = process.cpuUsage();
      this.recordGauge('system.cpu.user', cpuUsage.user);
      this.recordGauge('system.cpu.system', cpuUsage.system);
    }, 30000);
  }

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
    
    this.recordMetric({
      name,
      value: current + value,
      type: 'counter',
      labels,
      timestamp: new Date()
    });
  }

  recordGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);
    
    this.recordMetric({
      name,
      value,
      type: 'gauge',
      labels,
      timestamp: new Date()
    });
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    
    const values = this.histograms.get(key)!;
    values.push(value);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.recordMetric({
      name,
      value,
      type: 'histogram',
      labels,
      timestamp: new Date()
    });
  }

  recordTiming(name: string, startTime: number, labels?: Record<string, string>): void {
    const duration = Date.now() - startTime;
    this.recordHistogram(name, duration, labels);
  }

  private recordMetric(metric: Metric): void {
    const key = this.getMetricKey(metric.name, metric.labels);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metricHistory = this.metrics.get(key)!;
    metricHistory.push(metric);
    
    // Keep only last hour of metrics
    const oneHourAgo = new Date(Date.now() - 3600000);
    const filtered = metricHistory.filter(m => m.timestamp > oneHourAgo);
    this.metrics.set(key, filtered);
    
    this.emit('metric', metric);
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    
    return `${name}{${labelStr}}`;
  }

  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key) || 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  getHistogramStats(name: string, labels?: Record<string, string>): {
    count: number;
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.getMetricKey(name, labels);
    const values = this.histograms.get(key);
    
    if (!values || values.length === 0) {
      return null;
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const min = sorted[0];
    const max = sorted[count - 1];
    const mean = sorted.reduce((a, b) => a + b, 0) / count;
    
    const percentile = (p: number) => {
      const index = Math.ceil(count * p / 100) - 1;
      return sorted[Math.max(0, Math.min(index, count - 1))];
    };
    
    return {
      count,
      min,
      max,
      mean,
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99)
    };
  }

  getSummary(): MetricsSummary {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    
    // Request metrics
    const requestsByEndpoint: Record<string, number> = {};
    const requestsByStatus: Record<string, number> = {};
    
    this.counters.forEach((value, key) => {
      if (key.startsWith('http.requests{')) {
        const match = key.match(/endpoint=([^,}]+)/);
        if (match) {
          requestsByEndpoint[match[1]] = value;
        }
        
        const statusMatch = key.match(/status=(\d+)/);
        if (statusMatch) {
          requestsByStatus[statusMatch[1]] = value;
        }
      }
    });
    
    const totalRequests = Object.values(requestsByEndpoint).reduce((a, b) => a + b, 0);
    const responseTimeStats = this.getHistogramStats('http.response.time');
    
    // Search metrics
    const searchTotal = this.getCounter('search.queries');
    const searchLatencyStats = this.getHistogramStats('search.latency');
    const searchResultsStats = this.getHistogramStats('search.results.count');
    
    const searchByStrategy: Record<string, number> = {};
    ['semantic', 'keyword', 'hybrid'].forEach(strategy => {
      searchByStrategy[strategy] = this.getCounter('search.queries', { strategy });
    });
    
    // Repository metrics
    const repoTotal = this.getCounter('repositories.total');
    const repoSynced = this.getCounter('repositories.synced');
    const repoSyncErrors = this.getCounter('repositories.sync.errors');
    const syncTimeStats = this.getHistogramStats('repositories.sync.time');
    
    const lastSync: Record<string, Date> = {};
    this.metrics.forEach((metrics, key) => {
      if (key.startsWith('repositories.last_sync{')) {
        const match = key.match(/name=([^}]+)/);
        if (match && metrics.length > 0) {
          lastSync[match[1]] = metrics[metrics.length - 1].timestamp;
        }
      }
    });
    
    // Document metrics
    const docsByType: Record<string, number> = {};
    this.counters.forEach((value, key) => {
      if (key.startsWith('documents.processed{type=')) {
        const match = key.match(/type=([^}]+)/);
        if (match) {
          docsByType[match[1]] = value;
        }
      }
    });
    
    const totalDocs = Object.values(docsByType).reduce((a, b) => a + b, 0);
    const totalChunks = this.getCounter('documents.chunks');
    
    return {
      requests: {
        total: totalRequests,
        byEndpoint: requestsByEndpoint,
        byStatus: requestsByStatus,
        averageResponseTime: responseTimeStats?.mean || 0
      },
      search: {
        total: searchTotal,
        averageLatency: searchLatencyStats?.mean || 0,
        averageResults: searchResultsStats?.mean || 0,
        byStrategy: searchByStrategy
      },
      repositories: {
        total: repoTotal,
        synced: repoSynced,
        syncErrors: repoSyncErrors,
        averageSyncTime: syncTimeStats?.mean || 0,
        lastSync
      },
      documents: {
        total: totalDocs,
        totalChunks,
        averageChunksPerDocument: totalDocs > 0 ? totalChunks / totalDocs : 0,
        byType: docsByType
      },
      system: {
        uptime,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        activeConnections: this.getGauge('websocket.connections') || 0
      }
    };
  }

  // Prometheus format export
  exportPrometheus(): string {
    const lines: string[] = [];
    
    // Counters
    this.counters.forEach((value, key) => {
      const [name, labels] = this.parseMetricKey(key);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labels} ${value}`);
    });
    
    // Gauges
    this.gauges.forEach((value, key) => {
      const [name, labels] = this.parseMetricKey(key);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labels} ${value}`);
    });
    
    // Histograms
    this.histograms.forEach((values, key) => {
      const [name, labels] = this.parseMetricKey(key);
      const stats = this.getHistogramStats(name, this.parseLabels(labels));
      
      if (stats) {
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count${labels} ${stats.count}`);
        lines.push(`${name}_sum${labels} ${values.reduce((a, b) => a + b, 0)}`);
        lines.push(`${name}_min${labels} ${stats.min}`);
        lines.push(`${name}_max${labels} ${stats.max}`);
        lines.push(`${name}_p50${labels} ${stats.p50}`);
        lines.push(`${name}_p95${labels} ${stats.p95}`);
        lines.push(`${name}_p99${labels} ${stats.p99}`);
      }
    });
    
    return lines.join('\n');
  }

  private parseMetricKey(key: string): [string, string] {
    const match = key.match(/^([^{]+)(\{[^}]*\})?$/);
    if (!match) return [key, ''];
    
    return [match[1], match[2] || ''];
  }

  private parseLabels(labelStr: string): Record<string, string> | undefined {
    if (!labelStr || labelStr === '{}') return undefined;
    
    const labels: Record<string, string> = {};
    const cleaned = labelStr.slice(1, -1);
    
    cleaned.split(',').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key && value) {
        labels[key] = value;
      }
    });
    
    return labels;
  }

  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    logger.info('Metrics reset');
  }
}

// Singleton instance
let metricsCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector();
  }
  return metricsCollector;
}

// Export singleton instance as 'metrics' for convenience
export const metrics = {
  increment: (name: string, labels?: Record<string, string>) => getMetricsCollector().incrementCounter(name, 1, labels),
  gauge: (name: string, value: number, labels?: Record<string, string>) => getMetricsCollector().recordGauge(name, value, labels),
  histogram: (name: string, value: number, labels?: Record<string, string>) => getMetricsCollector().recordHistogram(name, value, labels),
  timing: (name: string, startTime: number, labels?: Record<string, string>) => getMetricsCollector().recordTiming(name, startTime, labels)
};

export default MetricsCollector;