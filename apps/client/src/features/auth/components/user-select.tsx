import { useQuery } from "@tanstack/react-query";
import { Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import useAuth from "@/features/auth/hooks/use-auth";
import { listTccUsers } from "@/features/auth/services/auth-service";
import { AuthLayout } from "./auth-layout.tsx";
import classes from "./auth.module.css";

/**
 * Tela inicial do TCC: escolher entre "Usuário 1" e "Usuário 2".
 * Não há senha, cadastro nem convite (ver docs/tcc).
 */
export function UserSelect() {
  const { t } = useTranslation();
  const { selectUser, isLoading } = useAuth();
  const { data: users, isLoading: isLoadingUsers, isError } = useQuery({
    queryKey: ["tcc-users"],
    queryFn: listTccUsers,
    retry: false,
  });

  return (
    <AuthLayout>
      <section className={classes.authCard}>
        <div className={classes.eyebrow}>TCC DOCS</div>
        <h1 className={classes.cardTitle}>{t("Choose a user")}</h1>
        <Text className={classes.cardSubtitle}>
          {t("Open two windows, one for each user, to edit together.")}
        </Text>
        {isLoadingUsers && <Loader size="sm" />}
        {isError && (
          <Text c="red" size="sm">
            {t("Could not load users")}
          </Text>
        )}
        <Stack gap="sm" mt="md">
          {users?.map((user) => (
            <button
              key={user.key}
              type="button"
              className={classes.primaryButton}
              disabled={isLoading}
              onClick={() => selectUser(user.key)}
              data-testid={`select-${user.key}`}
            >
              {user.name}
            </button>
          ))}
        </Stack>
      </section>
    </AuthLayout>
  );
}
