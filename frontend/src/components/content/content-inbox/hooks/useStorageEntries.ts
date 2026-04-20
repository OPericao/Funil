import { useCallback, useEffect, useMemo, useState } from "react";
import { isApiError } from "../../../../api/client";
import { fetchEntries, fetchEntryRelationships, searchEntries } from "../../../../api/resources";
import type { EntryItem, EntryRelationshipItem } from "../../../../types/resource";
import { useI18n } from "../../../../i18n/I18nProvider";
import { readErrorMessage } from "../../../../utils/error";
import type { InboxSection } from "../constants";

type UseStorageEntriesParams = {
  activeSection: InboxSection;
  notificationsOpen: boolean;
  onUnauthorized: () => void;
};

function dedupeEntries(entries: EntryItem[]) {
  const seen = new Set<number>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

export function useStorageEntries({
  activeSection,
  notificationsOpen,
  onUnauthorized
}: UseStorageEntriesParams) {
  const { language, t } = useI18n();

  const [storageEntries, setStorageEntries] = useState<EntryItem[]>([]);
  const [manualRelationships, setManualRelationships] = useState<EntryRelationshipItem[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageSearchValue, setStorageSearchValue] = useState("");
  const [storageSearchResults, setStorageSearchResults] = useState<EntryItem[] | null>(null);
  const [storageSearchLoading, setStorageSearchLoading] = useState(false);
  const [storageSearchError, setStorageSearchError] = useState<string | null>(null);
  const [entryToOpenFromNotifications, setEntryToOpenFromNotifications] = useState<number | null>(null);

  const loadStorageEntries = useCallback(async () => {
    try {
      setStorageLoading(true);
      setStorageError(null);

      const [entriesData, relationshipsData] = await Promise.all([
        fetchEntries(),
        fetchEntryRelationships(),
      ]);

      setStorageEntries(dedupeEntries(entriesData));
      setManualRelationships(relationshipsData ?? []);
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }

      setStorageError(readErrorMessage(requestError, t("common.unexpectedError")));
    } finally {
      setStorageLoading(false);
    }
  }, [onUnauthorized, t]);

  useEffect(() => {
    if (activeSection !== "storage") {
      return;
    }
    void loadStorageEntries();
  }, [activeSection, loadStorageEntries]);

  useEffect(() => {
    if (!notificationsOpen || storageEntries.length > 0) {
      return;
    }
    void loadStorageEntries();
  }, [loadStorageEntries, notificationsOpen, storageEntries.length]);

  useEffect(() => {
    const query = storageSearchValue.trim();
    if (!query) {
      setStorageSearchResults(null);
      setStorageSearchLoading(false);
      setStorageSearchError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        setStorageSearchLoading(true);
        setStorageSearchError(null);
        const results = await searchEntries(query);
        if (!cancelled) {
          setStorageSearchResults(dedupeEntries(results));
        }
      } catch (requestError) {
        if (isApiError(requestError) && requestError.status === 401) {
          onUnauthorized();
          return;
        }

        if (!cancelled) {
          setStorageSearchResults([]);
          setStorageSearchError(readErrorMessage(requestError, t("common.unexpectedError")));
        }
      } finally {
        if (!cancelled) {
          setStorageSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [onUnauthorized, storageSearchValue, t]);

  const notificationEntries = useMemo(() => {
    return storageEntries
      .filter((entry) => entry.notificationDate !== null)
      .sort((a, b) => {
        const leftTime = Date.parse(a.notificationDate ?? "");
        const rightTime = Date.parse(b.notificationDate ?? "");
        return leftTime - rightTime;
      });
  }, [storageEntries]);

  const notificationDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        language === "en" ? "en-US" : language === "fr" ? "fr-FR" : language === "gl" ? "gl-ES" : "es-ES",
        { dateStyle: "medium", timeStyle: "short" }
      ),
    [language]
  );

  const openEntryFromNotifications = useCallback((entryId: number) => {
    setEntryToOpenFromNotifications(entryId);
  }, []);

  const handleEntryToOpenHandled = useCallback(() => {
    setEntryToOpenFromNotifications(null);
  }, []);

  return {
    storageEntries,
    manualRelationships,
    storageLoading,
    storageError,
    storageSearchValue,
    storageSearchResults,
    storageSearchLoading,
    storageSearchError,
    setStorageSearchValue,
    loadStorageEntries,
    notificationEntries,
    notificationDateFormatter,
    entryToOpenFromNotifications,
    openEntryFromNotifications,
    handleEntryToOpenHandled
  };
}
