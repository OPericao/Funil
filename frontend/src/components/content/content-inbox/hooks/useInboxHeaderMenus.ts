import { useCallback, useEffect, useRef, useState } from "react";

export function useInboxHeaderMenus() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const headerMenusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen && !notificationsOpen) {
      return;
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!headerMenusRef.current?.contains(target)) {
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [notificationsOpen, settingsOpen]);

  const toggleNotifications = useCallback(() => {
    setNotificationsOpen((current) => !current);
    setSettingsOpen(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((current) => !current);
    setNotificationsOpen(false);
  }, []);

  const closeMenus = useCallback(() => {
    setNotificationsOpen(false);
    setSettingsOpen(false);
  }, []);

  return {
    headerMenusRef,
    notificationsOpen,
    settingsOpen,
    toggleNotifications,
    toggleSettings,
    closeMenus
  };
}
