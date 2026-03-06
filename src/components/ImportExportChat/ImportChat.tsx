import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

import useStore from '@store/store';

import {
  importOpenAIChatExport,
  isLegacyImport,
  isOpenAIContent,
  PartialImportError,
  validateAndFixChats,
  validateExportV1,
  validateExportV2,
} from '@utils/import';
import { ContentStoreData, addContent, retainContent } from '@utils/contentStore';
import { flatMessagesToBranchTree } from '@utils/branchUtils';

import { modelOptions } from '@constants/modelLoader';

// Helper to detect and warn about unknown model IDs referenced in imported chats
const warnUnsupportedModels = (
  chats: any[],
  t: (key: string, opts?: any) => string
) => {
  const unsupportedModels = Array.from(
    new Set(
      chats
        .map((c: any) => c?.config?.model)
        .filter(
          (id: string | undefined) =>
            id && !modelOptions.includes(id) 
        )
    )
  );

  if (unsupportedModels.length > 0) {
    toast.warning(
      t('notifications.unsupportedModels', {
        ns: 'import',
        models: unsupportedModels.join(', '),
      }) ||
        `Unsupported model(s): ${unsupportedModels.join(', ')}. Please add them in Settings → Custom Models before importing.`,
      { autoClose: 15000 }
    );
    return true;
  }
  return false;
};

import { ChatInterface, Folder, FolderCollection } from '@type/chat';
import { ExportBase } from '@type/export';
import { toast } from 'react-toastify';

type ImportResult = {
  success: boolean;
  message: string;
};

