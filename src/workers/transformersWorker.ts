/**
 * Web Worker for Transformers.js inference.
 *
 * Handles text classification using ONNX models loaded via customCache.
 * Model files are received from the main thread as a serialized Map
 * (via structured clone) and served to Transformers.js through env.customCache.
 *
 * Phase 7 will optimize this to use MessageChannel for on-demand file supply.
 */

export {};

// Dynamic import to avoid loading the heavy library until needed
let pipelineInstance: ((text: string) => Promise<Array<{ label: string; score: number }>>) | null = null;

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface InitRequest { id: number; type: 'init' }
interface LoadClassifierRequest {
  id: number;
  type: 'loadClassifier';
  modelId: string;
  /** Serialized file entries: [relativePath, Blob][] */
  fileEntries: [string, Blob][];
}
interface ClassifyRequest { id: number; type: 'classify'; text: string }
interface UnloadRequest { id: number; type: 'unload' }

type WorkerRequest = InitRequest | LoadClassifierRequest | ClassifyRequest | UnloadRequest;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function respond(id: number, type: string, payload: Record<string, unknown> = {}) {
  self.postMessage({ id, type, ...payload });
}

function respondError(id: number, message: string) {
  self.postMessage({ id, type: 'error', message });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleInit(req: InitRequest) {
  respond(req.id, 'ready');
}

async function handleLoadClassifier(req: LoadClassifierRequest) {
  try {
    // Dynamically import Transformers.js
    const { env, pipeline } = await import('@huggingface/transformers');

    // Build file map from serialized entries
    const files = new Map<string, Blob>(req.fileEntries);

    // Configure Transformers.js to use our local files via customCache
    env.allowRemoteModels = false;
    env.allowLocalModels = false;
    env.useBrowserCache = false;

    // Resolve URL pattern: extract relative path from HF-style URLs
    const resolvePattern = /\/resolve\/[^/]+\/(.+)$/;

    (env as Record<string, unknown>).useCustomCache = true;
    (env as Record<string, unknown>).customCache = {
      async match(request: RequestInfo | URL): Promise<Response | undefined> {
        const url = typeof request === 'string'
          ? request
          : request instanceof URL
            ? request.href
            : (request as Request).url;

        // Try resolve pattern first
        const resolveMatch = url.match(resolvePattern);
        let path: string | null = resolveMatch ? resolveMatch[1] : null;

        // Try modelId-based resolution
        if (!path) {
          const modelIdx = url.indexOf(req.modelId);
          if (modelIdx !== -1) {
            const after = url.slice(modelIdx + req.modelId.length);
            if (after.startsWith('/') && after.length > 1) {
              path = after.slice(1);
            }
          }
        }

        if (!path) return undefined;
        const blob = files.get(path);
        if (!blob) return undefined;

        const mimeType = path.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        return new Response(blob, { headers: { 'Content-Type': mimeType } });
      },
      async put(): Promise<void> {
        // No-op
      },
    };

    // Create the classification pipeline
    const classifier = await pipeline('text-classification', req.modelId, {
      local_files_only: true,
    });

    // Wrap as a callable
    pipelineInstance = async (text: string) => {
      const result = await classifier(text, { top_k: null as unknown as number });
      // Normalize output — pipeline may return nested arrays
      if (Array.isArray(result) && Array.isArray(result[0])) {
        return result[0] as Array<{ label: string; score: number }>;
      }
      return result as Array<{ label: string; score: number }>;
    };

    respond(req.id, 'loaded');
  } catch (e) {
    respondError(req.id, `Load failed: ${(e as Error).message}`);
  }
}

async function handleClassify(req: ClassifyRequest) {
  if (!pipelineInstance) {
    respondError(req.id, 'No classifier loaded');
    return;
  }

  try {
    const labels = await pipelineInstance(req.text);
    respond(req.id, 'classifyResult', { labels });
  } catch (e) {
    respondError(req.id, `Classification failed: ${(e as Error).message}`);
  }
}

async function handleUnload(req: UnloadRequest) {
  pipelineInstance = null;
  respond(req.id, 'unloaded');
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;

  switch (req.type) {
    case 'init':
      await handleInit(req);
      break;
    case 'loadClassifier':
      await handleLoadClassifier(req);
      break;
    case 'classify':
      await handleClassify(req);
      break;
    case 'unload':
      await handleUnload(req);
      break;
    default:
      respondError((req as { id: number }).id, `Unknown message type: ${(req as { type: string }).type}`);
  }
};
