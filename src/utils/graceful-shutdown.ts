import logger from './logger';

export interface ShutdownTask {
  name: string;
  handler: () => Promise<void>;
  timeout: number;
}

export class GracefulShutdown {
  private tasks: ShutdownTask[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default
  private listeners: (() => void)[] = [];

  constructor(timeout?: number) {
    if (timeout) {
      this.shutdownTimeout = timeout;
    }
  }

  addTask(task: ShutdownTask): void {
    if (this.isShuttingDown) {
      logger.warn('Cannot add shutdown task while shutdown is in progress', { taskName: task.name });
      return;
    }
    
    this.tasks.push(task);
    logger.debug('Added shutdown task', { taskName: task.name, timeout: task.timeout });
  }

  removeTask(name: string): boolean {
    const initialLength = this.tasks.length;
    this.tasks = this.tasks.filter(task => task.name !== name);
    const removed = this.tasks.length < initialLength;
    
    if (removed) {
      logger.debug('Removed shutdown task', { taskName: name });
    }
    
    return removed;
  }

  onShutdown(listener: () => void): void {
    this.listeners.push(listener);
  }

  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    logger.info('Graceful shutdown initiated', { 
      signal,
      tasksCount: this.tasks.length,
      timeout: this.shutdownTimeout
    });

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        logger.error('Error in shutdown listener', { error });
      }
    });

    // Set overall timeout
    const overallTimeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit', {
        timeout: this.shutdownTimeout,
        tasksRemaining: this.tasks.length
      });
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Execute shutdown tasks in parallel with individual timeouts
      const taskPromises = this.tasks.map(task => 
        this.executeTaskWithTimeout(task)
      );

      await Promise.allSettled(taskPromises);

      clearTimeout(overallTimeout);

      const duration = Date.now() - startTime;
      logger.info('Graceful shutdown completed', { 
        duration,
        tasksCount: this.tasks.length
      });

    } catch (error) {
      clearTimeout(overallTimeout);
      logger.error('Error during graceful shutdown', { error });
      throw error;
    }
  }

  private async executeTaskWithTimeout(task: ShutdownTask): Promise<void> {
    const taskStartTime = Date.now();
    
    try {
      logger.debug('Executing shutdown task', { taskName: task.name });

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task '${task.name}' timed out after ${task.timeout}ms`));
        }, task.timeout);
      });

      // Race the task against its timeout
      await Promise.race([
        task.handler(),
        timeoutPromise
      ]);

      const duration = Date.now() - taskStartTime;
      logger.info('Shutdown task completed', { 
        taskName: task.name,
        duration
      });

    } catch (error) {
      const duration = Date.now() - taskStartTime;
      logger.error('Shutdown task failed', { 
        taskName: task.name,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Don't throw - we want to attempt other shutdown tasks
    }
  }

  setupSignalHandlers(): void {
    // Handle common termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        
        try {
          await this.shutdown(signal);
          process.exit(0);
        } catch (error) {
          logger.error('Graceful shutdown failed', { error });
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception, initiating emergency shutdown', { error });
      
      // Try graceful shutdown with reduced timeout
      this.shutdownTimeout = 5000; // 5 seconds for emergency
      this.shutdown('uncaughtException')
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection, initiating emergency shutdown', { 
        reason,
        promise: promise.toString()
      });
      
      // Try graceful shutdown with reduced timeout
      this.shutdownTimeout = 5000; // 5 seconds for emergency
      this.shutdown('unhandledRejection')
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    logger.info('Signal handlers registered for graceful shutdown');
  }

  isInShutdown(): boolean {
    return this.isShuttingDown;
  }
}

// Global instance for easy access
export const gracefulShutdown = new GracefulShutdown();

// Utility function to create common shutdown tasks
export const createShutdownTasks = {
  server: (server: any, name = 'HTTP Server'): ShutdownTask => ({
    name,
    timeout: 10000,
    handler: async () => {
      if (server && typeof server.close === 'function') {
        await new Promise<void>((resolve, reject) => {
          server.close((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }
  }),

  database: (connection: any, name = 'Database'): ShutdownTask => ({
    name,
    timeout: 15000,
    handler: async () => {
      if (connection && typeof connection.close === 'function') {
        await connection.close();
      } else if (connection && typeof connection.end === 'function') {
        await connection.end();
      }
    }
  }),

  cleanup: (cleanupFn: () => Promise<void>, name = 'Cleanup'): ShutdownTask => ({
    name,
    timeout: 5000,
    handler: cleanupFn
  }),

  waitForTasks: (checkFn: () => boolean, name = 'Wait for Tasks'): ShutdownTask => ({
    name,
    timeout: 10000,
    handler: async () => {
      const startTime = Date.now();
      const maxWait = 10000; // 10 seconds max
      
      while (checkFn() && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (checkFn()) {
        logger.warn(`${name}: Still has pending tasks after timeout`);
      }
    }
  })
};