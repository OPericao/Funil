import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import type { UpdatePasswordInput, UpdateUsernameInput } from "../../types/auth";
import { GlassCard } from "../ui/GlassCard";
import { SuccessToast } from "../ui/SuccessToast";
import { InboxEntryCreateForm } from "./InboxEntryCreateForm";
import { ExploreAssistantSection } from "./explore/ExploreAssistantSection";
import { RelationshipGraph } from "./relationship/RelationshipGraph";
import { StorageEntriesSection } from "./storage/StorageEntriesSection";
import { ContentInboxHeader } from "./content-inbox/ContentInboxHeader";
import { ContentInboxMobileFooter } from "./content-inbox/ContentInboxMobileFooter";
import { ContentInboxProfileSection } from "./content-inbox/ContentInboxProfileSection";
import {
  CONTENT_INBOX_BACKGROUND_URL,
  SECTION_PATH_MAP,
  SECTION_TITLE_KEY_MAP,
  sectionFromPath,
  type InboxSection
} from "./content-inbox/constants";
import { useInboxEntryCreation } from "./content-inbox/hooks/useInboxEntryCreation";
import { useInboxHeaderMenus } from "./content-inbox/hooks/useInboxHeaderMenus";
import { useProfileSection } from "./content-inbox/hooks/useProfileSection";
import { useStorageEntries } from "./content-inbox/hooks/useStorageEntries";

type ContentInboxProps = {
  username: string;
  submitting: boolean;
  error: string | null;
  onUpdateUsername: (input: UpdateUsernameInput) => Promise<boolean> | boolean;
  onUpdatePassword: (input: UpdatePasswordInput) => Promise<boolean> | boolean;
  onClearError: () => void;
  onLogout: () => void;
};

export function ContentInbox({
  username,
  submitting,
  error,
  onUpdateUsername,
  onUpdatePassword,
  onClearError,
  onLogout
}: ContentInboxProps) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const locationEntryToOpenId =
    typeof (location.state as { entryToOpenId?: unknown } | null)?.entryToOpenId === "number"
      ? ((location.state as { entryToOpenId?: number }).entryToOpenId ?? null)
      : null;
  const [activeSection, setActiveSection] = useState<InboxSection>(sectionFromPath(location.pathname));
  const [toastVisible, setToastVisible] = useState(false);

  const inboxEntry = useInboxEntryCreation({ onUnauthorized: onLogout });
  const profile = useProfileSection({
    username,
    onUpdateUsername,
    onUpdatePassword,
    onClearError
  });
  const headerMenus = useInboxHeaderMenus();
  const storage = useStorageEntries({
    activeSection,
    notificationsOpen: headerMenus.notificationsOpen,
    onUnauthorized: onLogout
  });

  const successToastMessage =
    profile.usernameMessage ?? profile.passwordMessage ?? inboxEntry.inboxMessage;

  useEffect(() => {
    setActiveSection(sectionFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (locationEntryToOpenId === null) {
      return;
    }
    if (sectionFromPath(location.pathname) !== "storage") {
      return;
    }

    storage.openEntryFromNotifications(locationEntryToOpenId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, locationEntryToOpenId, navigate, storage]);

  useEffect(() => {
    if (!successToastMessage) {
      setToastVisible(false);
      return;
    }

    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2600);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [successToastMessage]);

  function changeSection(nextSection: InboxSection) {
    profile.resetProfileFeedback();
    inboxEntry.clearInboxFeedback();
    headerMenus.closeMenus();
    setActiveSection(nextSection);

    const nextPath = SECTION_PATH_MAP[nextSection];
    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  }

  function handleNotificationSelect(entryId: number) {
    storage.openEntryFromNotifications(entryId);
    changeSection("storage");
  }

  return (
    <section
      className="h-screen w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${CONTENT_INBOX_BACKGROUND_URL})` }}
    >
      <section className="relative h-full w-full overflow-hidden bg-transparent">
        <ContentInboxHeader
          activeSection={activeSection}
          onSectionChange={changeSection}
          headerMenusRef={headerMenus.headerMenusRef}
          notificationsOpen={headerMenus.notificationsOpen}
          settingsOpen={headerMenus.settingsOpen}
          onToggleNotifications={headerMenus.toggleNotifications}
          onToggleSettings={headerMenus.toggleSettings}
          onCloseMenus={headerMenus.closeMenus}
          notificationEntries={storage.notificationEntries}
          storageLoading={storage.storageLoading}
          notificationDateFormatter={storage.notificationDateFormatter}
          onNotificationSelect={handleNotificationSelect}
        />

        <main
          className={`scrollbar-brand absolute inset-x-0 bottom-0 top-16 z-10 overflow-y-auto ${
            activeSection === "storage" ? "" : "px-4 py-4 sm:px-6"
          }`}
        >
          <div
            className={`mx-auto w-full max-w-[940px] ${
              activeSection === "storage" ? "h-full" : "origin-top scale-[1.08] py-2"
            }`}
          >
            {activeSection === "profile" ? (
              <ContentInboxProfileSection
                username={username}
                submitting={submitting}
                error={error}
                activeProfileForm={profile.activeProfileForm}
                usernameDraft={profile.usernameDraft}
                usernameCurrentPassword={profile.usernameCurrentPassword}
                passwordCurrent={profile.passwordCurrent}
                passwordNext={profile.passwordNext}
                usernameValidationError={profile.usernameValidationError}
                passwordValidationError={profile.passwordValidationError}
                onOpenProfileForm={profile.openProfileForm}
                onCloseProfileForm={profile.closeProfileForm}
                onSubmitUsername={profile.handleUpdateUsername}
                onSubmitPassword={profile.handleUpdatePassword}
                onUsernameDraftChange={profile.handleUsernameDraftChange}
                onUsernameCurrentPasswordChange={profile.handleUsernameCurrentPasswordChange}
                onPasswordCurrentChange={profile.handlePasswordCurrentChange}
                onPasswordNextChange={profile.handlePasswordNextChange}
                onLogout={onLogout}
              />
            ) : activeSection === "inbox" ? (
              <InboxEntryCreateForm
                values={inboxEntry.inboxEntryForm}
                submitting={inboxEntry.inboxSubmitting}
                error={inboxEntry.inboxError}
                heading={t("section.inbox")}
                onSubmit={inboxEntry.handleCreateInboxEntry}
                onChange={inboxEntry.patchInboxEntryForm}
              />
            ) : activeSection === "storage" ? (
              <StorageEntriesSection
                entries={storage.storageEntries}
                loading={storage.storageLoading}
                error={storage.storageError}
                searchValue={storage.storageSearchValue}
                searchResults={storage.storageSearchResults}
                searchLoading={storage.storageSearchLoading}
                searchError={storage.storageSearchError}
                onSearchChange={storage.setStorageSearchValue}
                onEntriesUpdated={storage.loadStorageEntries}
                onUnauthorized={onLogout}
                entryToOpenId={storage.entryToOpenFromNotifications}
                onEntryToOpenHandled={storage.handleEntryToOpenHandled}
              />
            ) : activeSection === "relationshipGraph" ? (
              <RelationshipGraph />
            ) : (
              <ExploreAssistantSection onUnauthorized={onLogout} />
            )}
          </div>
        </main>

        <SuccessToast message={successToastMessage} visible={toastVisible} />
      </section>

      <ContentInboxMobileFooter activeSection={activeSection} onSectionChange={changeSection} />
    </section>
  );
}
