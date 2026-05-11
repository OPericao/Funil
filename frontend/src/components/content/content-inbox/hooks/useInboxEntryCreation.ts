import { useCallback, useState } from "react";
import { isApiError } from "../../../../api/client";
import { createEntry, uploadFile } from "../../../../api/resources";
import { useI18n } from "../../../../i18n/I18nProvider";
import type { CreateEntryResourceInput } from "../../../../types/resource";
import { readErrorMessage } from "../../../../utils/error";
import {
  extractPrimaryLinkUrl,
  serializeRichTextPayload,
  supportsRichTextEntryFlag
} from "../../../../utils/richText";
import type { InboxEntryFormValues } from "../../InboxEntryCreateForm";
import { INITIAL_INBOX_ENTRY_FORM } from "../constants";
import { resolveEntryFlag } from "../utils";

type UseInboxEntryCreationParams = {
  onUnauthorized: () => void;
};

export function useInboxEntryCreation({ onUnauthorized }: UseInboxEntryCreationParams) {
  const { t } = useI18n();
  const [inboxEntryForm, setInboxEntryForm] = useState<InboxEntryFormValues>(INITIAL_INBOX_ENTRY_FORM);
  const [inboxSubmitting, setInboxSubmitting] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [inboxMessage, setInboxMessage] = useState<string | null>(null);

  const clearInboxFeedback = useCallback(() => {
    setInboxError(null);
    setInboxMessage(null);
  }, []);

  const patchInboxEntryForm = useCallback(
    (patch: Partial<InboxEntryFormValues>) => {
      setInboxEntryForm((current) => ({ ...current, ...patch }));
      clearInboxFeedback();
    },
    [clearInboxFeedback]
  );

  const handleCreateInboxEntry = useCallback(async () => {
    const title = inboxEntryForm.title.trim();
    const textContent = inboxEntryForm.textContent.trim();
    const linkUrl = extractPrimaryLinkUrl(inboxEntryForm.textContentHtml, textContent);
    const activeFlag = resolveEntryFlag(inboxEntryForm);

    if (activeFlag === "YOUTUBE" && !textContent) {
      setInboxError(t("entries.youtubeRequired"));
      return;
    }

    if (activeFlag === "TWITCH" && !textContent) {
      setInboxError(t("entries.twitchRequired"));
      return;
    }

    if (activeFlag === "LINK" && !linkUrl) {
      setInboxError(t("entries.linkRequired"));
      return;
    }

    const resources: CreateEntryResourceInput[] = [];
    if (textContent) {
      resources.push(
        activeFlag === "LINK"
          ? {
              type: "LINK",
              url: linkUrl!
            }
          : {
              type: "RAW",
              textContent: supportsRichTextEntryFlag(activeFlag)
                ? serializeRichTextPayload(inboxEntryForm.textContentHtml, textContent)
                : textContent
            }
      );
    }

    try {
      setInboxSubmitting(true);
      clearInboxFeedback();

      if (inboxEntryForm.mediaFiles.length > 0) {
        for (const file of inboxEntryForm.mediaFiles) {
          const uploaded = await uploadFile(file);
          resources.push({
            type: "MEDIA",
            title: file.type.startsWith("video/") ? t("resource.video") : t("resource.file"),
            storageKey: uploaded.path,
            fileName: uploaded.fileName || file.name,
            mimeType: uploaded.mimeType || file.type || undefined
          });
        }
      }

      await createEntry({
        title: title || undefined,
        resources,
        flag: activeFlag,
        notification: inboxEntryForm.alarmEnabled
      });

      setInboxEntryForm(INITIAL_INBOX_ENTRY_FORM);
      setInboxMessage(t("inbox.saved"));
    } catch (requestError) {
      if (isApiError(requestError) && requestError.status === 401) {
        onUnauthorized();
        return;
      }

      if (isApiError(requestError) && requestError.status === 413) {
        setInboxError(t("common.uploadTooLarge"));
        return;
      }

      setInboxError(readErrorMessage(requestError, t("common.unexpectedError")));
    } finally {
      setInboxSubmitting(false);
    }
  }, [clearInboxFeedback, inboxEntryForm, onUnauthorized, t]);

  return {
    inboxEntryForm,
    inboxSubmitting,
    inboxError,
    inboxMessage,
    clearInboxFeedback,
    patchInboxEntryForm,
    handleCreateInboxEntry
  };
}
