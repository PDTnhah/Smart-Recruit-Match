import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

@Injectable()
export class Scoring {
  query = sql`SELECT 1`;
}
