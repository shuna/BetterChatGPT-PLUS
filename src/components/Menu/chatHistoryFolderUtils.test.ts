import { describe, expect, it } from 'vitest';
import type { FolderCollection } from '@type/chat';
import { expandExistingFolder } from './chatHistoryFolderUtils';

describe('expandExistingFolder', () => {
  it('returns null when a chat references a deleted folder', () => {
    expect(expandExistingFolder({}, 'missing-folder')).toBeNull();
  });

  it('expands an existing folder without mutating the source collection', () => {
    const folders = {
      folder: {
        id: 'folder',
        name: 'Folder',
        color: 'blue',
        order: 0,
        expanded: false,
      },
    } as FolderCollection;

    const result = expandExistingFolder(folders, 'folder');

    expect(result?.folder.expanded).toBe(true);
    expect(folders.folder.expanded).toBe(false);
  });
});
