import { Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from './clock.js';

/** Global so every module can inject `Clock`; tests override it with FakeClock. */
@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
