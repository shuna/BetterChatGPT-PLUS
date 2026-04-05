export interface Prompt {
  id: string;
  name: string;
  prompt: string;
  /** User-facing label for categorisation. Not a usage restriction. */
  label?: 'system' | 'user';
}
