export const MAX_CONTEXT = 5;
export const DEFAULT_CONTEXT = { before: 2, after: 1 };
export type Context = { before: number; after: number };
export const validContextCount = (count: unknown): count is number =>
  typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= MAX_CONTEXT;
