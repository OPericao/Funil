import type { ReactNode, RefObject } from "react";
import type { EntryFolderItem } from "../../../types/resource";
import { StorageTabIcon } from "../../ui/StorageTabIcon";

type EntryFoldersMenuProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  folders: EntryFolderItem[];
  updatingFolderId: number | null;
  menuRef: RefObject<HTMLDivElement>;
  emptyLabel: string;
  loadingLabel: string;
  menuAriaLabel: string;
  toggleAriaLabel: string;
  onToggle: () => void;
  onFolderToggle: (folder: EntryFolderItem) => void | Promise<void>;
  closeAction: ReactNode;
  toggleClassName: string;
};

function FolderSelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      className={`ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
        selected ? "border-brand-500 bg-brand-500 text-white" : "border-brand-300 text-transparent"
      }`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4.5 10.5 8 14l7.5-8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function EntryFoldersMenu({
  open,
  loading,
  error,
  folders,
  updatingFolderId,
  menuRef,
  emptyLabel,
  loadingLabel,
  menuAriaLabel,
  toggleAriaLabel,
  onToggle,
  onFolderToggle,
  closeAction,
  toggleClassName
}: EntryFoldersMenuProps) {
  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <button
        type="button"
        className={toggleClassName}
        aria-label={toggleAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        <StorageTabIcon className="h-6 w-6" />
      </button>

      {closeAction}

      {open ? (
        <section
          className="absolute right-0 top-[calc(100%+10px)] z-40 w-[280px] max-w-[calc(100vw-3rem)] rounded-card border border-white/85 bg-[linear-gradient(180deg,rgba(250,252,255,0.96)_0%,rgba(239,244,249,0.92)_100%)] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur-md"
          role="menu"
          aria-label={menuAriaLabel}
        >
          {loading ? (
            <p className="text-sm font-medium text-ink-600">{loadingLabel}</p>
          ) : error ? (
            <p className="text-sm font-medium text-ink-600">{error}</p>
          ) : folders.length === 0 ? (
            <p className="text-sm font-medium text-ink-600">{emptyLabel}</p>
          ) : (
            <ul className="scrollbar-brand max-h-56 space-y-1 overflow-y-auto pr-1">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between rounded-control border px-2.5 py-2 text-sm font-semibold transition ${
                      folder.selected
                        ? "border-brand-400 bg-brand-100 text-brand-800"
                        : "border-brand-200 bg-white/25 text-ink-800 hover:bg-brand-50"
                    }`}
                    disabled={updatingFolderId === folder.id}
                    onClick={() => void onFolderToggle(folder)}
                  >
                    <span className="truncate text-left">{folder.title}</span>
                    <FolderSelectionIndicator selected={folder.selected} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

type DeleteEntryConfirmModalProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  title: string;
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  savingLabel: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function DeleteEntryConfirmModal({
  open,
  submitting,
  error,
  title,
  message,
  cancelLabel,
  confirmLabel,
  savingLabel,
  onClose,
  onConfirm
}: DeleteEntryConfirmModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/25 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="w-full max-w-[420px] rounded-card border border-brand-200 bg-white p-4 shadow-card md:p-5">
        <h3 className="text-lg font-extrabold tracking-tight text-ink-900">{title}</h3>
        <p className="mt-2 text-sm text-ink-700">{message}</p>
        {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-control border border-brand-200 bg-white px-3 text-sm font-semibold text-ink-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onClose}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-control border border-rose-500 bg-rose-500 px-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => void onConfirm()}
            disabled={submitting}
          >
            {submitting ? savingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
