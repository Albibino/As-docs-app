import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { LABEL_COLORS } from '../label-colors';
import { MAX_LABEL_DESCRIPTION_LENGTH, MAX_LABEL_NAME_LENGTH } from '../utils';

/**
 * Which labels are reachable from a space. `spaceId` is required because a
 * label's visibility depends on where it is being used, not on the caller.
 */
export class ListLabelsDto {
  @IsUUID()
  spaceId: string;
}

/**
 * Admin listing: labels owned by exactly one scope. Omitting `spaceId` targets
 * the workspace scope.
 */
export class ListOwnedLabelsDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class CreateLabelTreeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string;

  /** Omit to create the tree at workspace scope. */
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class LabelTreeIdDto {
  @IsUUID()
  treeId: string;
}

export class UpdateLabelTreeDto extends LabelTreeIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class CreateLabelNodeDto extends LabelTreeIdDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsIn(['group', 'label'])
  kind: 'group' | 'label';

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class LabelNodeIdDto {
  @IsUUID()
  nodeId: string;
}

export class UpdateLabelNodeDto extends LabelNodeIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string | null;
}

export class MoveLabelNodeDto extends LabelNodeIdDto {
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsInt()
  @Min(0)
  position: number;
}

export class CreateLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string;

  /** Omit to create the label at workspace scope. */
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class LabelIdDto {
  @IsUUID()
  labelId: string;
}

export class UpdateLabelDto extends LabelIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LABEL_DESCRIPTION_LENGTH)
  description?: string | null;

  @IsOptional()
  @IsIn(LABEL_COLORS)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class PageLabelDto {
  @IsUUID()
  pageId: string;

  @IsUUID()
  labelId: string;
}

export class PageTaxonomyTreeDto {
  @IsUUID()
  pageId: string;

  @IsUUID()
  treeId: string;
}

export class PageTaxonomySelectionDto extends PageTaxonomyTreeDto {
  @IsOptional()
  @IsUUID()
  nodeId?: string | null;
}

export class PageTaxonomyNodeDto {
  @IsUUID()
  pageId: string;

  @IsUUID()
  nodeId: string;
}

/**
 * Coins a free label in the page's space and applies it in one step —
 * the "type a new label and hit enter" path, available to anyone who can edit
 * the page. Taxonomy nodes are admin territory and are never created this way.
 */
export class CreatePageLabelDto {
  @IsUUID()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LABEL_NAME_LENGTH)
  name: string;
}

export class FindPagesByLabelDto {
  @IsUUID()
  labelId: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
