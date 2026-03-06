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
import { useBranchEditorLayout, MessageNodeData } from './useBranchEditorLayout';
import MessageNode from './nodes/MessageNode';
import NodeContextMenu from './NodeContextMenu';
import BranchDiffModal from './BranchDiffModal';
import { buildPathToLeaf } from '@utils/branchUtils';

const nodeTypes = { messageNode: MessageNode };

const BranchEditorCanvas = ({
  tree,
  chatIndex,
}: {
  tree: BranchTree;
  chatIndex: number;
}) => {
  const switchActivePath = useStore((state) => state.switchActivePath);
  const focusNodeId = useStore((state) => state.branchEditorFocusNodeId);
  const setBranchEditorFocusNodeId = useStore((state) => state.setBranchEditorFocusNodeId);
  const { rfNodes, rfEdges } = useBranchEditorLayout(tree);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  const [diffPaths, setDiffPaths] = useState<{
    pathA: string[];
    pathB: string[];
  } | null>(null);
  const [showDiff, setShowDiff] = useState(false);

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
      const newPath = buildPathToLeaf(tree, node.id);
      switchActivePath(chatIndex, newPath);
    },
    [tree, chatIndex, switchActivePath]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<MessageNodeData>) => {
      event.preventDefault();
      setContextMenu({
        nodeId: node.id,
        x: event.clientX,
        y: event.clientY,
      });
    },
    []
  );

  const handleDiff = useCallback(
    (altPath: string[]) => {
      setDiffPaths({
        pathA: altPath,
        pathB: tree.activePath,
      });
      setShowDiff(true);
    },
    [tree.activePath]
  );

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
            return data.isActive ? '#3b82f6' : '#9ca3af';
          }}
          className='!bg-gray-100 dark:!bg-gray-900'
        />
      </ReactFlow>

      {contextMenu && (
        <NodeContextMenu
          chatIndex={chatIndex}
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDiff={handleDiff}
        />
      )}

      {showDiff && diffPaths && (
        <BranchDiffModal
          chatIndex={chatIndex}
          pathA={diffPaths.pathA}
          pathB={diffPaths.pathB}
          setIsOpen={setShowDiff}
        />
      )}
    </>
  );
};

export default BranchEditorCanvas;
