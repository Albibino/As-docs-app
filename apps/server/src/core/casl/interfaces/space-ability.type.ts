export enum SpaceCaslAction {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Edit = 'edit',
  Delete = 'delete',
}
export enum SpaceCaslSubject {
  Settings = 'settings',
  Member = 'member',
  Page = 'page',
  Label = 'label',
}

export type ISpaceAbility =
  | [SpaceCaslAction, SpaceCaslSubject.Settings]
  | [SpaceCaslAction, SpaceCaslSubject.Member]
  | [SpaceCaslAction, SpaceCaslSubject.Page]
  | [SpaceCaslAction, SpaceCaslSubject.Label];
