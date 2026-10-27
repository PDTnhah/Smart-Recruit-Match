import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../common/auth/index.js';
import { DatabaseHealthIndicator } from './database.health.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  // Probed by Docker Compose and nginx without a token.
  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.database.isHealthy('database')]);
  }
}
