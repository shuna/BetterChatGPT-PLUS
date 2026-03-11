import type { StreamingMarkdownPolicy } from '@type/chat';

export type StreamingMarkdownMode = 'plain' | 'debounced' | 'live';

export interface StreamingMarkdownEnvironment {
  isDesktopLike: boolean;
  saveData: boolean;
}

export interface ResolveStreamingMarkdownModeOptions {
  policy: StreamingMarkdownPolicy;
  isGeneratingMessage: boolean;
  textLength: number;
  hasCodeBlock: boolean;
  environment?: StreamingMarkdownEnvironment;
}

const LONG_TEXT_THRESHOLD = 4_000;

export function getStreamingMarkdownEnvironment(): StreamingMarkdownEnvironment {
  if (typeof window === 'undefined') {
    return {
      isDesktopLike: true,
      saveData: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  const isElectron = ua.includes(' electron/');
  const finePointer = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const canHover = window.matchMedia?.('(hover: hover)').matches ?? false;
  const largeViewport = window.innerWidth >= 1024;
  const saveData =
    (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
        };
      }
    ).connection?.saveData ?? false;

  return {
    isDesktopLike: isElectron || (finePointer && canHover && largeViewport),
    saveData,
  };
}

export function resolveStreamingMarkdownMode({
  policy,
  isGeneratingMessage,
  textLength,
  hasCodeBlock,
  environment = getStreamingMarkdownEnvironment(),
}: ResolveStreamingMarkdownModeOptions): StreamingMarkdownMode {
  if (!isGeneratingMessage) return 'live';
  if (policy === 'never') return 'plain';
  if (policy === 'always') {
    return hasCodeBlock || textLength >= LONG_TEXT_THRESHOLD ? 'debounced' : 'live';
  }
  if (environment.saveData || !environment.isDesktopLike) return 'plain';
  if (hasCodeBlock || textLength >= LONG_TEXT_THRESHOLD) return 'debounced';
  return 'live';
}
