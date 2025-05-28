import { VectorStore } from './vector-store';
import { ConfigLoader } from '../utils/config-loader';
import { PerformanceMonitorService } from './performance-monitor';
import logger from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
  lastChecked: string;
  metadata?: Record<string, any>;
}

export class HealthCheckService {
  private vectorStore?: VectorStore;
  private configLoader: ConfigLoader;
  private performanceMonitor?: PerformanceMonitorService;
  private startTime: number;
  private lastHealthCheck: HealthStatus | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(vectorStore?: VectorStore, configLoader?: ConfigLoader, performanceMonitor?: PerformanceMonitorService) {
    this.vectorStore = vectorStore;
    this.configLoader = configLoader || new ConfigLoader();
    this.performanceMonitor = performanceMonitor;
    this.startTime = Date.now();
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const checks: { [key: string]: HealthCheck } = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Basic system checks
    checks.system = await this.checkSystem();
    checks.config = await this.checkConfiguration();
    checks.storage = await this.checkStorage();

    // Vector store check (if available)
    if (this.vectorStore) {
      checks.vectorStore = await this.checkVectorStore();
    }

    // Performance monitoring check (if available)
    if (this.performanceMonitor) {
      checks.performance = await this.checkPerformance();
    }

    // Determine overall status
    const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(checks).filter(check => check.status === 'warn');

    if (failedChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (warnChecks.length > 0) {
      overallStatus = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: this.getVersion(),
      checks
    };

    this.lastHealthCheck = healthStatus;
    return healthStatus;
  }

  async checkSystem(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check memory usage
      const memUsage = process.memoryUsage();
      const memUsedMB = memUsage.heapUsed / 1024 / 1024;
      const memTotalMB = memUsage.heapTotal / 1024 / 1024;
      
      // Check CPU load (simplified)
      const cpuUsage = process.cpuUsage();
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'System resources are healthy';
      
      if (memUsedMB > 1024) { // Over 1GB
        status = 'warn';
        message = 'High memory usage detected';
      }
      
      if (memUsedMB > 2048) { // Over 2GB
        status = 'fail';
        message = 'Critical memory usage detected';
      }

      return {
        status,
        message,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          memory: {
            used: Math.round(memUsedMB),
            total: Math.round(memTotalMB),
            unit: 'MB'
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
          },
          node: {
            version: process.version,
            platform: process.platform,
            arch: process.arch
          }
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `System check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async checkConfiguration(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const config = await this.configLoader.loadConfig();
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Configuration is valid';
      
      // Check if repositories are configured
      if (!config.repositories || config.repositories.length === 0) {
        status = 'warn';
        message = 'No repositories configured';
      }
      
      // Check vector store configuration
      if (!config.vectorStore) {
        status = 'fail';
        message = 'Vector store configuration missing';
      }

      return {
        status,
        message,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          repositoriesCount: config.repositories?.length || 0,
          projectName: config.project?.name,
          vectorStoreType: config.vectorStore?.type
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Configuration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async checkStorage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if data directory exists and is writable
      const dataDir = path.join(process.cwd(), 'data');
      const logsDir = path.join(process.cwd(), 'logs');
      
      await fs.access(dataDir, fs.constants.F_OK);
      await fs.access(dataDir, fs.constants.W_OK);
      
      // Try to create logs directory if it doesn't exist
      try {
        await fs.mkdir(logsDir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
      
      // Check disk space (simplified check)
      // const stats = await fs.stat(dataDir);
      
      return {
        status: 'pass',
        message: 'Storage is accessible',
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          dataDirectory: dataDir,
          logsDirectory: logsDir,
          accessible: true
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Storage check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async checkVectorStore(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    if (!this.vectorStore) {
      return {
        status: 'fail',
        message: 'Vector store not initialized',
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }

    try {
      // Try to get stats from vector store
      const stats = await this.vectorStore.getStats();
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Vector store is healthy';
      
      if (stats.totalChunks === 0) {
        status = 'warn';
        message = 'No documents indexed in vector store';
      }

      return {
        status,
        message,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          totalDocuments: stats.totalDocuments,
          totalChunks: stats.totalChunks,
          collectionSize: stats.collectionSize
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Vector store check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  async checkRepositorySync(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const config = await this.configLoader.loadConfig();
      const reposDir = path.join(process.cwd(), 'data', 'repositories');
      
      if (!config.repositories || config.repositories.length === 0) {
        return {
          status: 'warn',
          message: 'No repositories configured',
          duration: Date.now() - startTime,
          lastChecked: new Date().toISOString()
        };
      }

      let syncedRepos = 0;
      let failedRepos = 0;

      for (const repo of config.repositories) {
        const repoPath = path.join(reposDir, repo.name);
        try {
          await fs.access(repoPath, fs.constants.F_OK);
          syncedRepos++;
        } catch {
          failedRepos++;
        }
      }

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = `${syncedRepos}/${config.repositories.length} repositories synced`;

      if (failedRepos > 0) {
        if (syncedRepos === 0) {
          status = 'fail';
          message = 'No repositories synced';
        } else {
          status = 'warn';
          message = `${failedRepos} repositories not synced`;
        }
      }

      return {
        status,
        message,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          totalRepositories: config.repositories.length,
          syncedRepositories: syncedRepos,
          failedRepositories: failedRepos
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Repository sync check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  private async checkPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    if (!this.performanceMonitor) {
      return {
        status: 'warn',
        message: 'Performance monitor not available',
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }

    try {
      const metrics = this.performanceMonitor.getCurrentMetrics();
      const memoryUsagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
      const isThrottled = this.performanceMonitor.shouldThrottle();
      const throttlingLevel = this.performanceMonitor.getThrottlingLevel();

      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Performance metrics within normal range';

      // Check for critical conditions
      if (metrics.cpu.usage >= 90 || memoryUsagePercent >= 95) {
        status = 'fail';
        message = 'Critical resource usage detected';
      } else if (metrics.cpu.usage >= 70 || memoryUsagePercent >= 80 || isThrottled) {
        status = 'warn';
        message = isThrottled 
          ? `Operations throttled due to ${throttlingLevel} resource usage`
          : 'High resource usage detected';
      }

      return {
        status,
        message,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString(),
        metadata: {
          memory: {
            heapUsed: `${Math.round(metrics.memory.heapUsed)}MB`,
            heapTotal: `${Math.round(metrics.memory.heapTotal)}MB`,
            heapPercentage: `${Math.round(memoryUsagePercent)}%`,
            external: `${Math.round(metrics.memory.external)}MB`
          },
          cpu: {
            usage: `${Math.round(metrics.cpu.usage)}%`,
            loadAverage: metrics.cpu.loadAverage.map(avg => Math.round(avg * 100) / 100)
          },
          system: {
            uptime: `${Math.round(metrics.system.processUptime)}s`,
            platform: metrics.system.platform,
            nodeVersion: metrics.system.nodeVersion
          },
          throttling: {
            enabled: isThrottled,
            level: throttlingLevel
          },
          operations: {
            documentsIndexed: metrics.application.documentsIndexed,
            chunksProcessed: metrics.application.chunksProcessed,
            searchRequests: metrics.application.searchRequests,
            vectorStoreSize: metrics.application.vectorStoreSize
          }
        }
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: Date.now() - startTime,
        lastChecked: new Date().toISOString()
      };
    }
  }

  getReadinessStatus(): { ready: boolean; message: string } {
    if (!this.lastHealthCheck) {
      return { ready: false, message: 'Health check not yet performed' };
    }

    const criticalChecks = ['config', 'storage'];
    const failedCritical = criticalChecks.some(
      check => this.lastHealthCheck!.checks[check]?.status === 'fail'
    );

    if (failedCritical) {
      return { ready: false, message: 'Critical health checks failed' };
    }

    return { ready: true, message: 'Service is ready' };
  }

  getLivenessStatus(): { alive: boolean; message: string } {
    const timeSinceLastCheck = this.lastHealthCheck 
      ? Date.now() - new Date(this.lastHealthCheck.timestamp).getTime()
      : Infinity;

    // If no health check in the last 5 minutes, consider it not alive
    if (timeSinceLastCheck > 300000) {
      return { alive: false, message: 'Health check is stale' };
    }

    return { alive: true, message: 'Service is alive' };
  }

  startPeriodicChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      try {
        await this.getHealthStatus();
        logger.debug('Periodic health check completed');
      } catch (error) {
        logger.error('Periodic health check failed', { error });
      }
    }, intervalMs);

    logger.info('Started periodic health checks', { intervalMs });
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped periodic health checks');
    }
  }

  private getVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const packageJson = require('../../package.json');
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }
}