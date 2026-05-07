import { useCallback, useEffect, useState, type FormEvent } from "react";
import { validateEmail, validatePassword, validateUsername } from "../../../../features/auth/formValidation";
import { useI18n } from "../../../../i18n/I18nProvider";
import type { I18nKey } from "../../../../i18n/messages";
import type { UpdateEmailInput, UpdatePasswordInput, UpdateUsernameInput } from "../../../../types/auth";
import type { ProfileFormSection } from "../constants";

type UseProfileSectionParams = {
  username: string;
  email: string | null;
  onUpdateUsername: (input: UpdateUsernameInput) => Promise<boolean> | boolean;
  onUpdatePassword: (input: UpdatePasswordInput) => Promise<boolean> | boolean;
  onUpdateEmail: (input: UpdateEmailInput) => Promise<boolean> | boolean;
  onClearError: () => void;
};

export function useProfileSection({
  username,
  email,
  onUpdateUsername,
  onUpdatePassword,
  onUpdateEmail,
  onClearError
}: UseProfileSectionParams) {
  const { t } = useI18n();
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameCurrentPassword, setUsernameCurrentPassword] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [usernameValidationError, setUsernameValidationError] = useState<I18nKey | null>(null);
  const [passwordValidationError, setPasswordValidationError] = useState<I18nKey | null>(null);
  const [emailValidationError, setEmailValidationError] = useState<I18nKey | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [activeProfileForm, setActiveProfileForm] = useState<ProfileFormSection | null>(null);

  useEffect(() => {
    setUsernameDraft("");
  }, [username]);

  useEffect(() => {
    setEmailDraft(email ?? "");
  }, [email]);

  const resetProfileFeedback = useCallback(() => {
    setUsernameValidationError(null);
    setPasswordValidationError(null);
    setEmailValidationError(null);
    setUsernameMessage(null);
    setPasswordMessage(null);
    setEmailMessage(null);
    setActiveProfileForm(null);
    onClearError();
  }, [onClearError]);

  const openProfileForm = useCallback(
    (section: ProfileFormSection) => {
      setActiveProfileForm(section);
      setUsernameValidationError(null);
      setPasswordValidationError(null);
      setEmailValidationError(null);
      setUsernameMessage(null);
      setPasswordMessage(null);
      setEmailMessage(null);
      onClearError();
    },
    [onClearError]
  );

  const closeProfileForm = useCallback(() => {
    setActiveProfileForm(null);
    setUsernameValidationError(null);
    setPasswordValidationError(null);
    setEmailValidationError(null);
    onClearError();
  }, [onClearError]);

  const handleUpdateUsername = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActiveProfileForm("username");
      setUsernameValidationError(null);
      setUsernameMessage(null);
      setPasswordValidationError(null);
      setPasswordMessage(null);
      setEmailValidationError(null);
      setEmailMessage(null);
      onClearError();

      const usernameError = validateUsername(usernameDraft);
      if (usernameError) {
        setUsernameValidationError(usernameError);
        return;
      }

      const currentPasswordError = validatePassword(usernameCurrentPassword);
      if (currentPasswordError) {
        setUsernameValidationError(currentPasswordError);
        return;
      }

      const success = await onUpdateUsername({
        username: usernameDraft.trim().toLowerCase(),
        currentPassword: usernameCurrentPassword
      });

      if (!success) {
        return;
      }

      setUsernameCurrentPassword("");
      setUsernameMessage(t("profile.usernameUpdated"));
      setActiveProfileForm(null);
    },
    [onClearError, onUpdateUsername, t, usernameCurrentPassword, usernameDraft]
  );

  const handleUpdatePassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActiveProfileForm("password");
      setPasswordValidationError(null);
      setPasswordMessage(null);
      setUsernameValidationError(null);
      setUsernameMessage(null);
      setEmailValidationError(null);
      setEmailMessage(null);
      onClearError();

      const currentPasswordError = validatePassword(passwordCurrent);
      if (currentPasswordError) {
        setPasswordValidationError(currentPasswordError);
        return;
      }

      const newPasswordError = validatePassword(passwordNext);
      if (newPasswordError) {
        setPasswordValidationError(newPasswordError);
        return;
      }

      if (passwordCurrent === passwordNext) {
        setPasswordValidationError("validation.password.different");
        return;
      }

      const success = await onUpdatePassword({
        currentPassword: passwordCurrent,
        newPassword: passwordNext
      });

      if (!success) {
        return;
      }

      setPasswordCurrent("");
      setPasswordNext("");
      setPasswordMessage(t("profile.passwordUpdated"));
      setActiveProfileForm(null);
    },
    [onClearError, onUpdatePassword, passwordCurrent, passwordNext, t]
  );

  const handleUpdateEmail = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActiveProfileForm("email");
      setEmailValidationError(null);
      setEmailMessage(null);
      setUsernameValidationError(null);
      setUsernameMessage(null);
      setPasswordValidationError(null);
      setPasswordMessage(null);
      onClearError();

      const emailError = validateEmail(emailDraft);
      if (emailError) {
        setEmailValidationError(emailError);
        return;
      }

      const success = await onUpdateEmail({
        email: emailDraft.trim().toLowerCase()
      });

      if (!success) {
        return;
      }

      setEmailMessage(t("profile.emailUpdated"));
      setActiveProfileForm(null);
    },
    [emailDraft, onClearError, onUpdateEmail, t]
  );

  const handleUsernameDraftChange = useCallback(
    (value: string) => {
      setUsernameDraft(value);
      onClearError();
      setUsernameValidationError(null);
      setUsernameMessage(null);
    },
    [onClearError]
  );

  const handleUsernameCurrentPasswordChange = useCallback(
    (value: string) => {
      setUsernameCurrentPassword(value);
      onClearError();
      setUsernameValidationError(null);
      setUsernameMessage(null);
    },
    [onClearError]
  );

  const handlePasswordCurrentChange = useCallback(
    (value: string) => {
      setPasswordCurrent(value);
      onClearError();
      setPasswordValidationError(null);
      setPasswordMessage(null);
    },
    [onClearError]
  );

  const handlePasswordNextChange = useCallback(
    (value: string) => {
      setPasswordNext(value);
      onClearError();
      setPasswordValidationError(null);
      setPasswordMessage(null);
    },
    [onClearError]
  );

  const handleEmailDraftChange = useCallback(
    (value: string) => {
      setEmailDraft(value);
      onClearError();
      setEmailValidationError(null);
      setEmailMessage(null);
    },
    [onClearError]
  );

  return {
    usernameDraft,
    usernameCurrentPassword,
    passwordCurrent,
    passwordNext,
    emailDraft,
    usernameValidationError,
    passwordValidationError,
    emailValidationError,
    usernameMessage,
    passwordMessage,
    emailMessage,
    activeProfileForm,
    resetProfileFeedback,
    openProfileForm,
    closeProfileForm,
    handleUpdateUsername,
    handleUpdatePassword,
    handleUpdateEmail,
    handleUsernameDraftChange,
    handleUsernameCurrentPasswordChange,
    handlePasswordCurrentChange,
    handlePasswordNextChange,
    handleEmailDraftChange
  };
}
