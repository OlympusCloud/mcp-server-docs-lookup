import { Request, Response, NextFunction } from 'express';
import { getMetricsCollector } from '../services/metrics';

export function metricsMiddleware() {
  const metrics = getMetricsCollector();

  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const endpoint = `${req.method} ${req.route?.path || req.path}`;

    // Track request
    metrics.incrementCounter('http.requests', 1, {
      method: req.method,
      endpoint: endpoint
    });

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function(...args: any[]): any {
      // Record response metrics
      metrics.incrementCounter('http.requests', 1, {
        method: req.method,
        endpoint: endpoint,
        status: res.statusCode.toString()
      });

      metrics.recordTiming('http.response.time', startTime, {
        method: req.method,
        endpoint: endpoint,
        status: res.statusCode.toString()
      });

      // Track response size if available
      const contentLength = res.get('content-length');
      if (contentLength) {
        metrics.recordHistogram('http.response.size', parseInt(contentLength), {
          method: req.method,
          endpoint: endpoint
        });
      }

      // Call original end
      return (originalEnd as any).call(res, ...args);
    } as any;

    next();
  };
}