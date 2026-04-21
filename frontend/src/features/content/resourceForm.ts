import type { ResourceType } from "../../types/resource";

export type ResourceFormValues = {
  selectedEntryId: number | "";
  type: ResourceType;
  title: string;
  textContent: string;
  textContentHtml: string;
  url: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
};

export const INITIAL_RESOURCE_FORM: ResourceFormValues = {
  selectedEntryId: "",
  type: "RAW",
  title: "",
  textContent: "",
  textContentHtml: "",
  url: "",
  storageKey: "",
  fileName: "",
  mimeType: ""
};
