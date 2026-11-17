import { Injectable } from '@nestjs/common';

/**
 * O projeto roda só com o núcleo AGPL-3.0: não há licença empresarial, então
 * toda consulta responde "sem licença". A interface continua porque
 * `WorkspaceService` e `SpaceService` ainda a consultam.
 */
@Injectable()
export class LicenseCheckService {
  hasFeature(_licenseKey: string, _feature: string, _plan?: string): boolean {
    return false;
  }
}
