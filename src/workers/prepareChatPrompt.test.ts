import { describe, it, expect, vi } from 'vitest';
import { prepareChatPrompt, type ChatTemplateProvider } from './prepareChatPrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Provider that has a chat template and successfully formats. */
function instructProvider(templateStr = '<|im_start|>...'): ChatTemplateProvider {
  return {
    getChatTemplate: () => templateStr,
    formatChat: vi.fn(async (msgs, _addAssistant) => {
      const userContent = msgs[0]?.content ?? '';
      return `<|im_start|>user\n${userContent}<|im_end|>\n<|im_start|>assistant\n`;
    }),
  };
}

/** Provider whose chat template exists but formatChat throws. */
function brokenTemplateProvider(): ChatTemplateProvider {
  return {
    getChatTemplate: () => '{% for ... %}',
    formatChat: vi.fn(async () => { throw new Error('Jinja parse error'); }),
  };
}

/** Provider with no chat template (base model). */
function baseModelProvider(): ChatTemplateProvider {
  return {
    getChatTemplate: () => null,
    formatChat: vi.fn(async () => ''),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prepareChatPrompt', () => {
  const RAW = 'Q: What is 2+3? A:';

  // === Case 1: instruct model (template exists, formatChat succeeds) ===

  it('applies chat template when model has one', async () => {
    const provider = instructProvider();
    const result = await prepareChatPrompt(RAW, provider);

    expect(result.chatTemplateApplied).toBe(true);
    expect(result.chatTemplateFailed).toBe(false);
    expect(result.prompt).toContain('<|im_start|>user');
    expect(result.prompt).toContain(RAW);
    expect(result.prompt).toContain('<|im_start|>assistant');
  });

  it('calls formatChat with user role and addAssistant=true', async () => {
    const provider = instructProvider();
    await prepareChatPrompt(RAW, provider);

    expect(provider.formatChat).toHaveBeenCalledWith(
      [{ role: 'user', content: RAW }],
      true,
    );
  });

  it('returns a prompt different from the raw input', async () => {
    const provider = instructProvider();
    const result = await prepareChatPrompt(RAW, provider);

    expect(result.prompt).not.toBe(RAW);
    expect(result.prompt.length).toBeGreaterThan(RAW.length);
  });

  // === Case 2: instruct model but formatChat throws ===

  it('falls back to raw prompt when formatChat throws', async () => {
    const provider = brokenTemplateProvider();
    const result = await prepareChatPrompt(RAW, provider);

    expect(result.prompt).toBe(RAW);
    expect(result.chatTemplateFailed).toBe(true);
    expect(result.chatTemplateApplied).toBe(false);
  });

  it('does not propagate the formatChat exception', async () => {
    const provider = brokenTemplateProvider();
    // Should not throw
    await expect(prepareChatPrompt(RAW, provider)).resolves.toBeDefined();
  });

  // === Case 3: base model (no template) ===

  it('uses raw prompt when model has no chat template', async () => {
    const provider = baseModelProvider();
    const result = await prepareChatPrompt(RAW, provider);

    expect(result.prompt).toBe(RAW);
    expect(result.chatTemplateFailed).toBe(false);
    expect(result.chatTemplateApplied).toBe(false);
  });

  it('does not call formatChat when no template exists', async () => {
    const provider = baseModelProvider();
    await prepareChatPrompt(RAW, provider);

    expect(provider.formatChat).not.toHaveBeenCalled();
  });

  // === Edge cases ===

  it('handles empty prompt string', async () => {
    const provider = instructProvider();
    const result = await prepareChatPrompt('', provider);

    expect(result.chatTemplateApplied).toBe(true);
    expect(result.prompt).toContain('<|im_start|>user');
  });

  it('handles empty-string chat template as falsy (base model path)', async () => {
    const provider: ChatTemplateProvider = {
      getChatTemplate: () => '',
      formatChat: vi.fn(async () => 'should not be called'),
    };
    const result = await prepareChatPrompt(RAW, provider);

    // Empty string is falsy — treated as no template
    expect(result.prompt).toBe(RAW);
    expect(result.chatTemplateApplied).toBe(false);
    expect(provider.formatChat).not.toHaveBeenCalled();
  });

  it('preserves prompt exactly on fallback (no mutation)', async () => {
    const prompt = 'りんごが3個あり、2個もらいました。合計はいくつですか？';
    const provider = brokenTemplateProvider();
    const result = await prepareChatPrompt(prompt, provider);

    expect(result.prompt).toBe(prompt);
  });
});
