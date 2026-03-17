import { describe, expect, it } from 'vitest';
import {
  ContentStoreData,
  addContent,
  addContentDelta,
  buildExportContentStore,
  computeContentHash,
  getChainDepth,
  isDeltaEligible,
  promoteToFull,
  releaseContent,
  resolveContent,
  retainContent,
  validateDeltaIntegrity,
  flushPendingGC,
} from './contentStore';
import type { ContentInterface } from '@type/chat';

const text = (t: string): ContentInterface[] => [{ type: 'text', text: t }];
const image = (): ContentInterface[] => [
  { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
];
const mixed = (): ContentInterface[] => [
  { type: 'text', text: 'hello' },
  { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
];

// Long text needed for delta compression to be beneficial (short strings have unfavorable patch/content ratio)
const L = 'This is a fairly long text that simulates a real chat message with enough content to make delta compression worthwhile. It contains multiple sentences.';
const lt = (suffix: string) => text(L + suffix);

describe('isDeltaEligible', () => {
  it('returns true for text-only content', () => {
    expect(isDeltaEligible(text('hello'))).toBe(true);
  });
  it('returns false for image content', () => {
    expect(isDeltaEligible(image())).toBe(false);
  });
  it('returns false for mixed content', () => {
    expect(isDeltaEligible(mixed())).toBe(false);
  });
  it('returns false for empty array', () => {
    expect(isDeltaEligible([])).toBe(false);
  });
});

describe('addContentDelta', () => {
  it('stores delta for similar text-only content', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const hash = addContentDelta(store, lt(' added'), baseHash);

    expect(hash).not.toBe(baseHash);
    expect(store[hash].delta).toBeDefined();
    expect(store[hash].delta!.baseHash).toBe(baseHash);
    expect(store[hash].content).toEqual([]);
  });

  it('falls back to full storage for image content', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const hash = addContentDelta(store, image(), baseHash);
    expect(store[hash].delta).toBeUndefined();
  });

  it('falls back to full storage when base has images', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, image());
    const hash = addContentDelta(store, lt(''), baseHash);
    expect(store[hash].delta).toBeUndefined();
  });

  it('falls back to full storage when diff ratio > threshold', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, text('a'));
    const hash = addContentDelta(store, text('completely different long text sharing nothing at all'), baseHash);
    expect(store[hash].delta).toBeUndefined();
  });

  it('falls back to full storage when chain depth >= MAX-1', () => {
    const store: ContentStoreData = {};
    let prevHash = addContent(store, lt(''));
    for (let i = 1; i <= 4; i++) {
      const h = addContentDelta(store, lt(` v${i}`), prevHash);
      if (i < 4) expect(store[h].delta).toBeDefined();
      prevHash = h;
    }
    // depth is now 4, next should be full
    const hash = addContentDelta(store, lt(' v5'), prevHash);
    expect(store[hash].delta).toBeUndefined();
  });

  it('falls back to full storage when base does not exist', () => {
    const store: ContentStoreData = {};
    const hash = addContentDelta(store, lt(''), 'nonexistent');
    expect(store[hash].delta).toBeUndefined();
  });

  it('deduplicates when content already exists', () => {
    const store: ContentStoreData = {};
    const content = lt('');
    const h1 = addContent(store, content);
    const baseHash = addContent(store, lt(' base'));
    const h2 = addContentDelta(store, content, baseHash);
    expect(h2).toBe(h1);
    expect(store[h1].refCount).toBe(2);
  });
});

describe('resolveContent', () => {
  it('resolves full content directly', () => {
    const store: ContentStoreData = {};
    const hash = addContent(store, text('hello'));
    expect(resolveContent(store, hash)).toEqual(text('hello'));
  });

  it('resolves delta content through chain', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const hash = addContentDelta(store, lt(' modified'), baseHash);
    expect(resolveContent(store, hash)).toEqual(lt(' modified'));
  });

  it('resolves multi-level delta chain', () => {
    const store: ContentStoreData = {};
    let prevHash = addContent(store, lt(''));
    let lastContent: ContentInterface[] = lt('');
    for (let i = 1; i <= 4; i++) {
      lastContent = lt(` version ${i}`);
      prevHash = addContentDelta(store, lastContent, prevHash);
    }
    expect(resolveContent(store, prevHash)).toEqual(lastContent);
  });

  it('returns empty for missing hash', () => {
    expect(resolveContent({}, 'missing')).toEqual([]);
  });

  it('returns empty for circular delta reference', () => {
    const store: ContentStoreData = {
      a: { content: [], refCount: 1, delta: { baseHash: 'b', patches: '' } },
      b: { content: [], refCount: 1, delta: { baseHash: 'a', patches: '' } },
    };
    expect(resolveContent(store, 'a')).toEqual([]);
  });

  it('returns empty when base is missing', () => {
    const store: ContentStoreData = {
      a: { content: [], refCount: 1, delta: { baseHash: 'missing', patches: 'x' } },
    };
    expect(resolveContent(store, 'a')).toEqual([]);
  });
});

describe('promoteToFull', () => {
  it('promotes delta entry to full content', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const hash = addContentDelta(store, lt(' promoted'), baseHash);
    expect(store[hash].delta).toBeDefined();
    promoteToFull(store, hash);
    expect(store[hash].delta).toBeUndefined();
    expect(store[hash].content).toEqual(lt(' promoted'));
  });

  it('no-op for non-delta entry', () => {
    const store: ContentStoreData = {};
    const hash = addContent(store, text('hello'));
    promoteToFull(store, hash);
    expect(store[hash].content).toEqual(text('hello'));
  });
});

