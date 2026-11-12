export const ROLE_CODES = [
  'ADMIN',
  'OPERATOR',
  'SECURITY',
  'REPORTER',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
