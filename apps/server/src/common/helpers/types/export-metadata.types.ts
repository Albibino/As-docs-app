export type ExportPageMetadata = {
  pageId: string;
  slugId: string;
  icon: string | null;
  position: string;
  parentPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportMetadata = {
  exportedAt: string;
  source: 'tcc-docs';
  version: string;
  pages: Record<string, ExportPageMetadata>;
};
