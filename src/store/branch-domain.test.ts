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
  upsertMessageAtIndexState,
} from './branch-domain';

const textContent = (text: string): ContentInterface[] => [{ type: 'text', text }];

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
    expect(deleted.contentStore[newHash]).toBeUndefined();
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
