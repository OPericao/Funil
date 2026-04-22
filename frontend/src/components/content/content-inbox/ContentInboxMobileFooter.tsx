import { useI18n } from "../../../i18n/I18nProvider";
import {
  CompassIcon,
  SendIcon,
  UnplugIcon,
  UserRoundIcon
} from "../../ui/icons";
import { StorageTabIcon } from "../../ui/StorageTabIcon";
import { footerButtonClass, type InboxSection } from "./constants";

type ContentInboxMobileFooterProps = {
  activeSection: InboxSection;
  onSectionChange: (section: InboxSection) => void;
};

const mobileNavSections: Array<{
  section: InboxSection;
  withRightBorder: boolean;
  icon: any;
  labelKey: "footer.explore" | "footer.storage" | "footer.inbox" | "footer.relationshipGraph" | "footer.profile";
}> = [
  { section: "explore", withRightBorder: true, icon: CompassIcon, labelKey: "footer.explore" },
  { section: "storage", withRightBorder: true, icon: StorageTabIcon, labelKey: "footer.storage" },
  { section: "inbox", withRightBorder: true, icon: SendIcon, labelKey: "footer.inbox" },
  {
    section: "relationshipGraph",
    withRightBorder: true,
    icon: UnplugIcon,
    labelKey: "footer.relationshipGraph"
  },
  { section: "profile", withRightBorder: false, icon: UserRoundIcon, labelKey: "footer.profile" }
];

export function ContentInboxMobileFooter({
  activeSection,
  onSectionChange
}: ContentInboxMobileFooterProps) {
  const { t } = useI18n();

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-brand-200 bg-white/90 backdrop-blur-sm md:hidden">
      <div className="flex h-16 w-full">
        {mobileNavSections.map(({ section, withRightBorder, icon: Icon, labelKey }) => (
          <button
            key={section}
            type="button"
            className={footerButtonClass(activeSection === section, withRightBorder)}
            onClick={() => onSectionChange(section)}
            aria-label={t(labelKey)}
          >
            <Icon className="h-7 w-7" />
          </button>
        ))}
      </div>
    </footer>
  );
}
