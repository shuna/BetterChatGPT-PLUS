import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import useStore from '@store/store';
import { BranchTree } from '@type/chat';
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
import { buildPathToLeaf } from '@utils/branchUtils';

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
  const chats = useStore((state) => state.chats);
  const switchActivePath = useStore((state) => state.switchActivePath);
  const focusNodeId = useStore((state) => state.branchEditorFocusNodeId);
  const setBranchEditorFocusNodeId = useStore((state) => state.setBranchEditorFocusNodeId);

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

  const { rfNodes: layoutNodes, rfEdges } = useMultiBranchEditorLayout(entries);

  // Inject conversation header nodes when multi-view
  const rfNodes = React.useMemo(() => {
    if (entries.length <= 1) return layoutNodes;

    const headers: Node[] = [];
    entries.forEach((entry, idx) => {
      // Find the topmost node for this chat
      const chatNodes = layoutNodes.filter(
        (n) => (n.data as MessageNodeData).chatIndex === entry.chatIndex
      );
      if (chatNodes.length === 0) return;
      const minY = Math.min(...chatNodes.map((n) => n.position.y));
      const avgX =
        chatNodes.reduce((sum, n) => sum + n.position.x, 0) / chatNodes.length;
      const color = CONVERSATION_COLORS[idx % CONVERSATION_COLORS.length];

      headers.push({
        id: `header-${entry.chatIndex}`,
        type: 'conversationHeader',
        position: { x: avgX, y: minY - 50 },
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
  }, [layoutNodes, entries]);

  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    chatIndex: number;
    x: number;
    y: number;
  } | null>(null);

  const [diffPaths, setDiffPaths] = useState<{
    pathA: string[];
    pathB: string[];
    chatIndex: number;
  } | null>(null);
  const [showDiff, setShowDiff] = useState(false);

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

  // Focus on a specific node when navigated from chat view
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

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<MessageNodeData>) => {
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;
      const chat = chats?.[nodeChatIndex];
      if (!chat?.branchTree) return;
      const newPath = buildPathToLeaf(chat.branchTree, node.id);
      switchActivePath(nodeChatIndex, newPath);
    },
    [chats, primaryChatIndex, switchActivePath]
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
      if (entries.length <= 1) return;
      dragSourceRef.current = {
        nodeId: node.id,
        chatIndex: node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex,
        originalPos: { ...node.position },
      };
    },
    [entries.length, primaryChatIndex]
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node<MessageNodeData>) => {
      if (!dragSourceRef.current || entries.length <= 1) {
        dragSourceRef.current = null;
        return;
      }

      const source = dragSourceRef.current;
      const nodeChatIndex = node.data.chatIndex >= 0 ? node.data.chatIndex : primaryChatIndex;

      // Check if the node was dragged into a different tree's X range
      // Find which tree column the node's new X position falls in
      let targetEntry: MultiLayoutEntry | null = null;
      let closestTargetNode: Node<MessageNodeData> | null = null;

      for (const entry of entries) {
        if (entry.chatIndex === source.chatIndex) continue;
        // Find nodes belonging to this entry
        const treeNodes = rfNodes.filter(
          (n) => n.type === 'messageNode' && (n.data as MessageNodeData).chatIndex === entry.chatIndex
        );
        if (treeNodes.length === 0) continue;

        const minX = Math.min(...treeNodes.map((n) => n.position.x));
        const maxX = Math.max(...treeNodes.map((n) => n.position.x)) + 280;

        if (node.position.x >= minX - 50 && node.position.x <= maxX + 50) {
          targetEntry = entry;
          // Find the closest node in the target tree (by Y position)
          let minDist = Infinity;
          for (const tn of treeNodes) {
            const dist = Math.abs(tn.position.y - node.position.y);
            if (dist < minDist) {
              minDist = dist;
              closestTargetNode = tn as Node<MessageNodeData>;
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
    [entries, primaryChatIndex, rfNodes, setNodes]
  );

  const handleDropCopy = useCallback(() => {
    if (!dropPopover) return;
    const { sourceNodeId, sourceChatIndex, targetNodeId, targetChatIndex } = dropPopover;
    const sourceChat = chats?.[sourceChatIndex];
    if (!sourceChat?.branchTree) return;
    const path = sourceChat.branchTree.activePath;
    const idx = path.indexOf(sourceNodeId);
    if (idx >= 0) {
      copyBranchSequence(sourceChatIndex, sourceNodeId, path[path.length - 1]);
      pasteBranchSequence(targetChatIndex, targetNodeId);
    }
    setDropPopover(null);
  }, [dropPopover, chats, copyBranchSequence, pasteBranchSequence]);

  const handleDropMove = useCallback(() => {
    if (!dropPopover) return;
    const { sourceNodeId, sourceChatIndex, targetNodeId, targetChatIndex } = dropPopover;
    const sourceChat = chats?.[sourceChatIndex];
    if (!sourceChat?.branchTree) return;
    const path = sourceChat.branchTree.activePath;
    const idx = path.indexOf(sourceNodeId);
    if (idx >= 0) {
      moveBranchSequence(sourceChatIndex, sourceNodeId, path[path.length - 1], targetChatIndex, targetNodeId);
    }
    setDropPopover(null);
  }, [dropPopover, chats, moveBranchSequence]);

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls className='!bg-gray-200 dark:!bg-gray-700 !rounded !shadow-md [&>button]:!bg-transparent [&>button]:!fill-gray-700 [&>button]:dark:!fill-gray-200 [&>button]:!border-gray-300 [&>button]:dark:!border-gray-600' />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as MessageNodeData;
            if (!data.isActive) return '#9ca3af';
            return data.conversationColor || '#3b82f6';
          }}
          className='!bg-gray-100 dark:!bg-gray-900'
        />
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          chatIndex={contextMenu.chatIndex}
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDiff={handleDiff}
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
    </>
  );
};

export default BranchEditorCanvas;
