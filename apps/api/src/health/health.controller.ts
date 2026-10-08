import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  // Liveness only for now; US-1.2 adds the database indicator.
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
