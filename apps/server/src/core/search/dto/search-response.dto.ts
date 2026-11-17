import { Space } from '@tcc-docs/db/types/entity.types';
import { LabelWithTree } from '@tcc-docs/db/repos/label/label.repo';

export class SearchResponseDto {
  id: string;
  title: string;
  icon: string;
  parentPageId: string;
  creatorId: string;
  rank: number;
  highlight: string;
  createdAt: Date;
  updatedAt: Date;
  space: Partial<Space>;
  labels: LabelWithTree[];
}
