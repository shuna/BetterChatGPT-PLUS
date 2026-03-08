import { useEffect, useMemo, useRef, useState } from 'react';
import { BranchTree } from '@type/chat';
import { Node, Edge } from 'reactflow';
import useStore from '@store/store';
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

export function useBranchEditorLayout(tree: BranchTree | undefined) {
  const entries = useMemo(
    () => tree ? [{ chatIndex: -1, chatId: '', chatTitle: '', tree }] : [],
    [tree]
  );
  return useMultiBranchEditorLayout(entries);
}

export function useMultiBranchEditorLayout(entries: MultiLayoutEntry[]) {
  const [rfNodes, setRfNodes] = useState<Node<MessageNodeData>[]>(EMPTY_NODES);
  const [rfEdges, setRfEdges] = useState<Edge[]>(EMPTY_EDGES);
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const latestRequestRef = useRef<number>(0);

  // Stable dependency key
  const depsKey = entries.map((e) => {
    const nodeKeys = Object.values(e.tree.nodes).map((n) => `${n.id}:${n.contentHash}`).join(',');
    return `${e.chatIndex}:${nodeKeys}:${e.tree.activePath.join('|')}`;
  }).join(';');

  useEffect(() => {
    if (entries.length === 0) {
      setRfNodes(EMPTY_NODES);
      setRfEdges(EMPTY_EDGES);
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

    // Collect only the content hashes referenced by current entries
    const neededHashes = new Set<string>();
    for (const e of entries) {
      for (const node of Object.values(e.tree.nodes)) {
        neededHashes.add(node.contentHash);
      }
    }

    const fullStore = useStore.getState().contentStore;
    const subset: WorkerInput['contentStore'] = {};
    for (const hash of neededHashes) {
      if (fullStore[hash]) {
        subset[hash] = fullStore[hash] as WorkerInput['contentStore'][string];
      }
    }

    const input: WorkerInput = {
      requestId,
      entries: entries.map((e) => ({
        chatIndex: e.chatIndex,
        chatId: e.chatId,
        chatTitle: e.chatTitle,
        nodes: e.tree.nodes as WorkerInput['entries'][0]['nodes'],
        activePath: e.tree.activePath,
      })),
      contentStore: subset,
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
      setRfNodes(e.data.rfNodes as Node<MessageNodeData>[]);
      setRfEdges(e.data.rfEdges as Edge[]);
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
  }, [depsKey]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { rfNodes, rfEdges, isComputing };
}
