import { useMemo } from 'react';
import dagre from 'dagre';
import { BranchTree } from '@type/chat';
import { Node, Edge } from 'reactflow';

const NODE_W = 280;
const NODE_H = 80;
const TREE_GAP = 120;

// Color hues for multi-view conversations
export const CONVERSATION_COLORS = [
  { hue: 210, stroke: '#3b82f6', label: 'blue' },    // blue
  { hue: 150, stroke: '#14b8a6', label: 'teal' },    // teal
  { hue: 30,  stroke: '#f97316', label: 'orange' },   // orange
  { hue: 300, stroke: '#a855f7', label: 'purple' },   // purple
];

export interface MessageNodeData {
  nodeId: string;
  role: string;
  contentPreview: string;
  label?: string;
  isActive: boolean;
  chatIndex: number;
  colorHue: number;
  conversationColor: string;
}

export interface MultiLayoutEntry {
  chatIndex: number;
  chatId: string;
  chatTitle: string;
  tree: BranchTree;
}

function layoutSingleTree(
  tree: BranchTree,
  xOffset: number,
  chatIndex: number,
  colorIdx: number
): { rfNodes: Node<MessageNodeData>[]; rfEdges: Edge[]; maxX: number } {
  if (Object.keys(tree.nodes).length === 0) {
    return { rfNodes: [], rfEdges: [], maxX: xOffset };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  Object.values(tree.nodes).forEach((node) => {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  });

  Object.values(tree.nodes).forEach((node) => {
    if (node.parentId) g.setEdge(node.parentId, node.id);
  });

  dagre.layout(g);

  const activeSet = new Set(tree.activePath);
  const color = CONVERSATION_COLORS[colorIdx % CONVERSATION_COLORS.length];

  let maxX = xOffset;

  const rfNodes: Node<MessageNodeData>[] = Object.values(tree.nodes).map(
    (node) => {
      const pos = g.node(node.id);
      const x = pos.x - NODE_W / 2 + xOffset;
      const y = pos.y - NODE_H / 2;
      if (x + NODE_W > maxX) maxX = x + NODE_W;

      const textContent = node.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as any).text || '')
        .join(' ');

      return {
        id: node.id,
        type: 'messageNode',
        position: { x, y },
        data: {
          nodeId: node.id,
          role: node.role,
          contentPreview:
            textContent.length > 80
              ? textContent.slice(0, 80) + '...'
              : textContent,
          label: node.label,
          isActive: activeSet.has(node.id),
          chatIndex,
          colorHue: color.hue,
          conversationColor: color.stroke,
        },
      };
    }
  );

  const rfEdges: Edge[] = Object.values(tree.nodes)
    .filter((n) => n.parentId)
    .map((n) => ({
      id: `${n.parentId}-${n.id}`,
      source: n.parentId!,
      target: n.id,
      style: activeSet.has(n.id)
        ? { stroke: color.stroke, strokeWidth: 2 }
        : { stroke: '#6b7280', strokeWidth: 1 },
    }));

  return { rfNodes, rfEdges, maxX };
}

export function useBranchEditorLayout(tree: BranchTree | undefined) {
  const entries = useMemo(
    () => tree ? [{ chatIndex: -1, chatId: '', chatTitle: '', tree }] : [],
    [tree]
  );
  return useMultiBranchEditorLayout(entries);
}

export function useMultiBranchEditorLayout(entries: MultiLayoutEntry[]) {
  // Build a stable dependency key
  const depsKey = entries.map((e) => `${e.chatIndex}:${Object.keys(e.tree.nodes).length}:${e.tree.activePath.join('|')}`).join(';');

  return useMemo(() => {
    if (entries.length === 0) {
      return { rfNodes: [] as Node<MessageNodeData>[], rfEdges: [] as Edge[] };
    }

    const allNodes: Node<MessageNodeData>[] = [];
    const allEdges: Edge[] = [];
    let xOffset = 0;

    entries.forEach((entry, idx) => {
      const { rfNodes, rfEdges, maxX } = layoutSingleTree(
        entry.tree,
        xOffset,
        entry.chatIndex,
        idx
      );
      allNodes.push(...rfNodes);
      allEdges.push(...rfEdges);
      xOffset = maxX + TREE_GAP;
    });

    return { rfNodes: allNodes, rfEdges: allEdges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);
}
