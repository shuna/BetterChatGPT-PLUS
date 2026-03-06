import { useMemo } from 'react';
import dagre from 'dagre';
import { BranchTree } from '@type/chat';
import { Node, Edge } from 'reactflow';

const NODE_W = 280;
const NODE_H = 80;

export interface MessageNodeData {
  nodeId: string;
  role: string;
  contentPreview: string;
  label?: string;
  isActive: boolean;
}

export function useBranchEditorLayout(tree: BranchTree | undefined) {
  return useMemo(() => {
    if (!tree || Object.keys(tree.nodes).length === 0) {
      return { rfNodes: [] as Node<MessageNodeData>[], rfEdges: [] as Edge[] };
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

    const rfNodes: Node<MessageNodeData>[] = Object.values(tree.nodes).map(
      (node) => {
        const pos = g.node(node.id);
        const textContent = node.content
          .filter((c) => c.type === 'text')
          .map((c) => (c as any).text || '')
          .join(' ');

        return {
          id: node.id,
          type: 'messageNode',
          position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
          data: {
            nodeId: node.id,
            role: node.role,
            contentPreview:
              textContent.length > 80
                ? textContent.slice(0, 80) + '...'
                : textContent,
            label: node.label,
            isActive: activeSet.has(node.id),
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
          ? { stroke: '#3b82f6', strokeWidth: 2 }
          : { stroke: '#6b7280', strokeWidth: 1 },
      }));

    return { rfNodes, rfEdges };
  }, [tree]);
}
