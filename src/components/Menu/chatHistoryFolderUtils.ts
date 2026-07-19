import type { FolderCollection } from '@type/chat';

export const expandExistingFolder = (
  folders: FolderCollection,
  folderId: string
): FolderCollection | null => {
  const folder = folders[folderId];
  if (!folder || folder.expanded) return null;

  return {
    ...folders,
    [folderId]: {
      ...folder,
      expanded: true,
    },
  };
};
