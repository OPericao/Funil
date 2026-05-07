import { FormEventHandler } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import { Button } from "../../ui/Button";
import { inputClass } from "../../ui/styles";

type ProfileEmailFormProps = {
  emailValue: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function ProfileEmailForm({
  emailValue,
  submitting,
  onEmailChange,
  onSubmit
}: ProfileEmailFormProps) {
  const { t } = useI18n();

  return (
    <form className="grid gap-2.5" onSubmit={onSubmit}>
      <input
        type="email"
        maxLength={120}
        value={emailValue}
        disabled={submitting}
        className={inputClass}
        placeholder={t("profile.emailPlaceholder")}
        onChange={(event) => onEmailChange(event.target.value)}
      />
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? t("common.saving") : t("profile.saveEmail")}
      </Button>
    </form>
  );
}
