import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import useAuth from "@/features/auth/hooks/use-auth";
import { AuthLayout } from "./auth-layout.tsx";
import authClasses from "./auth.module.css";
import classes from "./access-denied.module.css";

type AccessDeniedProps = {
  status?: number;
};

/** Sessão válida recusada pelo workspace: só resta voltar à escolha de usuário. */
export function AccessDenied({ status = 403 }: AccessDeniedProps) {
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <>
      <Helmet>
        <title>{t("Access denied")}</title>
      </Helmet>
      <AuthLayout>
        <section className={authClasses.authCard}>
          <div className={classes.rail} aria-hidden="true" />
          <div className={authClasses.eyebrow}>{t("Access denied")}</div>
          <h1 className={authClasses.cardTitle}>
            {t("This account cannot open the workspace")}
          </h1>
          <p className={authClasses.cardSubtitle}>HTTP {status}</p>
          <button
            type="button"
            className={authClasses.primaryButton}
            onClick={() => logout()}
          >
            {t("Choose another user")}
          </button>
        </section>
      </AuthLayout>
    </>
  );
}
