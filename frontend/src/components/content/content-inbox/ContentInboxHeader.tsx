import type { Ref } from "react";
import LogoyTextoFunil from "../../../assets/LogoyTextoFunil.svg";
import { useI18n } from "../../../i18n/I18nProvider";
import type { I18nKey } from "../../../i18n/messages";
import type { EntryItem } from "../../../types/resource";
import {
  CompassIcon,
  Cog6ToothIcon,
  InboxArrowDownIcon,
  NotificationBellIcon,
  RelationshipGraphIcon,
  UserIcon
} from "../../ui/icons";
import { StorageTabIcon } from "../../ui/StorageTabIcon";
import { LANGUAGE_OPTIONS, type InboxSection } from "./constants";

type ContentInboxHeaderProps = {
  activeSection: InboxSection;
  onSectionChange: (section: InboxSection) => void;
  headerMenusRef: Ref<HTMLDivElement>;
  notificationsOpen: boolean;
  settingsOpen: boolean;
  onToggleNotifications: () => void;
  onToggleSettings: () => void;
  onCloseMenus: () => void;
  notificationEntries: EntryItem[];
  storageLoading: boolean;
  notificationDateFormatter: Intl.DateTimeFormat;
  onNotificationSelect: (entryId: number) => void;
};

const desktopNavSections: Array<{
  section: InboxSection;
  icon: any;
  ariaKey: I18nKey;
}> = [
  { section: "explore", icon: CompassIcon, ariaKey: "footer.explore" },
  { section: "storage", icon: StorageTabIcon, ariaKey: "footer.storage" },
  { section: "inbox", icon: InboxArrowDownIcon, ariaKey: "footer.inbox" },
  { section: "relationshipGraph", icon: RelationshipGraphIcon, ariaKey: "footer.relationshipGraph" },
  { section: "profile", icon: UserIcon, ariaKey: "footer.profile" }
];

function desktopSectionButtonClass(active: boolean) {
  return `inline-flex h-10 w-24 shrink-0 items-center justify-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
    active
      ? "rounded-lg bg-[#111827] text-white"
      : "rounded-lg text-ink-700 hover:bg-[linear-gradient(180deg,rgba(255,248,241,0.96)_0%,rgba(229,243,255,0.9)_100%)] hover:text-ink-900 hover:backdrop-blur-[18px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.88)]"
  }`;
}

export function ContentInboxHeader({
  activeSection,
  onSectionChange,
  headerMenusRef,
  notificationsOpen,
  settingsOpen,
  onToggleNotifications,
  onToggleSettings,
  onCloseMenus,
  notificationEntries,
  storageLoading,
  notificationDateFormatter,
  onNotificationSelect
}: ContentInboxHeaderProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/95 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(238,238,238,0.9)_100%)] px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        className="inline-flex items-center justify-center"
        aria-label={t("footer.inbox")}
        onClick={() => onSectionChange("inbox")}
      >
        <img
          src={LogoyTextoFunil}
          alt={t("app.name")}
          className="h-[52.12px] w-[84px]"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        />
      </button>

      <nav className="mx-auto hidden w-3/4 items-center justify-center gap-3 md:flex">
        {desktopNavSections.map(({ section, icon: Icon, ariaKey }, index) => (
          <div key={section} className="flex items-center gap-3">
            <button
              type="button"
              className={desktopSectionButtonClass(activeSection === section)}
              onClick={() => onSectionChange(section)}
              aria-label={t(ariaKey)}
            >
              <Icon className="h-6 w-6" />
            </button>
            {index < desktopNavSections.length - 1 ? <div className="h-8 w-px shrink-0 bg-gray-700" /> : null}
          </div>
        ))}
      </nav>

      <div className="relative flex items-center gap-2" ref={headerMenusRef}>
        <div className="relative">
          <button
            type="button"
            className="btn-fill-anim inline-flex h-10 w-10 items-center justify-center rounded-control border border-brand-200 bg-white text-ink-900 shadow-[0_14px_26px_rgba(19,61,81,0.07)] [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]"
            aria-label={t("notifications.ariaButton")}
            aria-haspopup="menu"
            aria-expanded={notificationsOpen}
            onClick={onToggleNotifications}
          >
            <NotificationBellIcon className="h-6 w-6" />
          </button>

          {notificationsOpen ? (
            <section
              className="absolute top-[calc(100%+10px)] z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-card border border-white/95 bg-[linear-gradient(180deg,rgba(255,255,255,0.99)_0%,rgba(240,240,240,0.95)_100%)] p-3 shadow-card backdrop-blur-md"
              style={{ right: 0 }}
              role="menu"
              aria-label={t("notifications.menuAria")}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {t("notifications.ariaButton")}
              </p>

              <div className="scrollbar-brand mt-2 max-h-80 overflow-y-auto pr-1">
                {storageLoading ? (
                  <p className="text-sm text-ink-600">{t("storage.loading")}</p>
                ) : notificationEntries.length === 0 ? (
                  <p className="text-sm text-ink-600">{t("notifications.empty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {notificationEntries.map((entry) => (
                      <li key={`notif-${entry.id}`}>
                        <button
                          type="button"
                          className="w-full rounded-control border border-[#F0F0F0] bg-white px-2.5 py-2 text-left transition hover:bg-brand-50"
                          onClick={() => onNotificationSelect(entry.id)}
                        >
                          <p className="truncate text-sm font-semibold text-ink-900">{entry.title}</p>
                          <p className="mt-0.5 text-xs text-ink-600">
                            {entry.notificationDate
                              ? notificationDateFormatter.format(new Date(entry.notificationDate))
                              : ""}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            className="btn-fill-anim inline-flex h-10 w-10 items-center justify-center rounded-control border border-brand-200 bg-white text-ink-900 shadow-[0_12px_24px_rgba(19,61,81,0.06)] [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]"
            aria-label={t("settings.ariaButton")}
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <Cog6ToothIcon className="h-6 w-6" />
          </button>

          {settingsOpen ? (
            <section
              className="absolute right-0 top-[calc(100%+10px)] z-40 w-56 max-w-[calc(100vw-3rem)] rounded-card border border-brand-200 bg-white/95 p-3 shadow-card backdrop-blur-sm"
              role="menu"
              aria-label={t("settings.menuAria")}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("settings.title")}</p>

              <div className="mt-3">
                <p className="text-sm font-bold text-ink-900">{t("settings.language")}</p>
                <div className="mt-2 grid gap-1">
                  {LANGUAGE_OPTIONS.map((languageOption) => {
                    const selected = language === languageOption;
                    return (
                      <button
                        key={languageOption}
                        type="button"
                        className={`flex items-center justify-between rounded-control border px-2.5 py-2 text-sm font-semibold transition ${
                          selected
                            ? "btn-fill-anim border-brand-700 bg-brand-500 text-white [--btn-fill:#04586b] [--btn-text-hover:#ffffff]"
                            : "btn-fill-anim border-brand-200 bg-white text-ink-700 [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]"
                        }`}
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          setLanguage(languageOption);
                          onCloseMenus();
                        }}
                      >
                        <span>{t(`settings.language.${languageOption}` as I18nKey)}</span>
                        {selected ? (
                          <span className="text-xs text-white/85">{t("settings.current")}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </header>
  );
}
