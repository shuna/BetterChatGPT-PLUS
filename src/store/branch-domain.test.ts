import { describe, expect, it } from 'vitest';

import { _defaultChatConfig, _defaultImageDetail } from '@constants/chat';
import type { BranchClipboard, ChatInterface, ContentInterface } from '@type/chat';
import {
  appendNodeToActivePathState,
  createBranchState,
  deleteBranchState,
  ensureBranchTreeState,
  insertMessageAtIndexState,
  moveMessageState,
  pasteBranchSequenceState,
  removeMessageAtIndexState,
  replaceMessageAndPruneFollowingState,
  updateLastNodeContentState,
  updateNodeRoleState,
  upsertMessageAtIndexState,
  upsertWithAutoBranchState,
} from './branch-domain';
import { resolveContent } from '@utils/contentStore';

const textContent = (text: string): ContentInterface[] => [{ type: 'text', text }];
const L = 'This is a fairly long text that simulates a real chat message with enough content to make delta compression worthwhile. It contains multiple sentences.';
const longContent = (suffix: string) => textContent(L + suffix);

const createChat = (): ChatInterface => ({
  id: 'chat-1',
  title: 'Chat',
  titleSet: true,
  config: { ..._defaultChatConfig },
  imageDetail: _defaultImageDetail,
  messages: [
    { role: 'user', content: textContent('hello') },
    { role: 'assistant', content: textContent('world') },
  ],
});

