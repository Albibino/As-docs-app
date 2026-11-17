import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationSettingKey } from '../notification/notification.constants';
import { Workspace } from '@tcc-docs/db/types/entity.types';

@Injectable()
export class UserService {
  constructor(private userRepo: UserRepo) {}

  async findById(userId: string, workspaceId: string) {
    return this.userRepo.findById(userId, workspaceId);
  }

  async update(
    updateUserDto: UpdateUserDto,
    userId: string,
    workspace: Workspace,
  ) {
    const user = await this.userRepo.findById(userId, workspace.id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // preference update
    if (typeof updateUserDto.fullPageWidth !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'fullPageWidth',
        updateUserDto.fullPageWidth,
      );
    }

    if (typeof updateUserDto.pageEditMode !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'pageEditMode',
        updateUserDto.pageEditMode.toLowerCase(),
      );
    }

    if (typeof updateUserDto.editorToolbar !== 'undefined') {
      return this.userRepo.updatePreference(
        userId,
        'editorToolbar',
        updateUserDto.editorToolbar,
      );
    }

    const notificationSettings: Record<string, NotificationSettingKey> = {
      notificationPageUpdates: 'page.updated',
      notificationPageUserMention: 'page.userMention',
      notificationCommentUserMention: 'comment.userMention',
      notificationCommentCreated: 'comment.created',
      notificationCommentResolved: 'comment.resolved',
    };

    for (const [dtoField, settingKey] of Object.entries(notificationSettings)) {
      if (typeof updateUserDto[dtoField] !== 'undefined') {
        return this.userRepo.updateNotificationSetting(
          userId,
          settingKey,
          updateUserDto[dtoField],
        );
      }
    }

    if (updateUserDto.locale) {
      user.locale = updateUserDto.locale;
      await this.userRepo.updateUser({ locale: updateUserDto.locale }, userId, workspace.id);
    }

    return user;
  }
}
