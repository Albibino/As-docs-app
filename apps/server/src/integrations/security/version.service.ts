import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./../../../package.json');

@Injectable()
export class VersionService {
  async getVersion() {
    return {
      currentVersion: packageJson?.version,
      latestVersion: 0,
      releaseUrl: null,
    };
  }
}
