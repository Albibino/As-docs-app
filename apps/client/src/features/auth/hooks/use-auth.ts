import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSetAtom } from "jotai";
import { RESET } from "jotai/utils";
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  logout,
  selectTccUser,
} from "@/features/auth/services/auth-service";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import APP_ROUTE, { getPostLoginRedirect } from "@/lib/app-route.ts";

/**
 * TCC: sem login. A pessoa escolhe um dos dois usuários fixos; trocar de
 * usuário é sair e escolher o outro.
 */
export default function useAuth() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);

  const handleSelectUser = async (userKey: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await selectTccUser(userKey);
      setCurrentUser(RESET);
      queryClient.clear();
      window.location.href = getPostLoginRedirect();
    } catch {
      notifications.show({
        message: t("Could not sign in as this user"),
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setCurrentUser(RESET);
      queryClient.clear();
      navigate(APP_ROUTE.AUTH.LOGIN, { replace: true });
    }
  };

  return {
    selectUser: handleSelectUser,
    logout: handleLogout,
    isLoading,
  };
}
