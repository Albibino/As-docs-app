import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  JwtAttachmentPayload,
  JwtCollabPayload,
  JwtExchangePayload,
  JwtPayload,
  JwtPdfExportDownloadPayload,
  JwtPdfRenderPayload,
  JwtType,
} from '../dto/jwt-payload';
import { User } from '@tcc-docs/db/types/entity.types';
import { isUserDisabled } from '../../../common/helpers';

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private environmentService: EnvironmentService,
  ) {}

  async generateAccessToken(user: User, sessionId: string, authSource?: 'oidc'): Promise<string> {
    if (isUserDisabled(user)) {
      throw new ForbiddenException();
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
      type: JwtType.ACCESS,
      sessionId,
      authSource,
    };
    return this.jwtService.sign(payload);
  }

  async generateCollabToken(user: User, workspaceId: string): Promise<string> {
    if (isUserDisabled(user)) {
      throw new ForbiddenException();
    }

    const payload: JwtCollabPayload = {
      sub: user.id,
      workspaceId,
      type: JwtType.COLLAB,
      authSource: this.environmentService.isOidcEnabled() ? 'oidc' : undefined,
    };
    const expiresIn = this.environmentService.isOidcEnabled() ? this.environmentService.getJwtTokenExpiresIn() : '24h';
    return this.jwtService.sign(payload, { expiresIn: expiresIn as import('ms').StringValue });
  }

  async generateExchangeToken(
    userId: string,
    workspaceId: string,
  ): Promise<string> {
    const payload: JwtExchangePayload = {
      sub: userId,
      workspaceId: workspaceId,
      type: JwtType.EXCHANGE,
    };
    return this.jwtService.sign(payload, { expiresIn: '10s' });
  }

  async generateAttachmentToken(opts: {
    attachmentId: string;
    pageId: string;
    workspaceId: string;
  }): Promise<string> {
    const payload: JwtAttachmentPayload = {
      ...opts,
      type: JwtType.ATTACHMENT,
    };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  async generatePdfRenderToken(
    pageId: string,
    workspaceId: string,
  ): Promise<string> {
    const payload: JwtPdfRenderPayload = {
      pageId,
      workspaceId,
      type: JwtType.PDF_RENDER,
    };
    return this.jwtService.sign(payload, { expiresIn: '60s' });
  }

  async generatePdfExportDownloadToken(
    fileTaskId: string,
    workspaceId: string,
  ): Promise<string> {
    const payload: JwtPdfExportDownloadPayload = {
      fileTaskId,
      workspaceId,
      type: JwtType.PDF_EXPORT_DOWNLOAD,
    };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  async verifyJwt(token: string, tokenType: string) {
    const payload = await this.jwtService.verifyAsync(token, {
      secret: this.environmentService.getAppSecret(),
    });

    if (payload.type !== tokenType) {
      throw new UnauthorizedException(
        'Invalid JWT token. Token type does not match.',
      );
    }

    if (
      (tokenType === JwtType.ACCESS || tokenType === JwtType.COLLAB) &&
      this.environmentService.isOidcEnabled() &&
      (payload.authSource !== 'oidc' || (tokenType === JwtType.ACCESS && !payload.sessionId))
    ) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
