import React from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import useStore from '@store/store';

import NewFolderIcon from '@icon/NewFolderIcon';
import { Folder, FolderCollection } from '@type/chat';

const NewFolder = () => {
  const { t } = useTranslation();
  const setFolders = useStore((state) => state.setFolders);

  const addFolder = () => {
    let folderIndex = 1;
    let name = `New Folder ${folderIndex}`;

    const folders = useStore.getState().folders;

    while (Object.values(folders).some((folder) => folder.name === name)) {
      folderIndex += 1;
      name = `New Folder ${folderIndex}`;
    }

    const updatedFolders: FolderCollection = JSON.parse(
      JSON.stringify(folders)
    );

    const id = uuidv4();
    const newFolder: Folder = {
      id,
      name,
      expanded: false,
      order: 0,
    };

    Object.values(updatedFolders).forEach((folder) => {
      folder.order += 1;
    });

    setFolders({ [id]: newFolder, ...updatedFolders });
  };

  return (
    <a
      className='mb-2 flex flex-shrink-0 cursor-pointer items-center gap-3 rounded-md border border-gray-200 px-3 py-3 text-sm text-gray-700 opacity-100 transition-colors duration-200 hover:bg-gray-100 dark:border-white/20 dark:text-white dark:hover:bg-gray-500/10'
      onClick={() => {
        addFolder();
      }}
    >
      <NewFolderIcon />
    </a>
  );
};

export default NewFolder;
