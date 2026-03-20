export const buildCloudSyncFile = (compressed: string) => {
  const blob = new Blob([compressed], {
    type: 'application/octet-stream',
  });

  return new File([blob], 'better-chatgpt.json', {
    type: 'application/octet-stream',
  });
};
