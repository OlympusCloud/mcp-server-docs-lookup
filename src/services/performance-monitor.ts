import * as os from 'os';
import * as process from 'process';
import logger from '../utils/logger';

export interface PerformanceMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  system: {
    uptime: number;
    processUptime: number;
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  application: {
    documentsIndexed: number;
    chunksProcessed: number;
    searchRequests: number;
    vectorStoreSize: number;
    repositoriesSync: number;
  };
}

export interface PerformanceThresholds {
  memoryWarning: number;    // MB
  memoryCritical: number;   // MB
  cpuWarning: number;       // percentage
  cpuCritical: number;      // percentage
  heapWarning: number;      // percentage of heap total
  heapCritical: number;     // percentage of heap total
}

export class PerformanceMonitorService {
  private metrics: PerformanceMetrics;
  private thresholds: PerformanceThresholds;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private applicationMetrics: PerformanceMetrics['application'];
  private lastCpuUsage: NodeJS.CpuUsage;
  private intervalMs: number;
  private isThrottled: boolean = false;
  private throttlingLevel: 'none' | 'light' | 'heavy' = 'none';

  constructor(
    thresholds: Partial<PerformanceThresholds> = {},
    intervalMs: number = 60000 // 1 minute default
  ) {
    this.thresholds = {
      memoryWarning: 1024,    // 1GB
      memoryCritical: 2048,   // 2GB
      cpuWarning: 70,         // 70%
      cpuCritical: 90,        // 90%
      heapWarning: 70,        // 70% of heap - more aggressive
      heapCritical: 85,       // 85% of heap - more aggressive
      ...thresholds
    };

    this.intervalMs = intervalMs;
    this.lastCpuUsage = process.cpuUsage();
    
    this.applicationMetrics = {
      documentsIndexed: 0,
      chunksProcessed: 0,
      searchRequests: 0,
      vectorStoreSize: 0,
      repositoriesSync: 0
    };

    this.metrics = this.collectMetrics();
  }

