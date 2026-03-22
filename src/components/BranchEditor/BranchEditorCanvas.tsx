import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
  PanOnScrollMode,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useStore from '@store/store';
import { BranchTree, isSplitView } from '@type/chat';
import {
  useMultiBranchEditorLayout,
  MultiLayoutEntry,
  MessageNodeData,
  CONVERSATION_COLORS,
} from './useBranchEditorLayout';
import MessageNode from './nodes/MessageNode';
import ConversationHeaderNode from './nodes/ConversationHeaderNode';
import NodeContextMenu from './NodeContextMenu';
import BranchDiffModal from './BranchDiffModal';
import MessageDetailModal from './MessageDetailModal';
import { buildPathToLeaf } from '@utils/branchUtils';
import { perfStart, perfEnd } from '@utils/perfTrace';
import BranchSearchBar from './BranchSearchBar';
import { useTranslation } from 'react-i18next';

const UndoRedoControls = () => {
  const canUndo = useStore((state) => state.branchHistoryPast.length > 0);
  const canRedo = useStore((state) => state.branchHistoryFuture.length > 0);
  const undoBranch = useStore((state) => state.undoBranch);
  const redoBranch = useStore((state) => state.redoBranch);

  const btnBase = 'w-[26px] h-[26px] flex items-center justify-center border-gray-300 dark:border-gray-600';

  return (
    <div className='react-flow__panel !bg-gray-200 dark:!bg-gray-700 !rounded !shadow-md' style={{ position: 'absolute', left: 0, bottom: 116 }}>
      <button
        className={`${btnBase} ${
          canUndo ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600' : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
        onClick={undoBranch}
        disabled={!canUndo}
        title='Undo'
      >
        <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M3 10h13a4 4 0 0 1 0 8H7' />
          <path d='M3 10l4-4M3 10l4 4' />
        </svg>
      </button>
      <button
        className={`${btnBase} border-t ${
          canRedo ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600' : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
        onClick={redoBranch}
        disabled={!canRedo}
        title='Redo'
      >
        <svg className='w-3 h-3' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M21 10H8a4 4 0 0 0 0 8h10' />
          <path d='M21 10l-4-4M21 10l-4 4' />
        </svg>
      </button>
    </div>
  );
};

const ConversationEditMenu = ({ entries }: { entries: MultiLayoutEntry[] }) => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const pruneHiddenNodes = useStore((state) => state.pruneHiddenNodes);
  const isSearchOpen = useStore((state) => state.isSearchOpen);
  const toggleSearch = useStore((state) => state.toggleSearch);
  const canUndo = useStore((state) => state.branchHistoryPast.length > 0);
  const canRedo = useStore((state) => state.branchHistoryFuture.length > 0);
  const undoBranch = useStore((state) => state.undoBranch);
  const redoBranch = useStore((state) => state.redoBranch);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = React.useState({ left: 0, top: 0 });

  const hasHiddenNodes = React.useMemo(() => {
    return entries.some((entry) => {
      const activeSet = new Set(entry.tree.activePath);
      return Object.keys(entry.tree.nodes).some((id) => !activeSet.has(id));
    });
  }, [entries]);

  const handlePrune = React.useCallback(() => {
    entries.forEach((entry) => {
      const activeSet = new Set(entry.tree.activePath);
      const hasHidden = Object.keys(entry.tree.nodes).some((id) => !activeSet.has(id));
      if (hasHidden) {
        pruneHiddenNodes(entry.chatIndex);
      }
    });
    setConfirming(false);
    setOpen(false);
  }, [entries, pruneHiddenNodes]);

  const btnBase = 'w-[35px] h-[35px] flex items-center justify-center border-gray-300 dark:border-gray-600';

  return (
    <>
      <div className='react-flow__panel !bg-gray-200 dark:!bg-gray-700 !rounded-lg !shadow-md' style={{ position: 'absolute', left: 0, top: 4 }}>
        <button
          className={`${btnBase} text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600`}
          ref={btnRef}
          onClick={() => {
            if (!open && btnRef.current) {
              const rect = btnRef.current.getBoundingClientRect();
              setMenuPos({ left: rect.right + 4, top: rect.top });
            }
            setOpen((v) => !v);
          }}
          title='会話編集メニュー'
        >
          <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
            <circle cx='12' cy='5' r='1' fill='currentColor' />
            <circle cx='12' cy='12' r='1' fill='currentColor' />
            <circle cx='12' cy='19' r='1' fill='currentColor' />
          </svg>
        </button>
      </div>

      {open && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => { setOpen(false); setConfirming(false); }} />
          <div
            className='fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[200px]'
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            {!confirming ? (
              <>
                <div className='px-4 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider'>{t('branchEditorMenu.view')}</div>
                <button
                  className='w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2'
                  onClick={() => {
                    toggleSearch();
                    setOpen(false);
                  }}
                >
                  <svg className='w-3.5 h-3.5 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' style={{ visibility: isSearchOpen ? 'visible' : 'hidden' }}>
                    <path d='M5 13l4 4L19 7' />
                  </svg>
                  {t('branchEditorMenu.nodeSearch')}
                </button>
                <div className='my-1 border-t border-gray-200 dark:border-gray-700' />
                <div className='px-4 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider'>{t('branchEditorMenu.edit')}</div>
                <button
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                    hasHiddenNodes
                      ? 'text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={() => hasHiddenNodes && setConfirming(true)}
                  disabled={!hasHiddenNodes}
                >
                  <span className='w-3.5 flex-shrink-0' />
                  {t('branchEditorMenu.pruneHiddenNodes')}
                </button>
                <div className='ml-8 my-1 border-t border-gray-200 dark:border-gray-700' />
                <button
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                    canUndo
                      ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={() => { if (canUndo) { undoBranch(); setOpen(false); } }}
                  disabled={!canUndo}
                >
                  <span className='w-3.5 flex-shrink-0' />
                  {t('branchEditorMenu.undo')}
                </button>
                <div className='ml-8 my-1 border-t border-gray-200 dark:border-gray-700' />
                <button
                  className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                    canRedo
                      ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                  onClick={() => { if (canRedo) { redoBranch(); setOpen(false); } }}
                  disabled={!canRedo}
                >
                  <span className='w-3.5 flex-shrink-0' />
                  {t('branchEditorMenu.redo')}
                </button>
              </>
            ) : (
              <div className='px-4 py-2'>
                <p className='text-sm text-gray-700 dark:text-gray-300 mb-2'>
                  {t('branchEditorMenu.pruneConfirm')}
                </p>
                <div className='flex gap-2'>
                  <button
                    className='px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700'
                    onClick={handlePrune}
                  >
                    削除
                  </button>
                  <button
                    className='px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500'
                    onClick={() => setConfirming(false)}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

const nodeTypes = {
  messageNode: MessageNode,
  conversationHeader: ConversationHeaderNode,
};

const BranchEditorCanvas = ({
  chatIndices,
  primaryChatIndex,
}: {
  chatIndices: number[];
  primaryChatIndex: number;
}) => {
  const pageDragLockCountRef = useRef(0);
  const touchMoveBlockerRef = useRef<((event: TouchEvent) => void) | null>(null);
  const chats = useStore((state) => state.chats);
  const isSearchOpen = useStore((state) => state.isSearchOpen);
  const openSearch = useStore((state) => state.openSearch);
  const closeSearch = useStore((state) => state.closeSearch);
  const switchActivePath = useStore((state) => state.switchActivePath);
  const focusNodeId = useStore((state) => state.branchEditorFocusNodeId);
  const setBranchEditorFocusNodeId = useStore((state) => state.setBranchEditorFocusNodeId);
  const setCurrentChatIndex = useStore((state) => state.setCurrentChatIndex);
  const setChatActiveView = useStore((state) => state.setChatActiveView);
  const ensureBranchTree = useStore((state) => state.ensureBranchTree);
  const setPendingChatFocus = useStore((state) => state.setPendingChatFocus);

  const lockPageDragBounce = useCallback(() => {
    pageDragLockCountRef.current += 1;
    if (pageDragLockCountRef.current > 1) return;

    const html = document.documentElement;
    const body = document.body;
    html.classList.add('page-drag-lock');
    body.classList.add('page-drag-lock');

    const blocker = (event: TouchEvent) => {
      if (event.touches.length <= 1) {
        event.preventDefault();
      }
    };

    touchMoveBlockerRef.current = blocker;
    window.addEventListener('touchmove', blocker, { passive: false });
  }, []);

  const unlockPageDragBounce = useCallback(() => {
    pageDragLockCountRef.current = Math.max(0, pageDragLockCountRef.current - 1);
    if (pageDragLockCountRef.current > 0) return;

    const html = document.documentElement;
    const body = document.body;
    html.classList.remove('page-drag-lock');
    body.classList.remove('page-drag-lock');

    if (touchMoveBlockerRef.current) {
      window.removeEventListener('touchmove', touchMoveBlockerRef.current);
      touchMoveBlockerRef.current = null;
    }
  }, []);

  // Build layout entries from chat indices (memoized to avoid re-renders)
  const entries: MultiLayoutEntry[] = React.useMemo(() =>
    chatIndices
      .map((idx) => {
        const chat = chats?.[idx];
        if (!chat?.branchTree) return null;
        return {
          chatIndex: idx,
          chatId: chat.id,
          chatTitle: chat.title,
          tree: chat.branchTree,
        };
      })
      .filter((e): e is MultiLayoutEntry => e !== null),
    [chatIndices, chats]
  );

  React.useLayoutEffect(() => {
    perfStart('branch-editor-switch');
  }, [chatIndices]);
  React.useEffect(() => {
    perfEnd('branch-editor-switch');
  }, [chatIndices]);

  useEffect(() => {
    return () => {
      pageDragLockCountRef.current = 1;
      unlockPageDragBounce();
    };
  }, [unlockPageDragBounce]);

  const { rfNodes: layoutNodes, rfEdges, isComputing } = useMultiBranchEditorLayout(entries);

  // Build per-chat node index (single O(N) pass) for header generation and drag detection
  const chatNodeIndex = React.useMemo(() => {
    const index = new Map<number, {
      nodes: Node<MessageNodeData>[];
      minX: number;
      maxX: number;
      minY: number;
      avgX: number;
    }>();
    for (const node of layoutNodes) {
      if (node.type !== 'messageNode') continue;
      const ci = (node.data as MessageNodeData).chatIndex;
      let entry = index.get(ci);
      if (!entry) {
        entry = { nodes: [], minX: Infinity, maxX: -Infinity, minY: Infinity, avgX: 0 };
        index.set(ci, entry);
      }
      entry.nodes.push(node as Node<MessageNodeData>);
      if (node.position.x < entry.minX) entry.minX = node.position.x;
      if (node.position.x > entry.maxX) entry.maxX = node.position.x;
      if (node.position.y < entry.minY) entry.minY = node.position.y;
    }
    for (const e of index.values()) {
      e.avgX = e.nodes.reduce((s, n) => s + n.position.x, 0) / e.nodes.length;
    }
    return index;
  }, [layoutNodes]);

  // Inject conversation header nodes when multi-view
  const rfNodes = React.useMemo(() => {
    if (entries.length <= 1) return layoutNodes;

    const headers: Node[] = [];
    entries.forEach((entry, idx) => {
      const stats = chatNodeIndex.get(entry.chatIndex);
      if (!stats || stats.nodes.length === 0) return;
      const color = CONVERSATION_COLORS[idx % CONVERSATION_COLORS.length];

      headers.push({
        id: `header-${entry.chatIndex}`,
        type: 'conversationHeader',
        position: { x: stats.avgX, y: stats.minY - 50 },
        data: {
          chatIndex: entry.chatIndex,
          chatTitle: entry.chatTitle,
          conversationColor: color.stroke,
        },
        draggable: false,
        selectable: false,
      });
    });

    return [...headers, ...layoutNodes];
  }, [layoutNodes, entries, chatNodeIndex]);

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    chatIndex: number;
    x: number;
    y: number;
  } | null>(null);

  const [selectedNodeForModal, setSelectedNodeForModal] = useState<{
    nodeId: string;
    chatIndex: number;
  } | null>(null);

  const [diffPaths, setDiffPaths] = useState<{
    pathA: string[];
    pathB: string[];
    chatIndex: number;
  } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ctrl+F / Cmd+F handler — only when branch editor container has focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (!containerRef.current?.contains(document.activeElement) &&
            document.activeElement !== containerRef.current) return;
        e.preventDefault();
        if (isSearchOpen) closeSearch();
        else openSearch();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isSearchOpen, openSearch, closeSearch]);

  // Cross-conversation drag state
  const copyBranchSequence = useStore((state) => state.copyBranchSequence);
  const pasteBranchSequence = useStore((state) => state.pasteBranchSequence);
  const moveBranchSequence = useStore((state) => state.moveBranchSequence);

  const dragSourceRef = useRef<{
    nodeId: string;
    chatIndex: number;
    originalPos: { x: number; y: number };
  } | null>(null);

  const [dropPopover, setDropPopover] = useState<{
    sourceNodeId: string;
    sourceChatIndex: number;
    targetNodeId: string;
    targetChatIndex: number;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [rfNodes, rfEdges, setNodes, setEdges]);

  // Focus on a specific node (always honors explicit requests;
  // branchEditorSyncEnabled only gates automatic chat-hover navigation,
  // which is already guarded in Message.tsx click handler)
  useEffect(() => {
    if (focusNodeId && reactFlowInstance.current) {
      const targetNode = rfNodes.find((n) => n.id === focusNodeId);
      if (targetNode) {
        reactFlowInstance.current.setCenter(
          targetNode.position.x + 140,
          targetNode.position.y + 40,
          { zoom: 1.2, duration: 400 }
        );
      }
      setBranchEditorFocusNodeId(null);
    }
  }, [focusNodeId, rfNodes, setBranchEditorFocusNodeId]);

  // Listen for menu button clicks from MessageNode
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, chatIndex, x, y } = (e as CustomEvent).detail;
      setContextMenu({ nodeId, chatIndex, x, y });
    };
    document.addEventListener('node-menu-click', handler);
    return () => document.removeEventListener('node-menu-click', handler);
  }, []);

  const navigateToChat = useCallback(
    (chatIndex: number, nodeId: string) => {
      ensureBranchTree(chatIndex);
      const chat = chats?.[chatIndex];
      if (chat?.branchTree) {
        const newPath = buildPathToLeaf(chat.branchTree, nodeId);
        switchActivePath(chatIndex, newPath);
      }
      setCurrentChatIndex(chatIndex);
      const currentView = useStore.getState().chatActiveView;
      if (!isSplitView(currentView)) {
        setChatActiveView('chat');
      }
      setPendingChatFocus({ chatIndex, nodeId });
    },
    [chats, ensureBranchTree, switchActivePath, setCurrentChatIndex, setChatActiveView, setPendingChatFocus]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<MessageNodeData>) => {
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;
      const chat = chats?.[nodeChatIndex];
      if (!chat?.branchTree) return;
      const newPath = buildPathToLeaf(chat.branchTree, node.id);
      switchActivePath(nodeChatIndex, newPath);

      // Header click → navigate to chat, content click → open modal
      const target = event.target as HTMLElement;
      if (target.closest('[data-node-header]')) {
        navigateToChat(nodeChatIndex, node.id);
      } else {
        setSelectedNodeForModal({ nodeId: node.id, chatIndex: nodeChatIndex });
      }
    },
    [chats, primaryChatIndex, switchActivePath, navigateToChat]
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<MessageNodeData>) => {
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;
      navigateToChat(nodeChatIndex, node.id);
    },
    [primaryChatIndex, navigateToChat]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<MessageNodeData>) => {
      event.preventDefault();
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;
      setContextMenu({
        nodeId: node.id,
        chatIndex: nodeChatIndex,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [primaryChatIndex]
  );

  const handleDiff = useCallback(
    (altPath: string[]) => {
      const chatIndex = contextMenu?.chatIndex ?? primaryChatIndex;
      const chat = chats?.[chatIndex];
      if (!chat?.branchTree) return;
      setDiffPaths({
        pathA: altPath,
        pathB: chat.branchTree.activePath,
        chatIndex,
      });
      setShowDiff(true);
    },
    [contextMenu, chats, primaryChatIndex]
  );

  // Cross-conversation drag handlers
  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node<MessageNodeData>) => {
      lockPageDragBounce();
      if (entries.length <= 1) return;
      dragSourceRef.current = {
        nodeId: node.id,
        chatIndex: node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex,
        originalPos: { ...node.position },
      };
    },
    [entries.length, lockPageDragBounce, primaryChatIndex]
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node<MessageNodeData>) => {
      unlockPageDragBounce();
      if (!dragSourceRef.current || entries.length <= 1) {
        dragSourceRef.current = null;
        return;
      }

      const source = dragSourceRef.current;
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;

      // Check if the node was dragged into a different tree's X range
      let targetEntry: MultiLayoutEntry | null = null;
      let closestTargetNode: Node<MessageNodeData> | null = null;

      for (const entry of entries) {
        if (entry.chatIndex === source.chatIndex) continue;
        const stats = chatNodeIndex.get(entry.chatIndex);
        if (!stats || stats.nodes.length === 0) continue;

        if (node.position.x >= stats.minX - 50 && node.position.x <= stats.maxX + 280 + 50) {
          targetEntry = entry;
          // Find the closest node in the target tree (by Y position)
          let minDist = Infinity;
          for (const tn of stats.nodes) {
            const dist = Math.abs(tn.position.y - node.position.y);
            if (dist < minDist) {
              minDist = dist;
              closestTargetNode = tn;
            }
          }
          break;
        }
      }

      // Reset node position
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, position: source.originalPos }
            : n
        )
      );

      if (targetEntry && closestTargetNode) {
        setDropPopover({
          sourceNodeId: source.nodeId,
          sourceChatIndex: source.chatIndex,
          targetNodeId: closestTargetNode.id,
          targetChatIndex: targetEntry.chatIndex,
          x: event.clientX,
          y: event.clientY,
        });
      }

      dragSourceRef.current = null;
    },
    [entries, primaryChatIndex, chatNodeIndex, setNodes, unlockPageDragBounce]
  );

  const handleDropCopy = useCallback(() => {
    if (!dropPopover) return;
    const { sourceNodeId, sourceChatIndex, targetNodeId, targetChatIndex } = dropPopover;
    const sourceChat = chats?.[sourceChatIndex];
    if (!sourceChat?.branchTree) return;
    const path = buildPathToLeaf(sourceChat.branchTree, sourceNodeId);
    const leafId = path[path.length - 1];
    copyBranchSequence(sourceChatIndex, sourceNodeId, leafId);
    pasteBranchSequence(targetChatIndex, targetNodeId);
    setDropPopover(null);
  }, [dropPopover, chats, copyBranchSequence, pasteBranchSequence]);

  const handleDropMove = useCallback(() => {
    if (!dropPopover) return;
    const { sourceNodeId, sourceChatIndex, targetNodeId, targetChatIndex } = dropPopover;
    const sourceChat = chats?.[sourceChatIndex];
    if (!sourceChat?.branchTree) return;
    const path = buildPathToLeaf(sourceChat.branchTree, sourceNodeId);
    const leafId = path[path.length - 1];
    moveBranchSequence(sourceChatIndex, sourceNodeId, leafId, targetChatIndex, targetNodeId);
    setDropPopover(null);
  }, [dropPopover, chats, moveBranchSequence]);

  return (
    <div ref={containerRef} className='relative w-full h-full' tabIndex={-1}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onMoveStart={lockPageDragBounce}
        onMoveEnd={unlockPageDragBounce}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        zoomActivationKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
      >
        <Background className='!bg-white dark:!bg-gray-800' />
        <UndoRedoControls />
        {isSearchOpen && <BranchSearchBar entries={entries} />}
        <ConversationEditMenu entries={entries} />
        <Controls className='!bg-gray-200 dark:!bg-gray-700 !rounded !shadow-md [&>button]:!bg-transparent [&>button]:!fill-gray-700 [&>button]:dark:!fill-gray-200 [&>button]:!border-gray-300 [&>button]:dark:!border-gray-600' />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as MessageNodeData;
            if (!data.isActive) return '#6b7280';
            return data.conversationColor || '#3b82f6';
          }}
          pannable
          zoomable
          className='!bg-gray-400 dark:!bg-gray-900'
        />
      </ReactFlow>

      {selectedNodeForModal && (
        <MessageDetailModal
          chatIndex={selectedNodeForModal.chatIndex}
          nodeId={selectedNodeForModal.nodeId}
          onClose={() => setSelectedNodeForModal(null)}
        />
      )}

      {contextMenu && (
        <NodeContextMenu
          chatIndex={contextMenu.chatIndex}
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDiff={handleDiff}
          onNavigateToChat={navigateToChat}
        />
      )}

      {showDiff && diffPaths && (
        <BranchDiffModal
          chatIndex={diffPaths.chatIndex}
          pathA={diffPaths.pathA}
          pathB={diffPaths.pathB}
          setIsOpen={setShowDiff}
        />
      )}

      {isComputing && (
        <div className='absolute inset-0 z-30 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 pointer-events-none'>
          <div className='flex flex-col items-center gap-2'>
            <svg className='animate-spin h-8 w-8 text-blue-500' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
              <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
              <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z' />
            </svg>
            <span className='text-sm text-gray-600 dark:text-gray-300'>レイアウト計算中...</span>
          </div>
        </div>
      )}

      {dropPopover && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setDropPopover(null)} />
          <div
            className='fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]'
            style={{ left: dropPopover.x, top: dropPopover.y }}
          >
            <button
              className='w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
              onClick={handleDropCopy}
            >
              ここにコピー
            </button>
            <button
              className='w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700'
              onClick={handleDropMove}
            >
              ここに移動
            </button>
            <button
              className='w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              onClick={() => setDropPopover(null)}
            >
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BranchEditorCanvas;
