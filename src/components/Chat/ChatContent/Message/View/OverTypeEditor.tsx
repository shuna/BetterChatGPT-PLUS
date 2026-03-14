import React, { useRef, useEffect, useCallback } from 'react';
import OverType from 'overtype';
import type { OverTypeInstance, Theme } from 'overtype';

// Custom themes that blend with the app's existing dark/light styles
const lightTheme: Theme = {
  name: 'app-light',
  previewColors: {
    bg: 'transparent',
    text: 'inherit',
    strong: 'inherit',
    em: 'inherit',
    h1: 'inherit',
    h2: 'inherit',
    h3: 'inherit',
    link: '#2563eb',
    code: '#d946ef',
    codeBg: 'rgba(0,0,0,0.05)',
    blockquote: '#6b7280',
    hr: '#d1d5db',
  },
  colors: {
    bgPrimary: 'transparent',
    bgSecondary: 'transparent',
    text: 'inherit',
    textPrimary: 'inherit',
    textSecondary: '#6b7280',
    border: 'transparent',
    cursor: '#374151',
    selection: 'rgba(59, 130, 246, 0.3)',
    placeholder: 'rgba(107, 114, 128, 0.4)',
    strong: 'inherit',
    em: 'inherit',
    h1: 'inherit',
    h2: 'inherit',
    h3: 'inherit',
    link: '#2563eb',
    code: '#d946ef',
    codeBg: 'rgba(0,0,0,0.05)',
    blockquote: '#6b7280',
    hr: '#d1d5db',
    syntax: '#9ca3af',
    syntaxMarker: '#9ca3af',
    listMarker: '#6b7280',
    rawLine: 'inherit',
    primary: '#2563eb',
    hoverBg: 'rgba(0,0,0,0.05)',
  },
};

const darkTheme: Theme = {
  name: 'app-dark',
  previewColors: {
    bg: 'transparent',
    text: 'inherit',
    strong: 'inherit',
    em: 'inherit',
    h1: 'inherit',
    h2: 'inherit',
    h3: 'inherit',
    link: '#60a5fa',
    code: '#e879f9',
    codeBg: 'rgba(255,255,255,0.1)',
    blockquote: '#9ca3af',
    hr: '#4b5563',
  },
  colors: {
    bgPrimary: 'transparent',
    bgSecondary: 'transparent',
    text: 'inherit',
    textPrimary: 'inherit',
    textSecondary: '#9ca3af',
    border: 'transparent',
    cursor: '#e5e7eb',
    selection: 'rgba(96, 165, 250, 0.3)',
    placeholder: 'rgba(107, 114, 128, 0.4)',
    strong: 'inherit',
    em: 'inherit',
    h1: 'inherit',
    h2: 'inherit',
    h3: 'inherit',
    link: '#60a5fa',
    code: '#e879f9',
    codeBg: 'rgba(255,255,255,0.1)',
    blockquote: '#9ca3af',
    hr: '#4b5563',
    syntax: '#6b7280',
    syntaxMarker: '#6b7280',
    listMarker: '#9ca3af',
    rawLine: 'inherit',
    primary: '#60a5fa',
    hoverBg: 'rgba(255,255,255,0.05)',
  },
};

export interface OverTypeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  mode: 'preview' | 'edit';
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
  autoFocus?: boolean;
  className?: string;
  autoResize?: boolean;
  minHeight?: string;
}

const OverTypeEditor: React.FC<OverTypeEditorProps> = ({
  value,
  onChange,
  mode,
  placeholder,
  onKeyDown,
  onPaste,
  autoFocus,
  className,
  autoResize = true,
  minHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<OverTypeInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const onKeyDownRef = useRef(onKeyDown);
  const onPasteRef = useRef(onPaste);
  const valueRef = useRef(value);

  onChangeRef.current = onChange;
  onKeyDownRef.current = onKeyDown;
  onPasteRef.current = onPaste;
  valueRef.current = value;

  const isDark = useCallback(() => {
    return document.documentElement.classList.contains('dark');
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const [instance] = new OverType(containerRef.current, {
      value: valueRef.current,
      theme: isDark() ? darkTheme : lightTheme,
      fontSize: '16px',
      lineHeight: 1.75,
      padding: '0',
      placeholder,
      autofocus: autoFocus,
      autoResize,
      minHeight,
      toolbar: false,
      showStats: false,
      spellcheck: true,
      onChange: (val) => {
        onChangeRef.current?.(val);
      },
      onKeydown: (e) => {
        onKeyDownRef.current?.(e);
      },
    });

    instanceRef.current = instance;

    // Force font/color to inherit from parent (OverType's CSS overrides !important)
    const container = containerRef.current;
    const forceInherit = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.setProperty('font-family', 'inherit', 'important');
      el.style.setProperty('color', 'inherit', 'important');
    };
    forceInherit(container.querySelector('.overtype-preview'));
    forceInherit(container.querySelector('.overtype-input'));

    // Attach paste handler to internal textarea
    if (instance.textarea && onPasteRef.current) {
      instance.textarea.addEventListener('paste', (e: Event) => {
        onPasteRef.current?.(e as ClipboardEvent);
      });
    }

    // Set initial mode
    if (mode === 'preview') {
      instance.showPreviewMode();
    } else {
      instance.showNormalEditMode();
    }

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mode changes
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    if (mode === 'preview') {
      instance.showPreviewMode();
    } else {
      instance.showNormalEditMode();
      if (autoFocus) {
        instance.focus();
      }
    }
  }, [mode, autoFocus]);

  // Sync external value changes (avoid cursor jump during typing)
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (instance.getValue() !== value) {
      instance.setValue(value);
    }
  }, [value]);

  // Sync theme with dark mode
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const instance = instanceRef.current;
      if (instance) {
        instance.setTheme(isDark() ? darkTheme : lightTheme);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [isDark]);

  return <div ref={containerRef} className={className} />;
};

export default OverTypeEditor;
