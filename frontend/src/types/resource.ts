export type TagItem = {
  id: number;
  name: string;
  createdAt: string;
};

export type ResourceType = "RAW" | "LINK" | "MEDIA";
export type EntryFlag =
  | "RAW"
  | "YOUTUBE"
  | "LINK"
  | "SPOTIFY"
  | "TWITCH"
  | "TABLE"
  | "ENUMERATION"
  | "CHECKLIST";

export type ResourceItem = {
  id: number;
  type: ResourceType;
  title: string | null;
  textContent: string | null;
  url: string | null;
  siteName: string | null;
  description: string | null;
  contentPreview: string | null;
  storageKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
};

export type EntryItem = {
  id: number;
  title: string;
  flag: EntryFlag | null;
  resources: ResourceItem[];
  tags: TagItem[];
  processingCategory: string | null;
  keyIdeas: string[];
  actions: string[];
  notificationDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FolderItem = {
  id: number;
  title: string;
};

export type EntryFolderItem = {
  id: number;
  title: string;
  selected: boolean;
};

export type CreateEntryResourceInput = {
  type: ResourceType;
  title?: string;
  textContent?: string;
  url?: string;
  storageKey?: string;
  fileName?: string;
  mimeType?: string;
};

export type CreateEntryInput = {
  title?: string;
  resources?: CreateEntryResourceInput[];
  flag?: EntryFlag;
  notification?: boolean;
};

export type CreateTextResourceInput = {
  title?: string;
  textContent: string;
};

export type CreateLinkResourceInput = {
  title?: string;
  url: string;
};

export type CreateMediaResourceInput = {
  title?: string;
  storageKey: string;
  fileName?: string;
  mimeType?: string;
};

export type UploadFileResult = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type EntryRelationshipItem = {
  id: number;
  sourceEntryId: number;
  targetEntryId: number;
  sourceHandle: string | null;
  targetHandle: string | null;
  createdAt: string;
};

export type ExploreSourceItem = {
  entryId: number;
  title: string;
  snippet: string;
};

export type ExploreAnswer = {
  question: string;
  answer: string;
  sources: ExploreSourceItem[];
};

export type ExploreSuggestions = {
  suggestions: string[];
};

export type ExploreRecommendationItem = {
  type: "EXPLORE" | "OPTIMIZE";
  title: string;
  description: string;
  suggestedQuestion: string;
  sources: ExploreSourceItem[];
};

export type ExploreRecommendations = {
  recommendations: ExploreRecommendationItem[];
};

export type ExploreCollectionItem = {
  kind: "THEME" | "RECENT" | "BRIDGE";
  title: string;
  description: string;
  suggestedQuestion: string;
  entryCount: number;
  sources: ExploreSourceItem[];
};

export type ExploreCollections = {
  collections: ExploreCollectionItem[];
};
