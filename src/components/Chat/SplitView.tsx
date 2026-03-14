import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import useStore from '@store/store';
import ChatContent from './ChatContent';


const BranchEditorView = React.lazy(
  () => import('@components/BranchEditor/BranchEditorView')
);

const LoadingSpinner = () => (
  <div className='flex items-center justify-center flex-1'>
    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500' />
  </div>
);

interface SplitViewProps {
  direction: 'horizontal' | 'vertical';
}

const SplitView: React.FC<SplitViewProps> = ({ direction }) => {
  const ratio = useStore((state) => state.splitPanelRatio);
  const swapped = useStore((state) => state.splitPanelSwapped);
  const setRatio = useStore((state) => state.setSplitPanelRatio);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newRatio = isHorizontal
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
      setRatio(newRatio);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isHorizontal, setRatio]);

  const handleDoubleClick = useCallback(() => {
    setRatio(0.5);
  }, [setRatio]);

  const firstPercent = `${ratio * 100}%`;
  const secondPercent = `${(1 - ratio) * 100}%`;

  // Sizes are tied to slot position (first/second), content is swapped independently
  const firstContent = swapped ? (
    <Suspense fallback={<LoadingSpinner />}><BranchEditorView /></Suspense>
  ) : (
    <ChatContent />
  );

  const secondContent = swapped ? (
    <ChatContent />
  ) : (
    <Suspense fallback={<LoadingSpinner />}><BranchEditorView /></Suspense>
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 overflow-hidden ${isHorizontal ? 'flex-row' : 'flex-col'}`}
      style={isDragging ? { userSelect: 'none' } : undefined}
    >
      <div
        className='overflow-hidden flex flex-col'
        style={isHorizontal ? { width: firstPercent } : { height: firstPercent }}
      >
        {firstContent}
      </div>
      <div
        className={`relative shrink-0 ${
          isHorizontal
            ? 'w-1.5 cursor-col-resize hover:bg-blue-400/30'
            : 'h-1.5 cursor-row-resize hover:bg-blue-400/30'
        } ${isDragging ? 'bg-blue-400/50' : 'bg-gray-200 dark:bg-gray-700'}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />
      <div
        className='overflow-hidden flex flex-col'
        style={isHorizontal ? { width: secondPercent } : { height: secondPercent }}
      >
        {secondContent}
      </div>
    </div>
  );
};

export default SplitView;
