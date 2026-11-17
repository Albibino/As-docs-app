import { Group, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useTranslation } from "react-i18next";

export default function ChangeEmail() {
  const { t } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="md">{t("Email")}</Text>
        <Text size="sm" c="dimmed">
          {currentUser?.user.email}
        </Text>
      </div>
    </Group>
  );
}
