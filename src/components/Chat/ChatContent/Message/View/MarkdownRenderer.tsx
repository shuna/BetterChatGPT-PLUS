import React, { DetailedHTMLProps, HTMLAttributes, memo, useLayoutEffect, useRef } from 'react';

import ReactMarkdown from 'react-markdown';
import { CodeProps, ReactMarkdownProps } from 'react-markdown/lib/ast-to-react';

import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';

import { codeLanguageSubset } from '@constants/chat';
import CodeBlock from '../CodeBlock';
import { preprocessLaTeX } from '@utils/chat';

const code = memo((props: CodeProps) => {
  const { inline, className, children } = props;
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return <CodeBlock lang={lang || 'text'} codeChildren={children} />;
  }
});

const p = memo(
  (
    props?: Omit<
      DetailedHTMLProps<
        HTMLAttributes<HTMLParagraphElement>,
        HTMLParagraphElement
      >,
      'ref'
    > &
      ReactMarkdownProps
  ) => {
    return <p className='whitespace-pre-wrap'>{props?.children}</p>;
  }
);

const MarkdownRenderer = memo(
  ({
    content,
    inlineLatex,
  }: {
    content: string;
    inlineLatex: boolean;
  }) => {
    const renderStartRef = useRef(performance.now());
    renderStartRef.current = performance.now();

    useLayoutEffect(() => {
      const elapsed = performance.now() - renderStartRef.current;
      if (elapsed > 5) {
        console.log(`[perf] MarkdownRenderer render+commit: ${elapsed.toFixed(2)}ms (content length=${content.length})`);
      }
    });

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: inlineLatex }],
        ]}
        rehypePlugins={[
          rehypeKatex,
          [
            rehypeHighlight,
            {
              detect: true,
              ignoreMissing: true,
              subset: codeLanguageSubset,
            },
          ],
        ]}
        linkTarget='_new'
        components={{
          code,
          p,
        }}
      >
        {inlineLatex ? preprocessLaTeX(content) : content}
      </ReactMarkdown>
    );
  }
);

export default MarkdownRenderer;
