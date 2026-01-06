const MESSAGE_TYPES = {
  START: "START_BATCH",
  STOP: "STOP_BATCH",
  STATUS: "GET_STATUS",
  DOWNLOAD: "DOWNLOAD_IMAGE"
};

const IMAGE_HOST_CUES = [
  "https://files.oaiusercontent.com/",
  "https://oaidalleapiprodscus",
  "https://openaicom-api"
];

const state = {
  queue: [],
  isRunning: false,
  currentPrompt: "",
  downloaded: new Set(),
  imageCounter: 1,
  lastKnownImageCount: 0
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    return;
  }

  switch (message.type) {
    case MESSAGE_TYPES.START:
      handleStart(message.payload)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    case MESSAGE_TYPES.STOP:
      state.isRunning = false;
      sendResponse({ ok: true, result: "Batch stopped" });
      return true;
    case MESSAGE_TYPES.STATUS:
      sendResponse({
        ok: true,
        result: {
          isRunning: state.isRunning,
          currentPrompt: state.currentPrompt,
          remaining: state.queue.length,
          downloaded: state.downloaded.size,
          imageCounter: state.imageCounter
        }
      });
      return true;
    default:
  }
});

async function handleStart(payload) {
  if (!payload?.prompts?.length) {
    throw new Error("No prompts provided");
  }

  if (state.isRunning) {
    throw new Error("Batch already running");
  }

  state.queue = [...payload.prompts];
  state.isRunning = true;
  state.imageCounter = payload.startIndex ?? 1;
  state.currentPrompt = "";

  await processQueue(payload.filenamePrefix ?? "chatgpt-images");
  state.isRunning = false;
  state.currentPrompt = "";
  return "Batch completed";
}

async function processQueue(prefix) {
  while (state.isRunning && state.queue.length > 0) {
    const prompt = state.queue.shift();
    state.currentPrompt = prompt;
    await sendPrompt(prompt);
    const newImages = await waitForNewImages(120000);

    if (newImages.length) {
      await downloadImages(newImages, prefix);
    }
  }
}

async function sendPrompt(prompt) {
  const input = document.querySelector("textarea");

  if (!input) {
    throw new Error("未找到 ChatGPT 聊天输入框，请在聊天页面重试。");
  }

  input.focus();
  input.value = prompt;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      which: 13,
      keyCode: 13,
      bubbles: true
    })
  );
}

async function waitForNewImages(timeoutMs) {
  const start = performance.now();
  const baseline = getImageNodes();

  return new Promise((resolve) => {
    let timeoutInterval;
    const observer = new MutationObserver(() => {
      const newImages = getImageNodes().filter(
        (img) => !baseline.includes(img) && isFreshImage(img.src)
      );

      if (newImages.length > 0 && newImages.every(isImageLoaded)) {
        observer.disconnect();
        clearInterval(timeoutInterval);
        resolve(newImages);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"]
    });

    timeoutInterval = setInterval(() => {
      if (performance.now() - start > timeoutMs) {
        observer.disconnect();
        clearInterval(timeoutInterval);
        resolve([]);
      }
    }, 1000);
  });
}

async function downloadImages(images, prefix) {
  for (const img of images) {
    if (state.downloaded.has(img.src)) {
      continue;
    }

    state.downloaded.add(img.src);
    const paddedIndex = String(state.imageCounter).padStart(3, "0");
    const filename = `${prefix}/${paddedIndex}.png`;
    state.imageCounter += 1;

    await sendDownloadRequest(img.src, filename);
  }
}

function getImageNodes() {
  return Array.from(document.querySelectorAll("img")).filter((img) =>
    isFreshImage(img.src)
  );
}

function isFreshImage(src = "") {
  return IMAGE_HOST_CUES.some((cue) => src.startsWith(cue));
}

function isImageLoaded(img) {
  return img.complete && img.naturalWidth > 0;
}

function sendDownloadRequest(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.DOWNLOAD,
        payload: { url, filename }
      },
      (response) => {
        if (response?.ok) {
          resolve(response);
          return;
        }
        reject(new Error(response?.error ?? "下载失败"));
      }
    );
  });
}
