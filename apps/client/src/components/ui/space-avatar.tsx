import React from "react";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";

interface SpaceAvatarProps {
  name: string;
  logo?: string;
  color?: string;
  size?: string | number;
  radius?: string | number;
  variant?: string;
  style?: any;
  component?: any;
  mt?: string | number;
}

/**
 * The space avatar in every list, picker and sidebar.
 */
export const SpaceAvatar = React.forwardRef<HTMLDivElement, SpaceAvatarProps>(
  ({ name, logo, ...props }: SpaceAvatarProps, ref) => {
    return (
      <CustomAvatar
        ref={ref as any}
        name={name}
        avatarUrl={logo}
        type={AvatarIconType.SPACE_ICON}
        {...props}
      />
    );
  },
);
