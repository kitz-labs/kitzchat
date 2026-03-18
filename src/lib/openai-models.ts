export type OpenAiModelOption = {
  value: string;
  label: string;
  group?: string;
};

export const OPENAI_MODEL_OPTIONS: OpenAiModelOption[] = [
  { value: 'o3-mini', label: 'o3-mini (Reasoning)', group: 'Reasoning' },
  { value: 'o1-mini', label: 'o1-mini (Reasoning)', group: 'Reasoning' },
  { value: 'o1', label: 'o1 (Reasoning)', group: 'Reasoning' },
  { value: 'gpt-5.4', label: 'gpt-5.4 (Premium)', group: 'GPT' },
  { value: 'gpt-5', label: 'gpt-5', group: 'GPT' },
  { value: 'gpt-4.1', label: 'gpt-4.1', group: 'GPT' },
  { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini', group: 'GPT' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini', group: 'GPT' },
  { value: 'gpt_high', label: 'gpt_high (Alias → gpt-5.4)', group: 'Aliases' },
  { value: 'gpt_mid', label: 'gpt_mid (Alias → gpt-4.1-mini)', group: 'Aliases' },
  { value: 'gpt_low', label: 'gpt_low (Alias → gpt-4o-mini)', group: 'Aliases' },
];

export function listOpenAiModelValues(): string[] {
  return OPENAI_MODEL_OPTIONS.map((entry) => entry.value);
}
