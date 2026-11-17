import { IUser } from "@/features/user/types/user.types.ts";
import { ISpace } from "@/features/space/types/space.types.ts";
import { IPage } from "@/features/page/types/page.types.ts";
import { ILabel } from "@/features/label/types/label.types.ts";

export interface IPageSearch {
  id: string;
  title: string;
  icon: string;
  parentPageId: string;
  slugId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  rank: string;
  highlight: string;
  space: Partial<ISpace>;
  labels?: ILabel[];
}

export interface SearchSuggestionParams {
  query: string;
  includeUsers?: boolean;
  includePages?: boolean;
  spaceId?: string;
  limit?: number;
}

export interface ISuggestionResult {
  users?: Partial<IUser[]>;
  pages?: Partial<IPage[]>;
}

export interface IPageSearchParams {
  query: string;
  spaceId?: string;
  shareId?: string;
  /** Narrows to pages carrying these labels. Page search only. */
  labelIds?: string[];
  taxonomyFilters?: Array<{ treeId: string; nodeIds: string[] }>;
}