describe('branch-domain', () => {
  it('ensures branch tree state from flat messages', () => {
    const baseChat = createChat();
    const result = ensureBranchTreeState([baseChat], 0, {});

    expect(result.chats[0].branchTree).toBeDefined();
    expect(result.chats[0].branchTree?.activePath).toHaveLength(2);
    expect(Object.keys(result.contentStore)).toHaveLength(2);
  });

  it('creates and deletes a branch while maintaining content store refs', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const sourceNodeId = ensured.chats[0].branchTree!.activePath[1];

    const branched = createBranchState(
      ensured.chats,
      0,
      sourceNodeId,
      textContent('branch response'),
      ensured.contentStore
    );

    const newNodeId = branched.newId;
    const newHash = branched.chats[0].branchTree!.nodes[newNodeId].contentHash;
    expect(branched.contentStore[newHash]?.refCount).toBe(1);

    const deleted = deleteBranchState(
      branched.chats,
      0,
      newNodeId,
      branched.contentStore
    );

    expect(deleted.chats[0].branchTree?.nodes[newNodeId]).toBeUndefined();
    // With deferred GC, entry stays with refCount<=0 until flushPendingGC
    expect(deleted.contentStore[newHash]?.refCount).toBeLessThanOrEqual(0);
  });

  it('pastes copied nodes and retains referenced content', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const [firstNodeId, secondNodeId] = ensured.chats[0].branchTree!.activePath;
    const secondNode = ensured.chats[0].branchTree!.nodes[secondNodeId];

    const clipboard: BranchClipboard = {
      sourceChat: ensured.chats[0].id,
      nodeIds: [secondNodeId],
      nodes: {
        [secondNodeId]: { ...secondNode },
      },
    };

    const pasted = pasteBranchSequenceState(
      ensured.chats,
      0,
      firstNodeId,
      clipboard,
      ensured.contentStore
    );

    expect(pasted.chats[0].branchTree?.activePath).toHaveLength(2);
    expect(pasted.contentStore[secondNode.contentHash].refCount).toBe(2);
  });

  it('inserts a message into the active path and rewires parent links', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});

    const inserted = insertMessageAtIndexState(
      ensured.chats,
      0,
      1,
      { role: 'system', content: textContent('inserted') },
      ensured.contentStore
    );

    expect(inserted.chats[0].messages.map((message) => message.role)).toEqual([
      'user',
      'system',
      'assistant',
    ]);

    const tree = inserted.chats[0].branchTree!;
    const [firstId, insertedId, thirdId] = tree.activePath;
    expect(tree.nodes[insertedId].parentId).toBe(firstId);
    expect(tree.nodes[thirdId].parentId).toBe(insertedId);
  });

  it('removes the first active-path node and updates the root', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const treeBefore = ensured.chats[0].branchTree!;
    const oldRootId = treeBefore.rootId;
    const secondId = treeBefore.activePath[1];

    const removed = removeMessageAtIndexState(
      ensured.chats,
      0,
      0,
      ensured.contentStore
    );

    const tree = removed.chats[0].branchTree!;
    expect(tree.rootId).toBe(secondId);
    expect(tree.nodes[secondId].parentId).toBeNull();
    expect(tree.nodes[oldRootId]).toBeUndefined();
    expect(removed.chats[0].messages.map((message) => message.role)).toEqual([
      'assistant',
    ]);
  });

  it('preserves a generating node as a hidden branch when deleting it', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const treeBefore = ensured.chats[0].branchTree!;
    const removedNodeId = treeBefore.activePath[1];
    const removedHash = treeBefore.nodes[removedNodeId].contentHash;

    const removed = removeMessageAtIndexState(
      ensured.chats,
      0,
      1,
      ensured.contentStore,
      { preserveNode: true }
    );

    const tree = removed.chats[0].branchTree!;
    expect(tree.activePath).toEqual([treeBefore.activePath[0]]);
    expect(tree.nodes[removedNodeId]).toBeDefined();
    expect(tree.nodes[removedNodeId].parentId).toBe(treeBefore.activePath[0]);
    expect(removed.contentStore[removedHash]).toBeDefined();
    expect(removed.chats[0].messages.map((message) => message.role)).toEqual([
      'user',
    ]);
  });

  it('moves the root message down while preserving a valid active path', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});

    const moved = moveMessageState(
      ensured.chats,
      0,
      0,
      'down',
      ensured.contentStore
    );

    const tree = moved.chats[0].branchTree!;
    const [firstId, secondId] = tree.activePath;
    expect(tree.rootId).toBe(firstId);
    expect(tree.nodes[firstId].parentId).toBeNull();
    expect(tree.nodes[secondId].parentId).toBe(firstId);
    expect(moved.chats[0].messages.map((message) => message.role)).toEqual([
      'assistant',
      'user',
    ]);
  });

  it('moves a middle message up while preserving parent links', () => {
    const chat = createChat();
    chat.messages.push({ role: 'user', content: textContent('third') });
    const ensured = ensureBranchTreeState([chat], 0, {});
    const pathBefore = ensured.chats[0].branchTree!.activePath.slice();

    const moved = moveMessageState(ensured.chats, 0, 1, 'up', ensured.contentStore);

    const tree = moved.chats[0].branchTree!;
    expect(tree.activePath[0]).toBe(pathBefore[1]);
    expect(tree.activePath[1]).toBe(pathBefore[0]);
    expect(tree.activePath[2]).toBe(pathBefore[2]);
    expect(tree.nodes[tree.activePath[0]].parentId).toBeNull();
    expect(tree.nodes[tree.activePath[1]].parentId).toBe(tree.activePath[0]);
    expect(tree.nodes[tree.activePath[2]].parentId).toBe(tree.activePath[1]);
    expect(moved.chats[0].messages.map((m) => m.role)).toEqual([
      'assistant',
      'user',
      'user',
    ]);
  });

  it('does not move the first message up (boundary)', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const pathBefore = ensured.chats[0].branchTree!.activePath.slice();

    const moved = moveMessageState(ensured.chats, 0, 0, 'up', ensured.contentStore);

    const tree = moved.chats[0].branchTree!;
    expect(tree.activePath).toEqual(pathBefore);
  });

  it('does not move the last message down (boundary)', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const pathBefore = ensured.chats[0].branchTree!.activePath.slice();

    const moved = moveMessageState(ensured.chats, 0, 1, 'down', ensured.contentStore);

    const tree = moved.chats[0].branchTree!;
    expect(tree.activePath).toEqual(pathBefore);
  });

  it('moves the last message up', () => {
    const chat = createChat();
    chat.messages.push({ role: 'user', content: textContent('third') });
    const ensured = ensureBranchTreeState([chat], 0, {});
    const pathBefore = ensured.chats[0].branchTree!.activePath.slice();

    const moved = moveMessageState(ensured.chats, 0, 2, 'up', ensured.contentStore);

    const tree = moved.chats[0].branchTree!;
    expect(tree.activePath[1]).toBe(pathBefore[2]);
    expect(tree.activePath[2]).toBe(pathBefore[1]);
    expect(tree.nodes[tree.activePath[2]].parentId).toBe(tree.activePath[1]);
    expect(moved.chats[0].messages.map((m) => m.role)).toEqual([
      'user',
      'user',
      'assistant',
    ]);
  });

  it('replaces a message and prunes following messages in one branch-aware path', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const inserted = insertMessageAtIndexState(
      ensured.chats,
      0,
      2,
      { role: 'assistant', content: textContent('tail') },
      ensured.contentStore
    );

    const updated = replaceMessageAndPruneFollowingState(
      inserted.chats,
      0,
      0,
      { role: 'user', content: textContent('updated') },
      inserted.contentStore,
      2
    );

    expect(updated.chats[0].messages).toEqual([
      { role: 'user', content: textContent('updated') },
    ]);
    expect(updated.chats[0].branchTree?.activePath).toHaveLength(1);
  });

  it('upserts into a flat chat by first materializing a branch tree', () => {
    const updated = upsertMessageAtIndexState(
      [createChat()],
      0,
      1,
      { role: 'assistant', content: textContent('updated world') },
      {}
    );

    expect(updated.chats[0].branchTree).toBeDefined();
    expect(updated.chats[0].messages[1]).toEqual({
      role: 'assistant',
      content: textContent('updated world'),
    });
  });

  it('appends into a flat chat by first materializing a branch tree', () => {
    const updated = appendNodeToActivePathState(
      [createChat()],
      0,
      'assistant',
      textContent('follow-up'),
      {}
    );

    expect(updated.chats[0].branchTree).toBeDefined();
    expect(updated.chats[0].messages.at(-1)).toEqual({
      role: 'assistant',
      content: textContent('follow-up'),
    });
    expect(updated.chats[0].branchTree?.activePath).toHaveLength(3);
  });
});

