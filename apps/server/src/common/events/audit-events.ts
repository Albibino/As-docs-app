/**
 * Eventos gravados na tabela `audit`.
 *
 * TCC: o módulo genérico de auditoria (registro de auditoria, fila e tela
 * "Audit log") foi removido. A tabela `audit` continua só como histórico de
 * labels (`LabelAuditService`), mostrado no painel de detalhes da página.
 * Ver docs/tcc/02-cortes-de-funcionalidade.md.
 */
export const AuditEvent = {
  // Page labels
  PAGE_LABEL_ADDED: 'page.label_added',
  PAGE_LABEL_REMOVED: 'page.label_removed',
  PAGE_LABEL_REPLACED: 'page.label_replaced',

  // Label taxonomy
  LABEL_CREATED: 'label.created',
  LABEL_UPDATED: 'label.updated',
  LABEL_DELETED: 'label.deleted',
  LABEL_TREE_CREATED: 'label_tree.created',
  LABEL_TREE_UPDATED: 'label_tree.updated',
  LABEL_TREE_DELETED: 'label_tree.deleted',
  LABEL_NODE_CREATED: 'label_node.created',
  LABEL_NODE_UPDATED: 'label_node.updated',
  LABEL_NODE_MOVED: 'label_node.moved',
  LABEL_NODE_DELETED: 'label_node.deleted',
  LABEL_NODE_CONVERTED: 'label_node.converted',
} as const;

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];

export const AuditResource = {
  PAGE: 'page',
  LABEL: 'label',
  LABEL_TREE: 'label_tree',
  LABEL_NODE: 'label_node',
} as const;

export type AuditResourceType =
  (typeof AuditResource)[keyof typeof AuditResource];
