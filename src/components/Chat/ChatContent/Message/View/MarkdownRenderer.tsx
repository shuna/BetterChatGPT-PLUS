import React, { DetailedHTMLProps, HTMLAttributes, memo, useMemo } from 'react';

import ReactMarkdown from 'react-markdown';
import { CodeProps, ReactMarkdownProps } from 'react-markdown/lib/ast-to-react';

import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';

import { codeLanguageSubset } from '@constants/chat';
import CodeBlock from '../CodeBlock';
import { preprocessLaTeX } from '@utils/chat';

const hasCodeBlockPattern = /^```/m;

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

const rehypePluginsWithHighlight = [
  rehypeKatex,
  [
    rehypeHighlight,
    {
      detect: true,
      ignoreMissing: true,
      subset: codeLanguageSubset,
    },
  ],
] as const;

const rehypePluginsWithoutHighlight = [rehypeKatex] as const;

const MarkdownRenderer = memo(
  ({
    content,
    inlineLatex,
  }: {
    content: string;
    inlineLatex: boolean;
  }) => {
    const rehypePlugins = useMemo(
      () =>
        hasCodeBlockPattern.test(content)
          ? rehypePluginsWithHighlight
          : rehypePluginsWithoutHighlight,
      [content]
    );

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: inlineLatex }],
        ]}
        rehypePlugins={rehypePlugins as any}
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
