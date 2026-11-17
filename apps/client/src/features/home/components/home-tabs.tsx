import { Text, Tabs, Space } from "@mantine/core";
import { IconStar } from "@tabler/icons-react";
import FavoritesPages from "./favorites-pages";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { homeTabAtom } from "@/features/home/atoms/home-tab-atom";

export default function HomeTabs() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useAtom(homeTabAtom);

  return (
    <Tabs
      color="dark"
      value={activeTab}
      onChange={(value) => {
        if (value) setActiveTab(value);
      }}
    >
      <Tabs.List style={{ flexWrap: "nowrap", overflowX: "auto" }}>
        <Tabs.Tab value="favorites" leftSection={<IconStar size={18} />}>
          <Text size="sm" fw={500}>
            {t("Favorites")}
          </Text>
        </Tabs.Tab>
      </Tabs.List>

      <Space my="md" />

      <Tabs.Panel value="favorites">
        <FavoritesPages />
      </Tabs.Panel>
    </Tabs>
  );
}
