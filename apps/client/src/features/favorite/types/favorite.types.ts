export type FavoriteType = "page" | "space";

export type IFavorite = {
  id: string;
  userId: string;
  pageId: string | null;
  spaceId: string | null;
  type: FavoriteType;
  workspaceId: string;
  createdAt: string;
  page?: {
    id: string;
    slugId: string;
    title: string;
    icon: string | null;
    isBase: boolean;
    spaceId: string;
  };
  space?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
};
