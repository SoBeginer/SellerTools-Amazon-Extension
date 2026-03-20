/**
 * invoice_downloader_relay.js
 * Runs in ISOLATED world — bridges postMessage events from the main-world
 * invoice_downloader.js to background.js via chrome.runtime.sendMessage.
 */
(() => {
  if (window.__invoiceRelayActive) return;
  window.__invoiceRelayActive = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "INVOICE_PDF_READY" || msg.type === "INVOICE_DOWNLOAD_DONE") {
      chrome.runtime.sendMessage(msg);
    }
  });
})();
