import { DB } from '@tcc-docs/db/types/db';
import { PageEmbeddings } from '@tcc-docs/db/types/embeddings.types';

export interface DbInterface extends DB {
  pageEmbeddings: PageEmbeddings;
}
