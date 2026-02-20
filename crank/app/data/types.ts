export interface Hierarchy {
  id: string;
  parentId?: string;
  data: Record<string, unknown>;
  children: Hierarchy[];
}