  start(): void {
    if (this.monitoringInterval) {
      this.stop();
    }

    logger.info('Performance monitoring started', {
      interval: this.intervalMs,
      thresholds: this.thresholds
    });

    this.monitoringInterval = setInterval(() => {
      this.collectAndAnalyzeMetrics();
    }, this.intervalMs);

    // Don't keep the process alive for monitoring
    this.monitoringInterval.unref();
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Performance monitoring stopped');
    }
  }

  private collectMetrics(): PerformanceMetrics {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    const currentCpuUsage = process.cpuUsage();
    const cpuDelta = process.cpuUsage(this.lastCpuUsage);
    const cpuPercent = ((cpuDelta.user + cpuDelta.system) / 1000000) / (this.intervalMs / 1000) * 100;
    this.lastCpuUsage = currentCpuUsage;

    return {
      memory: {
        used: Math.round(usedMemory / 1024 / 1024), // MB
        total: Math.round(totalMemory / 1024 / 1024), // MB
        percentage: Math.round((usedMemory / totalMemory) * 100),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      cpu: {
        usage: Math.min(Math.max(cpuPercent, 0), 100), // Clamp between 0-100
        loadAverage: os.loadavg()
      },
      system: {
        uptime: os.uptime(),
        processUptime: process.uptime(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      application: { ...this.applicationMetrics }
    };
  }

  private collectAndAnalyzeMetrics(): void {
    this.metrics = this.collectMetrics();
    this.analyzePerformance();
  }

  private analyzePerformance(): void {
    const { memory, cpu } = this.metrics;

    // Memory analysis
    if (memory.heapUsed >= this.thresholds.memoryCritical) {
      logger.error('Critical memory usage detected', {
        heapUsed: memory.heapUsed,
        threshold: this.thresholds.memoryCritical,
        action: 'immediate_attention_required'
      });
      this.triggerGarbageCollection();
    } else if (memory.heapUsed >= this.thresholds.memoryWarning) {
      logger.warn('High memory usage detected', {
        heapUsed: memory.heapUsed,
        threshold: this.thresholds.memoryWarning,
        action: 'monitor_closely'
      });
    }

    // Heap analysis
    const heapPercentage = (memory.heapUsed / memory.heapTotal) * 100;
    if (heapPercentage >= this.thresholds.heapCritical) {
      logger.error('Critical heap usage detected', {
        heapPercentage: Math.round(heapPercentage),
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        action: 'garbage_collection_triggered'
      });
      this.triggerGarbageCollection();
    } else if (heapPercentage >= this.thresholds.heapWarning) {
      logger.warn('High heap usage detected', {
        heapPercentage: Math.round(heapPercentage),
        action: 'consider_optimization'
      });
    }

    // CPU analysis with throttling
    if (cpu.usage >= this.thresholds.cpuCritical) {
      logger.error('Critical CPU usage detected', {
        cpuUsage: Math.round(cpu.usage),
        loadAverage: cpu.loadAverage,
        action: 'throttle_operations'
      });
      this.throttleOperations(true);
    } else if (cpu.usage >= this.thresholds.cpuWarning) {
      logger.warn('High CPU usage detected', {
        cpuUsage: Math.round(cpu.usage),
        action: 'monitor_operations'
      });
      this.throttleOperations(false);
    } else if (this.isThrottled) {
      this.stopThrottling();
    }

    // Log performance summary periodically
    if (Math.random() < 0.1) { // 10% chance to log summary
      logger.info('Performance summary', {
        memory: `${memory.heapUsed}MB/${memory.heapTotal}MB (${Math.round(heapPercentage)}%)`,
        cpu: `${Math.round(cpu.usage)}%`,
        uptime: `${Math.round(this.metrics.system.processUptime)}s`,
        throttling: { enabled: this.isThrottled, level: this.throttlingLevel },
        operations: {
          documents: this.applicationMetrics.documentsIndexed,
          chunks: this.applicationMetrics.chunksProcessed,
          searches: this.applicationMetrics.searchRequests
        }
      });
    }
  }

  private triggerGarbageCollection(): void {
    try {
      if (global.gc) {
        global.gc();
        logger.info('Garbage collection triggered');
      } else {
        logger.warn('Garbage collection not available - start with --expose-gc flag');
      }
    } catch (error) {
      logger.error('Failed to trigger garbage collection', { error });
    }
  }

  // Methods to update application metrics
  incrementDocumentsIndexed(count: number = 1): void {
    this.applicationMetrics.documentsIndexed += count;
  }

  incrementChunksProcessed(count: number = 1): void {
    this.applicationMetrics.chunksProcessed += count;
  }

  incrementSearchRequests(count: number = 1): void {
    this.applicationMetrics.searchRequests += count;
  }

  updateVectorStoreSize(size: number): void {
    this.applicationMetrics.vectorStoreSize = size;
  }

  incrementRepositoriesSync(count: number = 1): void {
    this.applicationMetrics.repositoriesSync += count;
  }

  updateApplicationMetrics(metrics: Partial<PerformanceMetrics['application']>): void {
    if (metrics.documentsIndexed !== undefined) {
      this.applicationMetrics.documentsIndexed += metrics.documentsIndexed;
    }
    if (metrics.chunksProcessed !== undefined) {
      this.applicationMetrics.chunksProcessed += metrics.chunksProcessed;
    }
    if (metrics.searchRequests !== undefined) {
      this.applicationMetrics.searchRequests += metrics.searchRequests;
    }
    if (metrics.vectorStoreSize !== undefined) {
      this.applicationMetrics.vectorStoreSize = metrics.vectorStoreSize;
    }
    if (metrics.repositoriesSync !== undefined) {
      this.applicationMetrics.repositoriesSync += metrics.repositoriesSync;
    }
  }

  private throttleOperations(heavy: boolean): void {
    const newLevel = heavy ? 'heavy' : 'light';
    if (this.throttlingLevel !== newLevel) {
      this.throttlingLevel = newLevel;
      this.isThrottled = true;
      logger.info(`Throttling operations - level: ${newLevel}`, {
        reason: heavy ? 'Critical resource usage' : 'High resource usage'
      });
    }
  }

  private stopThrottling(): void {
    if (this.isThrottled) {
      this.isThrottled = false;
      this.throttlingLevel = 'none';
      logger.info('Throttling disabled - resource usage normalized');
    }
  }

  shouldThrottle(): boolean {
    return this.isThrottled;
  }

  getThrottlingLevel(): 'none' | 'light' | 'heavy' {
    return this.throttlingLevel;
  }

  // Getters for current metrics
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getMemoryUsage(): PerformanceMetrics['memory'] {
    return { ...this.metrics.memory };
  }

  getCpuUsage(): PerformanceMetrics['cpu'] {
    return { ...this.metrics.cpu };
  }

  getApplicationMetrics(): PerformanceMetrics['application'] {
    return { ...this.applicationMetrics };
  }

  // Health check
  isHealthy(): boolean {
    const { memory, cpu } = this.metrics;
    const heapPercentage = (memory.heapUsed / memory.heapTotal) * 100;

    return (
      memory.heapUsed < this.thresholds.memoryCritical &&
      heapPercentage < this.thresholds.heapCritical &&
      cpu.usage < this.thresholds.cpuCritical
    );
  }

  getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: any } {
    const { memory, cpu } = this.metrics;
    const heapPercentage = (memory.heapUsed / memory.heapTotal) * 100;

    const issues = [];
    
    if (memory.heapUsed >= this.thresholds.memoryCritical) {
      issues.push(`Critical memory usage: ${memory.heapUsed}MB`);
    } else if (memory.heapUsed >= this.thresholds.memoryWarning) {
      issues.push(`High memory usage: ${memory.heapUsed}MB`);
    }

    if (heapPercentage >= this.thresholds.heapCritical) {
      issues.push(`Critical heap usage: ${Math.round(heapPercentage)}%`);
    } else if (heapPercentage >= this.thresholds.heapWarning) {
      issues.push(`High heap usage: ${Math.round(heapPercentage)}%`);
    }

    if (cpu.usage >= this.thresholds.cpuCritical) {
      issues.push(`Critical CPU usage: ${Math.round(cpu.usage)}%`);
    } else if (cpu.usage >= this.thresholds.cpuWarning) {
      issues.push(`High CPU usage: ${Math.round(cpu.usage)}%`);
    }

    if (issues.length === 0) {
      return {
        status: 'healthy',
        details: {
          memory: `${memory.heapUsed}MB/${memory.heapTotal}MB`,
          cpu: `${Math.round(cpu.usage)}%`,
          uptime: `${Math.round(this.metrics.system.processUptime)}s`
        }
      };
    } else if (issues.some(issue => issue.includes('Critical'))) {
      return {
        status: 'unhealthy',
        details: { issues, metrics: this.metrics }
      };
    } else {
      return {
        status: 'degraded',
        details: { issues, metrics: this.metrics }
      };
    }
  }

  // Get resource recommendations
  getResourceRecommendations(): string[] {
    const recommendations = [];
    const { memory, cpu } = this.metrics;
    const heapPercentage = (memory.heapUsed / memory.heapTotal) * 100;

    if (memory.heapUsed >= this.thresholds.memoryWarning) {
      recommendations.push('Consider increasing Node.js max heap size with --max-old-space-size');
      recommendations.push('Review memory-intensive operations and implement caching strategies');
    }

    if (cpu.usage >= this.thresholds.cpuWarning) {
      recommendations.push('Consider reducing concurrent operations');
      recommendations.push('Implement operation queuing and throttling');
    }

    if (heapPercentage >= this.thresholds.heapWarning) {
      recommendations.push('Review object retention and implement cleanup routines');
      recommendations.push('Consider chunking large operations');
    }

    if (this.applicationMetrics.vectorStoreSize > 100000) {
      recommendations.push('Consider implementing vector store cleanup and archiving');
    }

    return recommendations;
  }
}

// Global instance for application-wide use
export const performanceMonitor = new PerformanceMonitorService();