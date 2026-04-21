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
  | "TABLE";

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
  searchDebug?: {
    topicScore: number;
    tagScore: number;
    noteScore: number;
    titleScore: number;
    semanticScore: number;
    conflictPenalty: number;
    structuredScore: number;
    finalScore: number;
    directTagMatches: number;
    queryTopics: string[];
    tagTopics: string[];
  } | null;
};

export type EntryMentionItem = {
  id: number;
  title: string;
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

export type ExploreConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ExploreActiveChip = {
  type: "EXPLORE" | "OPTIMIZE";
  title: string;
  description: string;
  suggestedQuestion: string;
};

export type ExploreAskInput = {
  question: string;
  sourceEntryIds?: number[];
  activeChip?: ExploreActiveChip | null;
  history?: ExploreConversationTurn[];
};

export type ExploreSuggestions = {
  suggestions: string[];
};

export type ExploreRecommendationItem = {
  type: "EXPLORE" | "OPTIMIZE";
  kind: "DEEPEN" | "VARIANT" | "COMPLEMENT" | "NEXT" | "OPTIMIZE";
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
