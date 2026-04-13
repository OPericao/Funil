import { useI18n } from "../../i18n/I18nProvider";
import { panelClass } from "../ui/styles";
import { AuthCardLayout } from "./AuthCardLayout";

export function AuthSessionLoading() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen">
      <AuthCardLayout>
        <section className={`${panelClass} max-w-[420px] text-center`}>
          <p className="text-ink-700">{t("app.checkingSession")}</p>
        </section>
      </AuthCardLayout>
    </main>
  );
}
