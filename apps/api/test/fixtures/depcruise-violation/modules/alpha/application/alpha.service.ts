import { BetaService } from '../../beta/application/beta.service';

export class AlphaService {
  constructor(private readonly beta: BetaService) {}
}
