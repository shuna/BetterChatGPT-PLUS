import { useEffect, useMemo, useRef, useState } from 'react';
import { BranchTree, isTextContent } from '@type/chat';
import { Node, Edge } from 'reactflow';
import useStore from '@store/store';
import type { ContentStoreData } from '@utils/contentStore';
import type { WorkerInput, WorkerOutput } from './branchLayout.worker';
import { perfStart, perfEnd } from '@utils/perfTrace';

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

const EMPTY_NODES: Node<MessageNodeData>[] = [];
const EMPTY_EDGES: Edge[] = [];

let nextRequestId = 0;

function resolveContentPreview(
  contentStore: ContentStoreData,
  hash: string
): string {
  const entry = contentStore[hash];
  if (!entry) return '';
  const texts: string[] = [];
  for (const content of entry.content) {
    if (isTextContent(content)) texts.push(content.text);
  }
  const joined = texts.join(' ');
  return joined.length > 80 ? `${joined.slice(0, 80)}...` : joined;
}

export function useBranchEditorLayout(tree: BranchTree | undefined) {
  const entries = useMemo(
    () => tree ? [{ chatIndex: -1, chatId: '', chatTitle: '', tree }] : [],
    [tree]
  );
  return useMultiBranchEditorLayout(entries);
}

export function useMultiBranchEditorLayout(entries: MultiLayoutEntry[]) {
  const contentStore = useStore((state) => state.contentStore);
  const [layoutNodes, setLayoutNodes] = useState<Node<MessageNodeData>[]>(EMPTY_NODES);
  const [layoutEdges, setLayoutEdges] = useState<Edge[]>(EMPTY_EDGES);
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latestRequestRef = useRef<number>(0);

  // Layout only depends on graph structure. Content previews and active styling are derived locally.
  const layoutKey = useMemo(
    () => entries.map((entry) => {
      const nodeKeys = Object.values(entry.tree.nodes)
        .map((node) => `${node.id}:${node.parentId ?? ''}:${node.role}:${node.label ?? ''}`)
        .sort()
        .join(',');
      return `${entry.chatIndex}:${nodeKeys}`;
    }).join(';'),
    [entries]
  );

  const layoutEntries = useMemo(
    () => entries.map((entry) => ({
      chatIndex: entry.chatIndex,
      chatId: entry.chatId,
      chatTitle: entry.chatTitle,
      nodes: entry.tree.nodes as WorkerInput['entries'][0]['nodes'],
    })),
    [layoutKey]
  );

  useEffect(() => {
    if (layoutEntries.length === 0) {
      setLayoutNodes(EMPTY_NODES);
      setLayoutEdges(EMPTY_EDGES);
      setIsComputing(false);
      return;
    }

    // Lazily create worker
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('./branchLayout.worker.ts', import.meta.url),
        { type: 'module' }
      );
    }

    const worker = workerRef.current;
    const requestId = ++nextRequestId;
    latestRequestRef.current = requestId;

    const input: WorkerInput = {
      requestId,
      entries: layoutEntries.map((entry) => ({
        chatIndex: entry.chatIndex,
        chatId: entry.chatId,
        chatTitle: entry.chatTitle,
        nodes: entry.nodes,
        activePath: [],
      })),
      contentStore: {},
    };

    setIsComputing(true);
    perfStart('layout-worker-roundtrip');
    const toastTimer = setTimeout(() => {
      const store = useStore.getState();
      store.setToastMessage('レイアウト計算に時間がかかっています...');
      store.setToastStatus('warning');
      store.setToastShow(true);
    }, 3000);

    worker.onmessage = (e: MessageEvent<WorkerOutput>) => {
      // Ignore stale responses
      if (e.data.requestId !== latestRequestRef.current) return;
      clearTimeout(toastTimer);
      perfEnd('layout-worker-roundtrip');
      setIsComputing(false);
      setLayoutNodes(e.data.rfNodes as Node<MessageNodeData>[]);
      setLayoutEdges(e.data.rfEdges as Edge[]);
    };

    worker.onerror = () => {
      clearTimeout(toastTimer);
      setIsComputing(false);
      const store = useStore.getState();
      store.setToastMessage('レイアウト計算に失敗しました');
      store.setToastStatus('error');
      store.setToastShow(true);
    };

    worker.postMessage(input);

    return () => { clearTimeout(toastTimer); };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutEntries, layoutKey]);

  const rfNodes = useMemo(() => {
    if (layoutNodes.length === 0) return EMPTY_NODES;

    const entryByChatIndex = new Map(entries.map((entry, index) => [entry.chatIndex, { entry, index }] as const));

    return layoutNodes.map((node) => {
      const mapped = entryByChatIndex.get(node.data.chatIndex);
      if (!mapped) return node;

      const sourceNode = mapped.entry.tree.nodes[node.id];
      if (!sourceNode) return node;

      const color = CONVERSATION_COLORS[mapped.index % CONVERSATION_COLORS.length];
      return {
        ...node,
        data: {
          ...node.data,
          contentPreview: resolveContentPreview(contentStore, sourceNode.contentHash),
          label: sourceNode.label,
          role: sourceNode.role,
          isActive: mapped.entry.tree.activePath.includes(node.id),
          colorHue: color.hue,
          conversationColor: color.stroke,
        },
      };
    });
  }, [contentStore, entries, layoutNodes]);

  const rfEdges = useMemo(() => {
    if (layoutEdges.length === 0) return EMPTY_EDGES;

    const activeByChatIndex = new Map(entries.map((entry, index) => [
      entry.chatIndex,
      {
        activeSet: new Set(entry.tree.activePath),
        color: CONVERSATION_COLORS[index % CONVERSATION_COLORS.length].stroke,
      },
    ] as const));

    const nodeChatIndex = new Map(rfNodes.map((node) => [node.id, node.data.chatIndex] as const));

    return layoutEdges.map((edge) => {
      const chatIndex = nodeChatIndex.get(edge.target);
      if (chatIndex === undefined) return edge;

      const active = activeByChatIndex.get(chatIndex);
      if (!active) return edge;

      return {
        ...edge,
        style: active.activeSet.has(edge.target)
          ? { stroke: active.color, strokeWidth: 2 }
          : { stroke: '#6b7280', strokeWidth: 1 },
      };
    });
  }, [entries, layoutEdges, rfNodes]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { rfNodes, rfEdges, isComputing };
}
