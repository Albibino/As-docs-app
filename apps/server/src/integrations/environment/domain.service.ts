import { Injectable } from '@nestjs/common';
import { EnvironmentService } from './environment.service';

/**
 * TCC: sem modo cloud (subdomínio por workspace). A URL é sempre APP_URL.
 */
@Injectable()
export class DomainService {
  constructor(private environmentService: EnvironmentService) {}

  getUrl(_hostname?: string): string {
    return this.environmentService.getAppUrl();
  }
}
