import { Alert, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function TrashBanner() {
  const { t } = useTranslation();

  return (
    <Alert icon={<IconInfoCircle size={16} />} variant="light" color="red">
      <Text size="sm" lh={1.35}>
        {t("Trash retention notice", {
          count: 30,
        })}
      </Text>
    </Alert>
  );
}