describe('branch-domain delta compression', () => {
  const createLongChat = (): ChatInterface => ({
    id: 'chat-1',
    title: 'Chat',
    titleSet: true,
    config: { ..._defaultChatConfig },
    imageDetail: _defaultImageDetail,
    messages: [
      { role: 'user', content: longContent(' user msg') },
      { role: 'assistant', content: longContent(' assistant msg') },
    ],
  });

  it('createBranchState: stores delta for text-only branch', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});
    const sourceNodeId = ensured.chats[0].branchTree!.activePath[1];

    const branched = createBranchState(
      ensured.chats,
      0,
      sourceNodeId,
      longContent(' assistant msg edited'),
      ensured.contentStore
    );

    const newHash = branched.chats[0].branchTree!.nodes[branched.newId].contentHash;
    expect(branched.contentStore[newHash].delta).toBeDefined();
    expect(resolveContent(branched.contentStore, newHash)).toEqual(longContent(' assistant msg edited'));
  });

  it('createBranchState: stores full for image content', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});
    const sourceNodeId = ensured.chats[0].branchTree!.activePath[1];
    const imgContent: ContentInterface[] = [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'auto' } },
    ];

    const branched = createBranchState(
      ensured.chats,
      0,
      sourceNodeId,
      imgContent,
      ensured.contentStore
    );

    const newHash = branched.chats[0].branchTree!.nodes[branched.newId].contentHash;
    expect(branched.contentStore[newHash].delta).toBeUndefined();
  });

  it('upsertMessageAtIndexState: resolves content correctly after edit', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});

    const updated = upsertMessageAtIndexState(
      ensured.chats,
      0,
      1,
      { role: 'assistant', content: longContent(' assistant msg updated') },
      ensured.contentStore
    );

    const nodeId = updated.chats[0].branchTree!.activePath[1];
    const hash = updated.chats[0].branchTree!.nodes[nodeId].contentHash;
    // When base refCount drops to 0, delta gets promoted to full — this is correct
    expect(resolveContent(updated.contentStore, hash)).toEqual(longContent(' assistant msg updated'));
  });

  it('upsertMessageAtIndexState: keeps delta when base has other refs', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});
    const sourceNodeId = ensured.chats[0].branchTree!.activePath[1];

    // Create a branch first so the base has refCount > 1
    const branched = createBranchState(
      ensured.chats, 0, sourceNodeId, undefined, ensured.contentStore
    );

    // Now edit the original node — base still has refs from the branch
    const updated = upsertMessageAtIndexState(
      branched.chats,
      0,
      1,
      { role: 'assistant', content: longContent(' assistant msg updated') },
      branched.contentStore
    );

    const nodeId = updated.chats[0].branchTree!.activePath[1];
    const hash = updated.chats[0].branchTree!.nodes[nodeId].contentHash;
    expect(updated.contentStore[hash].delta).toBeDefined();
    expect(resolveContent(updated.contentStore, hash)).toEqual(longContent(' assistant msg updated'));
  });

  it('updateLastNodeContentState: resolves content correctly', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});

    const updated = updateLastNodeContentState(
      ensured.chats,
      0,
      longContent(' assistant msg edited'),
      ensured.contentStore
    );

    const tree = updated.chats[0].branchTree!;
    const lastId = tree.activePath[tree.activePath.length - 1];
    const hash = tree.nodes[lastId].contentHash;
    expect(resolveContent(updated.contentStore, hash)).toEqual(longContent(' assistant msg edited'));
  });

  it('branch create → delete all branches → contentStore integrity', () => {
    const ensured = ensureBranchTreeState([createLongChat()], 0, {});
    const sourceNodeId = ensured.chats[0].branchTree!.activePath[1];

    const branched = createBranchState(
      ensured.chats,
      0,
      sourceNodeId,
      longContent(' assistant variant'),
      ensured.contentStore
    );

    const deleted = deleteBranchState(
      branched.chats,
      0,
      branched.newId,
      branched.contentStore
    );

    const origHash = deleted.chats[0].branchTree!.nodes[sourceNodeId].contentHash;
    expect(resolveContent(deleted.contentStore, origHash)).toEqual(longContent(' assistant msg'));
  });
});

