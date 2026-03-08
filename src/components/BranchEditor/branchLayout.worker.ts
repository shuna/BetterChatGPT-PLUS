import dagre from 'dagre';

const NODE_W = 280;
const NODE_H = 80;
const TREE_GAP = 120;

const CONVERSATION_COLORS = [
  { hue: 210, stroke: '#3b82f6' },
  { hue: 150, stroke: '#14b8a6' },
  { hue: 30, stroke: '#f97316' },
  { hue: 300, stroke: '#a855f7' },
];

interface ContentEntry {
  content: Array<{ type: string; text?: string; [k: string]: unknown }>;
  refCount: number;
}

type ContentStoreData = Record<string, ContentEntry>;

interface SerializedNode {
  id: string;
  parentId: string | null;
  role: string;
  contentHash: string;
  label?: string;
}

interface SerializedEntry {
  chatIndex: number;
  chatId: string;
  chatTitle: string;
  nodes: Record<string, SerializedNode>;
  activePath: string[];
}

export interface WorkerInput {
  requestId: number;
  entries: SerializedEntry[];
  contentStore: ContentStoreData;
}

export interface PlainNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    nodeId: string;
    role: string;
    contentPreview: string;
    label?: string;
    isActive: boolean;
    chatIndex: number;
    colorHue: number;
    conversationColor: string;
  };
}

export interface PlainEdge {
  id: string;
  source: string;
  target: string;
  style: { stroke: string; strokeWidth: number };
}

export interface WorkerOutput {
  requestId: number;
  rfNodes: PlainNode[];
  rfEdges: PlainEdge[];
}

function resolveContentPreview(
  store: ContentStoreData,
  hash: string
): string {
  const entry = store[hash];
  if (!entry) return '';
  const texts: string[] = [];
  for (const c of entry.content) {
    if (c.text !== undefined) texts.push(c.text);
  }
  const joined = texts.join(' ');
  return joined.length > 80 ? joined.slice(0, 80) + '...' : joined;
}

function layoutSingleTree(
  nodes: Record<string, SerializedNode>,
  activePath: string[],
  xOffset: number,
  chatIndex: number,
  colorIdx: number,
  contentStore: ContentStoreData
): { rfNodes: PlainNode[]; rfEdges: PlainEdge[]; maxX: number } {
  const nodeValues = Object.values(nodes);
  if (nodeValues.length === 0) {
    return { rfNodes: [], rfEdges: [], maxX: xOffset };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodeValues) {
    g.setNode(node.id, { width: NODE_W, height: NODE_H });
  }
  for (const node of nodeValues) {
    if (node.parentId) g.setEdge(node.parentId, node.id);
  }

  dagre.layout(g);

  const activeSet = new Set(activePath);
  const color = CONVERSATION_COLORS[colorIdx % CONVERSATION_COLORS.length];
  let maxX = xOffset;

  const rfNodes: PlainNode[] = nodeValues.map((node) => {
    const pos = g.node(node.id);
    const x = pos.x - NODE_W / 2 + xOffset;
    const y = pos.y - NODE_H / 2;
    if (x + NODE_W > maxX) maxX = x + NODE_W;

    return {
      id: node.id,
      type: 'messageNode',
      position: { x, y },
      data: {
        nodeId: node.id,
        role: node.role,
        contentPreview: resolveContentPreview(contentStore, node.contentHash),
        label: node.label,
        isActive: activeSet.has(node.id),
        chatIndex,
        colorHue: color.hue,
        conversationColor: color.stroke,
      },
    };
  });

  const rfEdges: PlainEdge[] = nodeValues
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

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { requestId, entries, contentStore } = e.data;

  const allNodes: PlainNode[] = [];
  const allEdges: PlainEdge[] = [];
  let xOffset = 0;

  entries.forEach((entry, idx) => {
    const { rfNodes, rfEdges, maxX } = layoutSingleTree(
      entry.nodes,
      entry.activePath,
      xOffset,
      entry.chatIndex,
      idx,
      contentStore
    );
    allNodes.push(...rfNodes);
    allEdges.push(...rfEdges);
    xOffset = maxX + TREE_GAP;
  });

  const result: WorkerOutput = { requestId, rfNodes: allNodes, rfEdges: allEdges };
  self.postMessage(result);
};
