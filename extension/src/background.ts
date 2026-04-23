// Service worker — receives detections from content script,
// forwards to native desktop app via native messaging if installed.

const NATIVE_HOST = "com.quickdraw.host";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "token_detected") return;
  forwardToNativeApp(msg);
});

function forwardToNativeApp(msg: object) {
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST);
    port.postMessage(msg);
    port.onDisconnect.addListener(() => {
      // Native app not installed — extension works standalone via in-page tooltip
    });
  } catch {
    // Native messaging not available — silent fallback
  }
}