describe('updateNodeRoleState', () => {
  it('persists role change through materializeActivePath', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const nodeId = ensured.chats[0].branchTree!.activePath[0];

    const updated = updateNodeRoleState(
      ensured.chats, 0, nodeId, 'system', ensured.contentStore
    );

    const tree = updated[0].branchTree!;
    expect(tree.nodes[nodeId].role).toBe('system');
    expect(updated[0].messages[0].role).toBe('system');
  });
});

describe('upsertWithAutoBranchState', () => {
  const createThreeNodeChat = () => {
    const chat = createChat();
    chat.messages.push({ role: 'user', content: textContent('third') });
    return ensureBranchTreeState([chat], 0, {});
  };

  it('returns noOp when content and role are identical', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const treeBefore = ensured.chats[0].branchTree!;
    const nodeCountBefore = Object.keys(treeBefore.nodes).length;

    const result = upsertWithAutoBranchState(
      ensured.chats, 0, 0,
      { role: 'user', content: textContent('hello') },
      ensured.contentStore
    );

    expect(result.noOp).toBe(true);
    const nodeCountAfter = Object.keys(result.chats[0].branchTree!.nodes).length;
    expect(nodeCountAfter).toBe(nodeCountBefore);
  });

  it('updates role in-place when only role changes', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const nodeId = ensured.chats[0].branchTree!.activePath[0];

    const result = upsertWithAutoBranchState(
      ensured.chats, 0, 0,
      { role: 'system', content: textContent('hello') },
      ensured.contentStore
    );

    expect(result.noOp).toBeUndefined();
    expect(result.chats[0].branchTree!.nodes[nodeId].role).toBe('system');
    expect(result.chats[0].messages[0].role).toBe('system');
    // No new node created
    expect(Object.keys(result.chats[0].branchTree!.nodes).length).toBe(2);
  });

  it('updates last node in-place when content changes', () => {
    const ensured = ensureBranchTreeState([createChat()], 0, {});
    const nodeCountBefore = Object.keys(ensured.chats[0].branchTree!.nodes).length;

    const result = upsertWithAutoBranchState(
      ensured.chats, 0, 1,
      { role: 'assistant', content: textContent('updated world') },
      ensured.contentStore
    );

    expect(result.noOp).toBeUndefined();
    expect(result.chats[0].messages[1].content).toEqual(textContent('updated world'));
    // No new node — in-place update for last node
    expect(Object.keys(result.chats[0].branchTree!.nodes).length).toBe(nodeCountBefore);
  });

  it('creates sibling and truncates activePath for mid-chain content edit', () => {
    const ensured = createThreeNodeChat();
    const pathBefore = ensured.chats[0].branchTree!.activePath.slice();
    const oldNodeId = pathBefore[1]; // middle node (assistant)

    const result = upsertWithAutoBranchState(
      ensured.chats, 0, 1,
      { role: 'assistant', content: textContent('edited response') },
      ensured.contentStore
    );

    expect(result.noOp).toBeUndefined();
    expect(result.newId).toBeDefined();

    const tree = result.chats[0].branchTree!;

    // activePath should be truncated: [node0, newNode] (no third node)
    expect(tree.activePath).toHaveLength(2);
    expect(tree.activePath[0]).toBe(pathBefore[0]);
    expect(tree.activePath[1]).toBe(result.newId);

    // New node is sibling of old node (same parent)
    expect(tree.nodes[result.newId!].parentId).toBe(tree.nodes[oldNodeId].parentId);

    // Old node and its descendant (third) still exist in tree
    expect(tree.nodes[oldNodeId]).toBeDefined();
    expect(tree.nodes[pathBefore[2]]).toBeDefined();
    expect(tree.nodes[pathBefore[2]].parentId).toBe(oldNodeId);

    // Messages reflect the new truncated path
    expect(result.chats[0].messages).toHaveLength(2);
    expect(result.chats[0].messages[1].content).toEqual(textContent('edited response'));
  });
});
