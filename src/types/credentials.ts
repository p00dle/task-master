export type CredentialsListener = (creds: { username: string | null; password: string | null }) => any;
export type EnvVars = { username?: string; password?: string };
export type CredentialsData = { username: string | null; password: string | null };

export interface CredentialsStatus {
  status: 'Not Provided' | 'Provided' | 'Valid' | 'Invalid';
  name: string;
  username: string | null;
  valid: boolean | null;
  hasPassword: boolean;
}
