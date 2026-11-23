import React from "react";
import { useTranslation } from "react-i18next";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className={classes.authShell}>
      <div className={classes.cornerMark} aria-hidden="true" />
      <div className={classes.themeToggle}>
        <ThemeToggle />
      </div>
      <div className={classes.brandPanel}>
        <div className={classes.brandName}>TCC Docs</div>
        <div className={classes.brandTagline}>
          {t("Collaborative documentation with AI.")}
        </div>
      </div>
      <main className={classes.authMain}>{children}</main>
    </div>
  );
}
