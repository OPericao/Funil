import type { FormEvent } from "react";
import type { I18nKey } from "../../../i18n/messages";
import { useI18n } from "../../../i18n/I18nProvider";
import { ProfilePasswordForm } from "../profile/ProfilePasswordForm";
import { ProfileUsernameForm } from "../profile/ProfileUsernameForm";
import { ProfileLogoutButton } from "../profile/ProfileLogoutButton";
import { errorTextClass } from "../../ui/styles";
import { GlassCard } from "../../ui/GlassCard";
import { PencilSquareIcon, XMarkIcon } from "../../ui/icons";
import type { ProfileFormSection } from "./constants";

type ContentInboxProfileSectionProps = {
  username: string;
  submitting: boolean;
  error: string | null;
  activeProfileForm: ProfileFormSection | null;
  usernameDraft: string;
  usernameCurrentPassword: string;
  passwordCurrent: string;
  passwordNext: string;
  usernameValidationError: I18nKey | null;
  passwordValidationError: I18nKey | null;
  onOpenProfileForm: (section: ProfileFormSection) => void;
  onCloseProfileForm: () => void;
  onSubmitUsername: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSubmitPassword: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUsernameDraftChange: (value: string) => void;
  onUsernameCurrentPasswordChange: (value: string) => void;
  onPasswordCurrentChange: (value: string) => void;
  onPasswordNextChange: (value: string) => void;
  onLogout: () => void;
};

export function ContentInboxProfileSection({
  username,
  submitting,
  error,
  activeProfileForm,
  usernameDraft,
  usernameCurrentPassword,
  passwordCurrent,
  passwordNext,
  usernameValidationError,
  passwordValidationError,
  onOpenProfileForm,
  onCloseProfileForm,
  onSubmitUsername,
  onSubmitPassword,
  onUsernameDraftChange,
  onUsernameCurrentPasswordChange,
  onPasswordCurrentChange,
  onPasswordNextChange,
  onLogout
}: ContentInboxProfileSectionProps) {
  const { t } = useI18n();

  return (
    <section className="flex w-full flex-col gap-4">
      <GlassCard className="border-white/90 bg-[linear-gradient(180deg,rgba(255,249,243,0.95)_0%,rgba(238,244,250,0.9)_100%)] p-5 shadow-[0_24px_52px_rgba(15,23,42,0.10)] md:p-6">
        <div className="mb-4">
          <h2 className="heading-title text-center text-ink-900">{t("profile.title")}</h2>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between rounded-[24px] border border-white/85 bg-[linear-gradient(180deg,rgba(252,250,246,0.94)_0%,rgba(239,244,249,0.9)_100%)] p-3 shadow-[0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur-md">
            <div className="grid gap-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t("profile.username")}
              </p>
              <p className="text-base font-bold text-ink-900">{username}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-white/85 bg-[linear-gradient(180deg,rgba(248,251,255,0.94)_0%,rgba(236,243,251,0.88)_100%)] text-brand-700 shadow-[0_10px_22px_rgba(15,23,42,0.05)] transition hover:bg-[#13505B] hover:text-[#F0F0F0]"
              aria-label={t("profile.editUsernameAria")}
              onClick={() => onOpenProfileForm("username")}
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-[24px] border border-white/85 bg-[linear-gradient(180deg,rgba(252,250,246,0.94)_0%,rgba(239,244,249,0.9)_100%)] p-3 shadow-[0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur-md">
            <div className="grid gap-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t("profile.password")}
              </p>
              <p className="text-base font-bold text-ink-900">********</p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-white/85 bg-[linear-gradient(180deg,rgba(248,251,255,0.94)_0%,rgba(236,243,251,0.88)_100%)] text-brand-700 shadow-[0_10px_22px_rgba(15,23,42,0.05)] transition hover:bg-[#13505B] hover:text-[#F0F0F0]"
              aria-label={t("profile.editPasswordAria")}
              onClick={() => onOpenProfileForm("password")}
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </GlassCard>

      {activeProfileForm === "username" ? (
        <GlassCard className="border-white/90 bg-[linear-gradient(180deg,rgba(255,249,243,0.95)_0%,rgba(238,244,250,0.9)_100%)] p-5 shadow-[0_22px_48px_rgba(15,23,42,0.09)] md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="heading-title text-ink-900">{t("profile.changeUsernameTitle")}</h2>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-white/85 bg-[linear-gradient(180deg,rgba(255,247,243,0.92)_0%,rgba(255,238,240,0.86)_100%)] text-rose-700 shadow-[0_10px_18px_rgba(15,23,42,0.05)] transition hover:bg-rose-50"
              aria-label={t("profile.hideChangeUsernameAria")}
              onClick={onCloseProfileForm}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <ProfileUsernameForm
            usernameValue={usernameDraft}
            currentPasswordValue={usernameCurrentPassword}
            submitting={submitting}
            onSubmit={onSubmitUsername}
            onUsernameChange={onUsernameDraftChange}
            onCurrentPasswordChange={onUsernameCurrentPasswordChange}
          />

          {usernameValidationError ? (
            <p className={errorTextClass}>
              {t("common.errorPrefix", { message: t(usernameValidationError) })}
            </p>
          ) : null}
          {error ? (
            <p className={errorTextClass}>{t("common.errorPrefix", { message: error })}</p>
          ) : null}
        </GlassCard>
      ) : null}

      {activeProfileForm === "password" ? (
        <GlassCard className="border-white/90 bg-[linear-gradient(180deg,rgba(255,249,243,0.95)_0%,rgba(238,244,250,0.9)_100%)] p-5 shadow-[0_22px_48px_rgba(15,23,42,0.09)] md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="heading-title text-ink-900">{t("profile.changePasswordTitle")}</h2>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-white/85 bg-[linear-gradient(180deg,rgba(255,247,243,0.92)_0%,rgba(255,238,240,0.86)_100%)] text-rose-700 shadow-[0_10px_18px_rgba(15,23,42,0.05)] transition hover:bg-rose-50"
              aria-label={t("profile.hideChangePasswordAria")}
              onClick={onCloseProfileForm}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <ProfilePasswordForm
            currentPasswordValue={passwordCurrent}
            newPasswordValue={passwordNext}
            submitting={submitting}
            onSubmit={onSubmitPassword}
            onCurrentPasswordChange={onPasswordCurrentChange}
            onNewPasswordChange={onPasswordNextChange}
          />

          {passwordValidationError ? (
            <p className={errorTextClass}>
              {t("common.errorPrefix", { message: t(passwordValidationError) })}
            </p>
          ) : null}
          {error ? (
            <p className={errorTextClass}>{t("common.errorPrefix", { message: error })}</p>
          ) : null}
        </GlassCard>
      ) : null}

      <section className="mt-auto">
        <ProfileLogoutButton onLogout={onLogout} />
      </section>
    </section>
  );
}
