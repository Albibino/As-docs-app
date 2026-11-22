import { Button, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import classes from "@/features/auth/components/auth.module.css";
import { UserSelect } from "@/features/auth/components/user-select";
import { getOidcStatus } from "@/features/auth/services/auth-service";
import { getAppName } from "@/lib/config.ts";

export default function LoginPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const oidcFailed = searchParams.get("oidc") === "failed";
  const oidcStatus = useQuery({
    queryKey: ["oidc-status"],
    queryFn: ({ signal }) => getOidcStatus(signal),
    networkMode: "always",
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
  const checkingStatus =
    oidcStatus.isPending || oidcStatus.fetchStatus !== "idle";
  const statusConfirmed = oidcStatus.isSuccess && !checkingStatus;
  const showUserSelect =
    !oidcFailed && statusConfirmed && oidcStatus.data === false;

  return (
    <>
      <Helmet>
        <title>
          {showUserSelect ? t("Choose a user") : t("Sign in")} - {getAppName()}
        </title>
      </Helmet>
      {showUserSelect ? (
        <UserSelect />
      ) : (
        <AuthLayout>
          <section className={classes.authCard}>
            <div className={classes.eyebrow}>TCC DOCS</div>
            <h1 className={classes.cardTitle}>{t("Sign in")}</h1>
            {oidcFailed && (
              <Text role="alert" c="red" size="sm" mt="sm">
                {t("Could not sign in with Keycloak.")}
              </Text>
            )}
            {checkingStatus ? (
              <Text role="status" className={classes.cardSubtitle}>
                {t("Checking sign-in options…")}
              </Text>
            ) : oidcStatus.isError ? (
              <>
                <Text role="alert" c="red" size="sm" mt="sm">
                  {t("Could not check sign-in options.")}
                </Text>
                <Button
                  type="button"
                  fullWidth
                  mt="md"
                  onClick={() => oidcStatus.refetch()}
                >
                  {t("Try again")}
                </Button>
              </>
            ) : oidcStatus.data === true ? (
              <Button
                component="a"
                href="/api/auth/oidc/login"
                fullWidth
                mt="md"
              >
                {t("Sign in with Keycloak")}
              </Button>
            ) : null}
          </section>
        </AuthLayout>
      )}
    </>
  );
}
