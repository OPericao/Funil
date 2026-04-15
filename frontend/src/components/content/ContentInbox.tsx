import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n/I18nProvider";
import type { UpdatePasswordInput, UpdateUsernameInput } from "../../types/auth";
import { SuccessToast } from "../ui/SuccessToast";
import { InboxEntryCreateForm } from "./InboxEntryCreateForm";
import { ExploreAssistantSection } from "./explore/ExploreAssistantSection";
import { RelationshipGraph } from "./relationship/RelationshipGraph";
import { StorageEntriesSection } from "./storage/StorageEntriesSection";
import { ContentInboxHeader } from "./content-inbox/ContentInboxHeader";
import { ContentInboxMobileFooter } from "./content-inbox/ContentInboxMobileFooter";
import { ContentInboxProfileSection } from "./content-inbox/ContentInboxProfileSection";
import {
  SECTION_PATH_MAP,
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

type SectionTransition = {
  from: InboxSection;
  to: InboxSection;
  id: number;
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
  const [renderSection, setRenderSection] = useState<InboxSection>(sectionFromPath(location.pathname));
  const [sectionTransition, setSectionTransition] = useState<SectionTransition | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const previousSectionRef = useRef<InboxSection>(sectionFromPath(location.pathname));

  const firstRenderRef = useRef(true);
  const transitionIdRef = useRef(0);

  const inboxEntry = useInboxEntryCreation({ onUnauthorized: onLogout });
  const profile = useProfileSection({
    username,
    onUpdateUsername,
    onUpdatePassword,
    onClearError
  });
  const headerMenus = useInboxHeaderMenus();
  const storage = useStorageEntries({
    activeSection: renderSection,
    notificationsOpen: headerMenus.notificationsOpen,
    onUnauthorized: onLogout
  });

  const successToastMessage =
    profile.usernameMessage ?? profile.passwordMessage ?? inboxEntry.inboxMessage;

  useEffect(() => {
    const nextSection = sectionFromPath(location.pathname);
    setActiveSection(nextSection);

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      setRenderSection(nextSection);
      setSectionTransition(null);
      return;
    }

    if (nextSection === renderSection) {
      return;
    }

    const previousSection = renderSection;
    previousSectionRef.current = previousSection;
    const nextId = transitionIdRef.current + 1;
    transitionIdRef.current = nextId;

    setSectionTransition({
      from: previousSection,
      to: nextSection,
      id: nextId
    });

    setRenderSection(nextSection);
  }, [location.pathname, renderSection]);

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
    if (sectionTransition) {
      return;
    }

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

  function handleIncomingPanelAnimationEnd(transitionId: number) {
    setSectionTransition((current) => {
      if (!current || current.id !== transitionId) {
        return current;
      }
      return null;
    });
  }

  function renderSectionContent(section: InboxSection) {
    if (section === "profile") {
      return (
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
      );
    }

    if (section === "inbox") {
      return (
        <InboxEntryCreateForm
          values={inboxEntry.inboxEntryForm}
          submitting={inboxEntry.inboxSubmitting}
          error={inboxEntry.inboxError}
          heading={t("section.inbox")}
          onSubmit={inboxEntry.handleCreateInboxEntry}
          onChange={inboxEntry.patchInboxEntryForm}
        />
      );
    }

    if (section === "storage") {
      return (
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
      );
    }

    return <ExploreAssistantSection onUnauthorized={onLogout} />;
  }

  function renderSectionPanel(section: InboxSection) {
    if (section === "storage") {
      return (
        <div className="h-full">
          <div className="mx-auto h-full w-full max-w-[940px]">
            {renderSectionContent(section)}
          </div>
        </div>
      );
    }

    return (
      <div className="scrollbar-brand h-full overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-[940px] origin-top scale-[1.08] py-2">
          {renderSectionContent(section)}
        </div>
      </div>
    );
  }

  return (
    <section className="h-screen w-full overflow-hidden bg-transparent">
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

        <main className="absolute inset-x-0 bottom-0 top-16 z-10 overflow-hidden bg-[#dbeaf8]/70">
          <div className="relative h-full w-full overflow-hidden">
            <div
              className={`absolute inset-0 ${
                sectionTransition
                  ? sectionTransition.to === "relationshipGraph"
                    ? "z-20 tab-rise-in pointer-events-auto"
                    : sectionTransition.from === "relationshipGraph"
                      ? "z-10 tab-drop-out pointer-events-none"
                      : "z-0 pointer-events-none opacity-0"
                  : renderSection === "relationshipGraph"
                    ? "z-10 pointer-events-auto opacity-100"
                    : "z-0 pointer-events-none opacity-0"
              }`}
              onAnimationEnd={(event) => {
                if (event.currentTarget !== event.target || !sectionTransition || sectionTransition.to !== "relationshipGraph") {
                  return;
                }
                handleIncomingPanelAnimationEnd(sectionTransition.id);
              }}
            >
              <div className="scrollbar-brand h-full overflow-y-auto px-4 py-4 sm:px-6">
                <div className="mx-auto w-full max-w-[940px] origin-top scale-[1.08] py-2">
                  <RelationshipGraph />
                </div>
              </div>
            </div>

            <div
              className={`absolute inset-0 ${
                sectionTransition
                  ? sectionTransition.to === "relationshipGraph" || sectionTransition.from === "relationshipGraph"
                    ? "z-0 pointer-events-none opacity-0"
                    : "z-10 pointer-events-auto opacity-100"
                  : renderSection === "relationshipGraph"
                    ? "z-0 pointer-events-none opacity-0"
                    : "z-10 pointer-events-auto opacity-100"
              }`}
            >
              {sectionTransition ? (
                <>
                  <div className="absolute inset-0 z-10 pointer-events-none tab-drop-out">
                    {sectionTransition.from === "relationshipGraph"
                      ? null
                      : renderSectionPanel(sectionTransition.from)}
                  </div>

                  <div
                    className="absolute inset-0 z-20 tab-rise-in"
                    onAnimationEnd={(event) => {
                      if (event.currentTarget !== event.target) {
                        return;
                      }
                      if (sectionTransition.to === "relationshipGraph") {
                        return;
                      }
                      handleIncomingPanelAnimationEnd(sectionTransition.id);
                    }}
                  >
                    {sectionTransition.to === "relationshipGraph"
                      ? null
                      : renderSectionPanel(renderSection)}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 z-0">
                  {renderSection === "relationshipGraph" ? null : renderSectionPanel(renderSection)}
                </div>
              )}
            </div>
          </div>
        </main>

        <SuccessToast message={successToastMessage} visible={toastVisible} />
      </section>

      <ContentInboxMobileFooter activeSection={activeSection} onSectionChange={changeSection} />
    </section>
  );
}