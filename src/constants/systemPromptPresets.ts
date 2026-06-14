import fable5Prompt from '@constants/presets/claude-fable-5.md?raw';

export interface SystemPromptPreset {
  id: string;
  /** Short label shown in the preset menu. */
  name: string;
  /** One-line hint shown under the name. */
  description: string;
  /** The full system prompt text applied to the chat. */
  content: string;
  /** Approximate token cost, surfaced so users know what they're opting into. */
  approxTokens?: number;
}

/**
 * Built-in system-prompt presets the user can apply with one click.
 *
 * The Fable 5 preset is a publicly-circulated behavioral/formatting system
 * prompt (not a jailbreak — it reinforces, rather than removes, safety
 * guidance). Applying it to older models can shift their behavior; provenance
 * is community-sourced and the "performance boost" claim is unverified.
 */
export const SYSTEM_PROMPT_PRESETS: SystemPromptPreset[] = [
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    description: 'Community-sourced Fable 5 behavioral prompt (~30k tokens/request)',
    content: fable5Prompt.trim(),
    approxTokens: 30000,
  },
];
