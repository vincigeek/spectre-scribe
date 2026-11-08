"use client";
import { useI18n } from "@/lib/i18n";

export function PageHeader() {
  const { t } = useI18n();
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">Spectre Scribe</h1>
      <p className="text-sm text-neutral-400">{t("app.subtitle")}</p>
    </header>
  );
}
