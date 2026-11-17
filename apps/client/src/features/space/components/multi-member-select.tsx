import React, { useEffect, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { Group, MultiSelect, MultiSelectProps, Text } from "@mantine/core";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IUser } from "@/features/user/types/user.types.ts";
import { useTranslation } from "react-i18next";
import { useSpaceAssignableUsersQuery } from "@/features/space/queries/space-query.ts";

interface MultiMemberSelectProps {
  spaceId: string;
  value?: string[];
  onChange: (value: string[]) => void;
}

const renderMultiSelectOption: MultiSelectProps["renderOption"] = ({
  option,
}) => (
  <Group gap="sm" wrap="nowrap">
    {option["type"] === "user" && (
      <CustomAvatar
        avatarUrl={option["avatarUrl"]}
        size={20}
        name={option.label}
      />
    )}
    <div>
      <Text size="sm" lineClamp={1}>{option.label}</Text>
      {option["type"] === "user" && option["email"] && (
        <Text size="xs" c="dimmed" lineClamp={1}>{option["email"]}</Text>
      )}
    </div>
  </Group>
);

export function MultiMemberSelect({
  spaceId,
  value,
  onChange,
}: MultiMemberSelectProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const [debouncedQuery] = useDebouncedValue(searchValue, 500);
  const { data: users, isLoading } = useSpaceAssignableUsersQuery(
    spaceId,
    debouncedQuery,
  );
  const [data, setData] = useState([]);

  useEffect(() => {
    if (users) {
      const userItems = users.items.map((user: IUser) => ({
        value: `user-${user.id}`,
        label: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        type: "user",
      }));

      const newData = [];
      
      if (userItems && userItems.length > 0) {
        newData.push({
          group: t("Select a user"),
          items: userItems,
        });
      }
      
      setData(newData);
    }
  }, [users, t]);

  return (
    <MultiSelect
      data={data}
      value={value}
      renderOption={renderMultiSelectOption}
      hidePickedOptions
      maxDropdownHeight={300}
      label={t("Add members")}
      placeholder={t("Search for users")}
      searchable
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      filter={({ options }) => options}
      clearable
      variant="filled"
      loading={isLoading}
      onChange={onChange}
      maxValues={50}
    />
  );
}
