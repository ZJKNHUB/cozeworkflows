const DOWNLOAD_MESSAGE = "DOWNLOAD_IMAGE";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== DOWNLOAD_MESSAGE) {
    return;
  }

  const { url, filename } = message.payload ?? {};

  if (!url || !filename) {
    sendResponse?.({ ok: false, error: "Missing download url or filename" });
    return true;
  }

  chrome.downloads.download(
    {
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse?.({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse?.({ ok: true, downloadId });
    }
  );

  return true;
});
