import { Router, Request, Response } from 'express';
import { getMetricsCollector } from '../services/metrics';

export default function createMetricsRoutes(): Router {
  const router = Router();
  const metrics = getMetricsCollector();

  // Get metrics summary
  router.get('/summary', (req: Request, res: Response) => {
    const summary = metrics.getSummary();
    res.json(summary);
  });

  // Prometheus format endpoint
  router.get('/prometheus', (req: Request, res: Response) => {
    const prometheusData = metrics.exportPrometheus();
    res.type('text/plain').send(prometheusData);
  });

  // Get specific metric
  router.get('/metric/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    const labels = req.query as Record<string, string>;

    const counterValue = metrics.getCounter(name, labels);
    const gaugeValue = metrics.getGauge(name, labels);
    const histogramStats = metrics.getHistogramStats(name, labels);

    res.json({
      name,
      labels,
      counter: counterValue,
      gauge: gaugeValue,
      histogram: histogramStats
    });
  });

  // Reset metrics
  router.post('/reset', (req: Request, res: Response) => {
    metrics.reset();
    res.json({ message: 'Metrics reset successfully' });
  });

  // Health check with metrics
  router.get('/health', (req: Request, res: Response) => {
    const summary = metrics.getSummary();
    const healthStatus = {
      status: 'healthy',
      uptime: summary.system.uptime,
      memory: {
        used: summary.system.memoryUsage.heapUsed,
        total: summary.system.memoryUsage.heapTotal,
        percentage: (summary.system.memoryUsage.heapUsed / summary.system.memoryUsage.heapTotal) * 100
      },
      repositories: {
        total: summary.repositories.total,
        synced: summary.repositories.synced,
        errors: summary.repositories.syncErrors
      },
      requests: {
        total: summary.requests.total,
        averageResponseTime: summary.requests.averageResponseTime
      }
    };

    // Determine health based on metrics
    if (summary.system.memoryUsage.heapUsed / summary.system.memoryUsage.heapTotal > 0.9) {
      healthStatus.status = 'warning';
    }

    if (summary.repositories.syncErrors > 10) {
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'warning' ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  });

  return router;
}

