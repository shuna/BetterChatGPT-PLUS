import React, { useRef, useEffect, useCallback } from 'react';
import OverType from 'overtype';
import type { OverTypeInstance, Theme } from 'overtype';

const MARKDOWN_SYNTAX_PATTERN = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|(\*\*|__|~~|`|\[.+?\]\(.+?\)|!\[.*?\]\(.+?\)|\|.+\|)/m;

const hasMarkdownSyntax = (value: string) => MARKDOWN_SYNTAX_PATTERN.test(value);

/**
 * Detect consecutive table-row divs in OverType preview output and replace them
 * with a proper <table> element.  Each row is a <div> whose text matches the
 * pipe-delimited GFM table syntax (`| cell | cell |`).  Separator rows
 * (`|---|---|`) are consumed but not rendered.
 */
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const SEPARATOR_RE = /^\s*\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|\s*$/;

function convertTablesToHtml(previewEl: HTMLElement) {
  const children = Array.from(previewEl.children) as HTMLElement[];
  let i = 0;
  while (i < children.length) {
    const child = children[i];
    const text = child.textContent ?? '';
    if (child.tagName === 'DIV' && TABLE_ROW_RE.test(text)) {
      // Collect consecutive table-row divs
      const rowDivs: HTMLElement[] = [];
      let j = i;
      while (j < children.length) {
        const t = children[j].textContent ?? '';
        if (children[j].tagName === 'DIV' && TABLE_ROW_RE.test(t)) {
          rowDivs.push(children[j]);
          j++;
        } else {
          break;
        }
      }
      // Need at least header + separator + 1 data row (or header + separator)
      if (rowDivs.length >= 2) {
        const table = document.createElement('table');
        const parseCells = (div: HTMLElement) => {
          const raw = div.textContent ?? '';
          const m = TABLE_ROW_RE.exec(raw);
          if (!m) return [];
          return m[1].split('|').map((c) => c.trim());
        };

        // First row = header
        const headerCells = parseCells(rowDivs[0]);
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerCells.forEach((c) => {
          const th = document.createElement('th');
          th.textContent = c;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Find separator row and skip it
        let dataStart = 1;
        if (rowDivs.length > 1 && SEPARATOR_RE.test(rowDivs[1].textContent ?? '')) {
          dataStart = 2;
        }

        // Remaining rows = body
        if (dataStart < rowDivs.length) {
          const tbody = document.createElement('tbody');
          for (let k = dataStart; k < rowDivs.length; k++) {
            const cells = parseCells(rowDivs[k]);
            const tr = document.createElement('tr');
            cells.forEach((c) => {
              const td = document.createElement('td');
              td.textContent = c;
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
        }

        // Replace divs with table
        previewEl.insertBefore(table, rowDivs[0]);
        rowDivs.forEach((d) => d.remove());
        // Re-scan from same position since we modified DOM
        children.splice(i, rowDivs.length, table as unknown as HTMLElement);
        i++;
      } else {
        i = j;
      }
    } else {
      i++;
    }
  }
}

const applyEditorMode = (
  instance: OverTypeInstance,
  mode: 'preview' | 'edit',
  value: string,
  autoFocus?: boolean
) => {
  if (mode === 'preview') {
    instance.showPreviewMode();
    return;
  }

  if (hasMarkdownSyntax(value)) {
    instance.showNormalEditMode();
    if (autoFocus) {
      instance.focus();
    }
    return;
  }

  instance.showPlainTextarea();
  if (autoFocus) {
    instance.focus();
  }
};

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
      placeholder: placeholder || '',
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
      // @ts-expect-error onRender is supported at runtime but missing from type definitions
      onRender: (previewEl: HTMLElement, renderMode: string) => {
        if (renderMode === 'preview') {
          convertTablesToHtml(previewEl);
        }
      },
    });

    instanceRef.current = instance;

    // Force font/color to inherit from parent (OverType's CSS overrides !important)
    const container = containerRef.current;
    const forceFontInherit = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.setProperty('font-family', 'inherit', 'important');
    };
    const forcePreviewInherit = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.setProperty('font-family', 'inherit', 'important');
      el.style.setProperty('color', 'inherit', 'important');
    };
    forcePreviewInherit(container.querySelector('.overtype-preview'));
    forceFontInherit(container.querySelector('.overtype-input'));

    // Attach paste handler to internal textarea
    if (instance.textarea && onPasteRef.current) {
      instance.textarea.addEventListener('paste', (e: Event) => {
        onPasteRef.current?.(e as ClipboardEvent);
      });
    }

    // Set initial mode
    applyEditorMode(instance, mode, valueRef.current, autoFocus);

    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync mode changes
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;

    applyEditorMode(instance, mode, valueRef.current, autoFocus);
  }, [mode, autoFocus, value]);

  useEffect(() => {
    const textarea = instanceRef.current?.textarea;
    if (!textarea) return;

    if (mode === 'edit') {
      textarea.dataset.messageEditing = 'true';
    } else {
      delete textarea.dataset.messageEditing;
    }
  }, [mode]);

  // Sync external value changes (avoid cursor jump during typing)
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (instance.getValue() !== value) {
      instance.setValue(value);
      applyEditorMode(instance, mode, value, autoFocus);
    }
  }, [value, mode, autoFocus]);

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
