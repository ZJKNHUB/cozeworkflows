const MESSAGE_TYPES = {
  START: "START_BATCH",
  STOP: "STOP_BATCH",
  STATUS: "GET_STATUS"
};

const $ = (id) => document.getElementById(id);
const promptsInput = $("prompts");
const prefixInput = $("prefix");
const startIndexInput = $("startIndex");
const statusText = $("statusText");
const currentPromptEl = $("currentPrompt");
const remainingEl = $("remaining");
const downloadedEl = $("downloaded");
const nextIndexEl = $("nextIndex");

document.addEventListener("DOMContentLoaded", async () => {
  const saved = await chrome.storage.sync.get(["prompts", "prefix", "startIndex"]);
  if (saved.prompts) promptsInput.value = saved.prompts;
  if (saved.prefix) prefixInput.value = saved.prefix;
  if (saved.startIndex) startIndexInput.value = saved.startIndex;

  $("start").addEventListener("click", startBatch);
  $("stop").addEventListener("click", stopBatch);

  await refreshStatus();
});

async function startBatch() {
  const prompts = promptsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!prompts.length) {
    statusText.textContent = "请先输入提示词";
    return;
  }

  const prefix = prefixInput.value.trim() || "chatgpt-images";
  const startIndex = Number.parseInt(startIndexInput.value, 10) || 1;

  await chrome.storage.sync.set({
    prompts: promptsInput.value,
    prefix,
    startIndex
  });

  const tab = await getActiveTab();
  if (!tab) {
    statusText.textContent = "请先打开 ChatGPT 对话页面";
    return;
  }

  statusText.textContent = "已开始，等待页面响应...";

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: MESSAGE_TYPES.START,
      payload: { prompts, filenamePrefix: prefix, startIndex }
    },
    (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = "发送失败，请确认已打开 ChatGPT 对话页";
        return;
      }
      if (!response?.ok) {
        statusText.textContent = response?.error || "启动失败";
        return;
      }
      statusText.textContent = "批量任务运行中...";
      refreshStatus();
    }
  );
}

async function stopBatch() {
  const tab = await getActiveTab();
  if (!tab) {
    statusText.textContent = "未找到 ChatGPT 标签页";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.STOP }, () => {
    statusText.textContent = "已请求停止";
    refreshStatus();
  });
}

async function refreshStatus() {
  const tab = await getActiveTab();
  if (!tab) {
    statusText.textContent = "请在 ChatGPT 对话页面使用";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.STATUS }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      statusText.textContent = "等待任务启动";
      return;
    }

    const info = response.result;
    statusText.textContent = info.isRunning ? "运行中" : "空闲";
    currentPromptEl.textContent = info.currentPrompt || "-";
    remainingEl.textContent = info.remaining ?? 0;
    downloadedEl.textContent = info.downloaded ?? 0;
    nextIndexEl.textContent = info.imageCounter ?? 1;
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