describe('releaseContent with delta dependents', () => {
  it('promotes dependents when refCount reaches 0', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const depHash = addContentDelta(store, lt(' modified'), baseHash);
    expect(store[depHash].delta).toBeDefined();

    releaseContent(store, baseHash);
    // Entry stays in store with refCount<=0 (deferred GC)
    expect(store[baseHash]).toBeDefined();
    expect(store[baseHash].refCount).toBeLessThanOrEqual(0);
    // But dependents are promoted immediately
    expect(store[depHash].delta).toBeUndefined();
    expect(store[depHash].content).toEqual(lt(' modified'));
    // After flushing GC, entry is removed
    flushPendingGC(store);
    expect(store[baseHash]).toBeUndefined();
  });

  it('does not promote when refCount > 0', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    retainContent(store, baseHash); // refCount = 2
    const depHash = addContentDelta(store, lt(' dep'), baseHash);

    releaseContent(store, baseHash); // refCount = 1
    expect(store[baseHash]).toBeDefined();
    expect(store[depHash].delta).toBeDefined();
  });

  it('promotes multi-level dependents (A←B←C, A deleted)', () => {
    const store: ContentStoreData = {};
    const hashA = addContent(store, lt(' A'));
    const hashB = addContentDelta(store, lt(' A B'), hashA);
    const hashC = addContentDelta(store, lt(' A B C'), hashB);

    expect(store[hashB].delta?.baseHash).toBe(hashA);
    expect(store[hashC].delta?.baseHash).toBe(hashB);

    releaseContent(store, hashA);
    // hashA stays with refCount<=0 until flushPendingGC
    expect(store[hashA]).toBeDefined();
    expect(store[hashA].refCount).toBeLessThanOrEqual(0);
    expect(store[hashB].delta).toBeUndefined();
    expect(store[hashB].content).toEqual(lt(' A B'));
    expect(resolveContent(store, hashC)).toEqual(lt(' A B C'));
  });

  it('marks entry for deferred GC with no dependents', () => {
    const store: ContentStoreData = {};
    const hash = addContent(store, text('lonely'));
    releaseContent(store, hash);
    // Entry stays until flushPendingGC
    expect(store[hash]).toBeDefined();
    expect(store[hash].refCount).toBeLessThanOrEqual(0);
    flushPendingGC(store);
    expect(store[hash]).toBeUndefined();
  });
});

describe('getChainDepth', () => {
  it('returns 0 for full entry', () => {
    const store: ContentStoreData = {};
    const hash = addContent(store, text('hello'));
    expect(getChainDepth(store, hash)).toBe(0);
  });

  it('returns correct depth for delta chain', () => {
    const store: ContentStoreData = {};
    let prev = addContent(store, lt(''));
    for (let i = 1; i <= 3; i++) {
      prev = addContentDelta(store, lt(` d${i}`), prev);
    }
    expect(getChainDepth(store, prev)).toBe(3);
  });
});

describe('buildExportContentStore', () => {
  it('resolves all deltas in export', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const deltaHash = addContentDelta(store, lt(' exported'), baseHash);

    const exported = buildExportContentStore(store);
    expect(exported[deltaHash].delta).toBeUndefined();
    expect(exported[deltaHash].content).toEqual(lt(' exported'));
    expect(exported[baseHash].content).toEqual(lt(''));
  });
});

describe('validateDeltaIntegrity', () => {
  it('detects missing base without erasing entry', () => {
    const store: ContentStoreData = {
      broken: {
        content: [],
        refCount: 1,
        delta: { baseHash: 'missing', patches: 'foo' },
      },
    };
    const corrupt = validateDeltaIntegrity(store);
    expect(corrupt.has('broken')).toBe(true);
    // Entry is NOT erased — delta metadata preserved for potential recovery
    expect(store['broken'].delta).toBeDefined();
  });

  it('detects circular chains', () => {
    const store: ContentStoreData = {
      a: { content: [], refCount: 1, delta: { baseHash: 'b', patches: '' } },
      b: { content: [], refCount: 1, delta: { baseHash: 'a', patches: '' } },
    };
    const corrupt = validateDeltaIntegrity(store);
    expect(corrupt.has('a') || corrupt.has('b')).toBe(true);
  });

  it('leaves valid deltas intact and returns empty set', () => {
    const store: ContentStoreData = {};
    const baseHash = addContent(store, lt(''));
    const hash = addContentDelta(store, lt(' valid'), baseHash);
    const corrupt = validateDeltaIntegrity(store);
    expect(corrupt.size).toBe(0);
    expect(store[hash].delta).toBeDefined();
  });
});

describe('existing functionality regression', () => {
  it('computeContentHash collision suffix works', () => {
    const store: ContentStoreData = {};
    const h1 = addContent(store, text('a'));
    const h2 = addContent(store, text('b'));
    expect(resolveContent(store, h1)).toEqual(text('a'));
    expect(resolveContent(store, h2)).toEqual(text('b'));
  });

  it('addContent/retainContent/releaseContent work without delta', () => {
    const store: ContentStoreData = {};
    const hash = addContent(store, text('no delta'));
    expect(store[hash].refCount).toBe(1);
    retainContent(store, hash);
    expect(store[hash].refCount).toBe(2);
    releaseContent(store, hash);
    expect(store[hash].refCount).toBe(1);
    releaseContent(store, hash);
    // Deferred GC: entry stays until flush
    expect(store[hash]).toBeDefined();
    expect(store[hash].refCount).toBeLessThanOrEqual(0);
    flushPendingGC(store);
    expect(store[hash]).toBeUndefined();
  });
});