const ImportChat = () => {
  const { t } = useTranslation(['main', 'import']);
  const setChats = useStore.getState().setChats;
  const setFolders = useStore.getState().setFolders;
  const inputRef = useRef<HTMLInputElement>(null);
  const [alert, setAlert] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  const handleFileUpload = () => {
    if (!inputRef || !inputRef.current) return;
    const file = inputRef.current.files?.[0];
    var shouldAllowPartialImport = false;
    if (file) {
      const readFileData = async (): Promise<string> => {
        if (file.name.endsWith('.gz') && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('gzip');
          const decompressedStream = file.stream().pipeThrough(ds);
          return await new Response(decompressedStream).text();
        }
        return new Promise((resolve) => {
          const r = new FileReader();
          r.onload = (e) => resolve(e.target?.result as string);
          r.readAsText(file);
        });
      };

      const processData = async () => {
        const data = await readFileData();
        const originalChats = JSON.parse(
          JSON.stringify(useStore.getState().chats)
        );
        const originalFolders = JSON.parse(
          JSON.stringify(useStore.getState().folders)
        );
        const originalContentStore = JSON.parse(
          JSON.stringify(useStore.getState().contentStore ?? {})
        );
        var originalParsedData: any;
        const importData = async (
          parsedData: any,
          shouldReduce = false,
          type: string = ''
        ): Promise<ImportResult> => {
          let chatsToImport = parsedData;
          let removedChatsCount = 0;
          while (true) {
            try {
              if (type === 'OpenAIContent' || isOpenAIContent(chatsToImport)) {
                const chats = importOpenAIChatExport(
                  chatsToImport,
                  shouldAllowPartialImport
                );
                const prevChats: ChatInterface[] = JSON.parse(
                  JSON.stringify(useStore.getState().chats)
                );
                setChats(chats.concat(prevChats));
                if (removedChatsCount > 0) {
                  toast.info(
                    `${t('reduceMessagesSuccess', {
                      count: removedChatsCount,
                    })}. ${t('notifications.chatsImported', {
                      ns: 'import',
                      imported: chats.length,
                      total: originalParsedData.length,
                    })}`,
                    { autoClose: 15000 }
                  );
                }
                if (chats.length > 0) {
                  return {
                    success: true,
                    message: t('notifications.successfulImport', {
                      ns: 'import',
                    }),
                  };
                } else {
                  return {
                    success: false,
                    message: t('notifications.quotaExceeded', {
                      ns: 'import',
                    }),
                  };
                }
              } else if (
                type === 'LegacyImport' ||
                isLegacyImport(chatsToImport)
              ) {
                if (validateAndFixChats(chatsToImport)) {
                  warnUnsupportedModels(originalParsedData, t);
                  // import new folders
                  const folderNameToIdMap: Record<string, string> = {};
                  const parsedFolders: string[] = [];

                  chatsToImport.forEach((data) => {
                    const folder = data.folder;
                    if (folder) {
                      if (!parsedFolders.includes(folder)) {
                        parsedFolders.push(folder);
                        folderNameToIdMap[folder] = uuidv4();
                      }
                      data.folder = folderNameToIdMap[folder];
                    }
                  });

                  const newFolders: FolderCollection = parsedFolders.reduce(
                    (acc, curr, index) => {
                      const id = folderNameToIdMap[curr];
                      const _newFolder: Folder = {
                        id,
                        name: curr,
                        expanded: false,
                        order: index,
                      };
                      return { [id]: _newFolder, ...acc };
                    },
                    {}
                  );

                  // increment the order of existing folders
                  const offset = parsedFolders.length;

                  const updatedFolders = useStore.getState().folders;
                  Object.values(updatedFolders).forEach(
                    (f) => (f.order += offset)
                  );

                  setFolders({ ...newFolders, ...updatedFolders });

                  // import chats
                  const prevChats = useStore.getState().chats;
                  if (prevChats) {
                    const updatedChats: ChatInterface[] = JSON.parse(
                      JSON.stringify(prevChats)
                    );
                    setChats(chatsToImport.concat(updatedChats));
                  } else {
                    setChats(chatsToImport);
                  }
                  if (removedChatsCount > 0) {
                    toast.info(
                      `${t('reduceMessagesSuccess', {
                        count: removedChatsCount,
                      })}. ${t('notifications.chatsImported', {
                        ns: 'import',
                        imported: chatsToImport.length,
                        total: originalParsedData.length,
                      })}`,
                      { autoClose: 15000 }
                    );
                  }
                  if (chatsToImport.length > 0) {
                    return {
                      success: true,
                      message: t('notifications.successfulImport', {
                        ns: 'import',
                      }),
                    };
                  } else {
                    return {
                      success: false,
                      message: t('notifications.nothingImported', {
                        ns: 'import',
                      }),
                    };
                  }
                } else {
                  // Validate unsupported model IDs and inform user
                  warnUnsupportedModels(chatsToImport, t);

                  return {
                    success: false,
                    message: t('notifications.invalidChatsDataFormat', {
                      ns: 'import',
                    }),
                  };
                }
              } else {
                switch ((parsedData as ExportBase).version) {
                  case 3: {
                    // V3 Compact: chats already use contentHash, merge contentStore
                    if (parsedData.chats && parsedData.contentStore && parsedData.folders) {
                      const offset = Object.keys(parsedData.folders).length;
                      const updatedFolders = useStore.getState().folders;
                      Object.values(updatedFolders).forEach(
                        (f) => (f.order += offset)
                      );
                      setFolders({ ...parsedData.folders, ...updatedFolders });

                      // Merge imported contentStore into existing
                      const existingContentStore = { ...useStore.getState().contentStore };
                      const importedContentStore = parsedData.contentStore as ContentStoreData;
                      for (const [hash, entry] of Object.entries(importedContentStore)) {
                        if (existingContentStore[hash]) {
                          existingContentStore[hash].refCount += entry.refCount;
                        } else {
                          existingContentStore[hash] = { ...entry };
                        }
                      }
                      useStore.setState({ contentStore: existingContentStore } as any);

                      const prevChats = useStore.getState().chats;
                      if (prevChats) {
                        const updatedChats: ChatInterface[] = JSON.parse(
                          JSON.stringify(prevChats)
                        );
                        setChats(parsedData.chats.concat(updatedChats));
                      } else {
                        setChats(parsedData.chats);
                      }

                      if (parsedData.chats.length > 0) {
                        return {
                          success: true,
                          message: t('notifications.successfulImport', { ns: 'import' }),
                        };
                      } else {
                        return {
                          success: false,
                          message: t('notifications.quotaExceeded', { ns: 'import' }),
                        };
                      }
                    }
                    return {
                      success: false,
                      message: t('notifications.invalidFormatForVersion', { ns: 'import' }),
                    };
                  }
                  case 2:
                    if (validateExportV2(parsedData)) {
                      const offset = Object.keys(parsedData.folders).length;
                      const updatedFolders = useStore.getState().folders;
                      Object.values(updatedFolders).forEach(
                        (f) => (f.order += offset)
                      );
                      setFolders({ ...parsedData.folders, ...updatedFolders });

                      // Migrate V2 chats: convert inline content to contentHash
                      const csV2 = { ...useStore.getState().contentStore };
                      if (parsedData.chats) {
                        for (const chat of parsedData.chats) {
                          if (chat.branchTree) {
                            for (const node of Object.values(chat.branchTree.nodes) as any[]) {
                              if (node.content && !node.contentHash) {
                                node.contentHash = addContent(csV2, node.content);
                                delete node.content;
                              }
                            }
                          } else {
                            // Create branchTree from messages
                            chat.branchTree = flatMessagesToBranchTree(chat.messages, csV2);
                          }
                        }
                      }
                      useStore.setState({ contentStore: csV2 } as any);

                      const prevChatsV2 = useStore.getState().chats;
                      if (parsedData.chats) {
                        if (prevChatsV2) {
                          const updatedChats: ChatInterface[] = JSON.parse(
                            JSON.stringify(prevChatsV2)
                          );
                          setChats(parsedData.chats.concat(updatedChats));
                        } else {
                          setChats(parsedData.chats);
                        }
                      }
                      if (parsedData.chats && parsedData.chats.length > 0) {
                        return {
                          success: true,
                          message: t('notifications.successfulImport', {
                            ns: 'import',
                          }),
                        };
                      } else {
                        return {
                          success: false,
                          message: t('notifications.quotaExceeded', {
                            ns: 'import',
                          }),
                        };
                      }
                    } else {
                      return {
                        success: false,
                        message: t('notifications.invalidFormatForVersion', {
                          ns: 'import',
                        }),
                      };
                    }
                  case 1:
                    if (validateExportV1(parsedData)) {
                      // increment the order of existing folders
                      const offset = Object.keys(parsedData.folders).length;

                      const updatedFolders = useStore.getState().folders;
                      Object.values(updatedFolders).forEach(
                        (f) => (f.order += offset)
                      );

                      setFolders({ ...parsedData.folders, ...updatedFolders });

                      // import chats
                      const prevChats = useStore.getState().chats;
                      if (parsedData.chats) {
                        if (prevChats) {
                          const updatedChats: ChatInterface[] = JSON.parse(
                            JSON.stringify(prevChats)
                          );
                          setChats(parsedData.chats.concat(updatedChats));
                        } else {
                          setChats(parsedData.chats);
                        }
                      }
                      if (
                        removedChatsCount > 0 &&
                        parsedData.chats &&
                        parsedData.chats.length > 0
                      ) {
                        toast.info(
                          `${t('reduceMessagesSuccess', {
                            count: removedChatsCount,
                          })}. ${t('notifications.chatsImported', {
                            ns: 'import',
                            imported:
                              originalParsedData.chats.length -
                              removedChatsCount,
                            total: originalParsedData.chats.length,
                          })}`,
                          { autoClose: 15000 }
                        );
                      }

                      if (parsedData.chats && parsedData.chats.length > 0) {
                        return {
                          success: true,
                          message: t('notifications.successfulImport', {
                            ns: 'import',
                          }),
                        };
                      } else {
                        return {
                          success: false,
                          message: t('notifications.quotaExceeded', {
                            ns: 'import',
                          }),
                        };
                      }
                    } else {
                      return {
                        success: false,
                        message: t('notifications.invalidFormatForVersion', {
                          ns: 'import',
                        }),
                      };
                    }
                  default:
                    return {
                      success: false,
                      message: t('notifications.unrecognisedDataFormat', {
                        ns: 'import',
                      }),
                    };
                }
              }
            } catch (error: unknown) {
              if ((error as DOMException).name === 'QuotaExceededError') {
                setChats(originalChats);
                setFolders(originalFolders);
                useStore.setState({ contentStore: originalContentStore } as any);
                if (type === 'ExportV1') {
                  if (chatsToImport.chats.length > 0) {
                    if (shouldReduce) {
                      chatsToImport.chats.pop();
                      removedChatsCount++;
                    } else {
                      const confirmMessage = t(
                        'reduceMessagesFailedImportWarning'
                      );
                      if (window.confirm(confirmMessage)) {
                        return await importData(parsedData, true, type);
                      } else {
                        return {
                          success: false,
                          message: t('notifications.quotaExceeded', {
                            ns: 'import',
                          }),
                        };
                      }
                    }
                  } else {
                    return {
                      success: false,
                      message: t('notifications.quotaExceeded', {
                        ns: 'import',
                      }),
                    };
                  }
                } else {
                  if (chatsToImport.length > 0) {
                    if (shouldReduce) {
                      chatsToImport.pop();
                      removedChatsCount++;
                    } else {
                      const confirmMessage = t(
                        'reduceMessagesFailedImportWarning'
                      );
                      if (window.confirm(confirmMessage)) {
                        return await importData(parsedData, true, type);
                      } else {
                        return {
                          success: false,
                          message: t('notifications.quotaExceeded', {
                            ns: 'import',
                          }),
                        };
                      }
                    }
                  } else {
                    return {
                      success: false,
                      message: t('notifications.quotaExceeded', {
                        ns: 'import',
                      }),
                    };
                  }
                }
              } else if (error instanceof PartialImportError) {
                // Handle PartialImportError
                const confirmMessage = t('partialImportWarning', {
                  message: error.message,
                });

                if (window.confirm(confirmMessage)) {
                  shouldAllowPartialImport = true;
                  // User chose to continue with the partial import
                  return await importData(parsedData, true, type);
                } else {
                  // User chose not to proceed with the partial import
                  return {
                    success: false,
                    message: t('notifications.nothingImported', {
                      ns: 'import',
                    }),
                  };
                }
              } else {
                return { success: false, message: (error as Error).message };
              }
            }
          }
        };

        try {
          const parsedData = JSON.parse(data);
          originalParsedData = JSON.parse(data);
          let type = '';
          if (isOpenAIContent(parsedData)) {
            type = 'OpenAIContent';
          } else if (isLegacyImport(parsedData)) {
            type = 'LegacyImport';
          } else if ((parsedData as ExportBase).version === 3) {
            type = 'ExportV3';
          } else if ((parsedData as ExportBase).version === 2) {
            type = 'ExportV2';
          } else if ((parsedData as ExportBase).version === 1) {
            type = 'ExportV1';
          }
          const result = await importData(parsedData, false, type);
          if (result.success) {
            toast.success(result.message);
            setAlert({ message: result.message, success: true });
          } else {
            setChats(originalChats);
            setFolders(originalFolders);
            useStore.setState({ contentStore: originalContentStore } as any);
            toast.error(result.message, { autoClose: 15000 });
            setAlert({ message: result.message, success: false });
          }
        } catch (error: unknown) {
          setChats(originalChats);
          setFolders(originalFolders);
          useStore.setState({ contentStore: originalContentStore } as any);
          toast.error((error as Error).message, { autoClose: 15000 });
          setAlert({ message: (error as Error).message, success: false });
        }
      };

      processData();
    }
  };

  return (
    <>
      <label className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'>
        {t('import')} (JSON)
      </label>
      <input
        className='w-full text-sm file:p-2 text-gray-800 file:text-gray-700 dark:text-gray-300 dark:file:text-gray-200 rounded-md cursor-pointer focus:outline-none bg-gray-50 file:bg-gray-100 dark:bg-gray-800 dark:file:bg-gray-700 file:border-0 border border-gray-300 dark:border-gray-600 placeholder-gray-900 dark:placeholder-gray-300 file:cursor-pointer'
        type='file'
        accept='.json,.json.gz,.gz'
        ref={inputRef}
      />
      <button
        className='btn btn-small btn-primary mt-3'
        onClick={handleFileUpload}
        aria-label={t('import') as string}
      >
        {t('import')}
      </button>
      {alert && (
        <div
          className={`relative py-2 px-3 w-full mt-3 border rounded-md text-gray-600 dark:text-gray-100 text-sm whitespace-pre-wrap ${
            alert.success
              ? 'border-green-500 bg-green-500/10'
              : 'border-red-500 bg-red-500/10'
          }`}
        >
          {alert.message}
        </div>
      )}
    </>
  );
};

export default ImportChat;
