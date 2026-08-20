/**
 * invoice_downloader.js
 * Runs in ISOLATED world — has access to chrome.runtime / chrome.storage.
 *
 * window.open interception is handled by a tiny MAIN world func injected
 * by background.js. It dispatches a document CustomEvent ("__invoicePdfCaptured")
 * that this script listens to. document is shared between both worlds.
 *
 * Params are read from chrome.storage.session._invoiceDownloaderParams:
 *   { months: number[], years: number[] }
 */

(async () => {
  "use strict";

  console.log("[InvoiceDownloader] Script top — running");

  // ─── Double-injection guard ───────────────────────────────────────────────────
  // Use a DOM marker — visible across isolated / main worlds.
  if (document.querySelector("meta[data-invoice-dl]")) {
    console.warn("[InvoiceDownloader] Already running — skipping duplicate injection.");
    return;
  }
  const _marker = document.createElement("meta");
  _marker.setAttribute("data-invoice-dl", "1");
  document.head.appendChild(_marker);

  const LOG = "[InvoiceDownloader]";
  function log(...a)  { console.log(LOG, ...a); }
  function warn(...a) { console.warn(LOG, ...a); }
  function sleep(ms)  { return new Promise((r) => setTimeout(r, ms)); }

  // ─── Main logic wrapped in try/finally so marker is always removed ────────────

  try {

  // ─── Load params from session storage ────────────────────────────────────────

  console.log("[InvoiceDownloader] Reading local storage…");
  const { _invoiceDownloaderParams: params } =
    await chrome.storage.local.get("_invoiceDownloaderParams");
  console.log("[InvoiceDownloader] Params:", JSON.stringify(params));

  if (!params?.months?.length || !params?.years?.length) {
    warn("No params in session storage — aborting.");
    chrome.runtime.sendMessage({ type: "INVOICE_DOWNLOAD_DONE", count: 0, error: "Missing params" });
    return;
  }

  const MONTH_ABBR = ["Jan","Feb","Mar","Apr","May","Jun",
                      "Jul","Aug","Sep","Oct","Nov","Dec"];

  const months       = params.months.map(Number);
  const years        = [...new Set(params.years.map(String))]; // dedupe years
  const docType      = params.docType      ?? "all"; // "all" | "invoice" | "creditNote"
  const downloadMode = params.downloadMode ?? "zip"; // "individual" | "zip"
  const includeCsv   = params.includeCsv   ?? false;

  const targetLabel = years.join(", ");
  log(`Starting — targets: ${targetLabel}`);

  // ─── Verify page ─────────────────────────────────────────────────────────────

  if (!location.pathname.includes("/tax/seller-fee-invoices")) {
    warn("Not on invoice page:", location.href);
    chrome.runtime.sendMessage({ type: "INVOICE_DOWNLOAD_DONE", count: 0, error: "Wrong page" });
    return;
  }

  // ─── Wait for table + rows (lazy loader) ─────────────────────────────────────

  function waitForTable(timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const t = document.querySelector("table");
        return (t && t.querySelector("tbody tr")) ? t : null;
      };
      const found = check();
      if (found) { resolve(found); return; }

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timed out waiting for invoice table (20 s)"));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const t = check();
        if (t) { clearTimeout(timer); observer.disconnect(); resolve(t); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  log("Waiting for invoice table…");
  let table;
  try {
    table = await waitForTable(20_000);
    log("Table found.");
  } catch (err) {
    warn(err.message);
    chrome.runtime.sendMessage({ type: "INVOICE_DOWNLOAD_DONE", count: 0, error: "No table found" });
    return;
  }

  // ─── Parse header column indices ─────────────────────────────────────────────

  const headerCells = [...table.querySelectorAll("thead tr:first-child th, thead tr:first-child td")];
  const effectiveHeaders = headerCells.length > 0
    ? headerCells
    : [...table.querySelectorAll("tr:first-child th, tr:first-child td")];
  const headerTexts = effectiveHeaders.map((th) => th.textContent.trim().toLowerCase());
  log("Headers:", headerTexts);

  let startDateIdx = headerTexts.findIndex((h) => h.includes("start") && h.includes("date"));
  let endDateIdx   = headerTexts.findIndex((h) => h.includes("end")   && h.includes("date"));
  const fileTypeIdx = headerTexts.findIndex((h) => h.includes("file") && h.includes("type"));
  log(`File Type column index: ${fileTypeIdx}`);

  if (startDateIdx === -1 && endDateIdx === -1) {
    const fb = headerTexts.findIndex(
      (h) => h.includes("date") || h.includes("period") || h.includes("invoice date")
    );
    if (fb !== -1) {
      startDateIdx = fb; endDateIdx = fb;
      warn(`No Start/End Date headers — using column ${fb} as fallback.`);
    } else {
      warn("No date column found — scanning all cells.");
    }
  }

  // ─── Date matching ────────────────────────────────────────────────────────────

  function dateTextMatches(text) {
    if (!text) return false;
    for (const m of months) {
      const abbr = MONTH_ABBR[m - 1];
      for (const y of years) {
        if (text.includes(abbr) && text.includes(y)) return true;
      }
    }
    return false;
  }

  function rowMatchesPeriod(row) {
    const cells = [...row.querySelectorAll("td")];
    if (cells.length < 2) return false;
    if (startDateIdx !== -1 || endDateIdx !== -1) {
      return dateTextMatches(cells[startDateIdx]?.textContent.trim() ?? "") ||
             dateTextMatches(cells[endDateIdx]?.textContent.trim()   ?? "");
    }
    return cells.some((c) => dateTextMatches(c.textContent.trim()));
  }

  // ─── Find invoice-number column index ────────────────────────────────────────

  const invoiceNumIdx = headerTexts.findIndex(
    (h) => (h.includes("invoice") && (h.includes("number") || h.includes("no") || h.includes("id"))) ||
           h === "invoice"
  );
  log(`Invoice number column index: ${invoiceNumIdx}`);

  function isCreditNote(row) {
    const cells = [...row.querySelectorAll("td")];
    // prefer the dedicated invoice-number column; fall back to scanning all cells
    const candidates = invoiceNumIdx !== -1
      ? [cells[invoiceNumIdx]]
      : cells;
    return candidates.some((c) => /CN/i.test(c?.textContent.trim() ?? ""));
  }

  function isFileTypeCsv(row) {
    if (fileTypeIdx === -1) return false;
    const cells = [...row.querySelectorAll("td")];
    return cells[fileTypeIdx]?.textContent.trim().toUpperCase() === "CSV";
  }

  // ─── Collect matching rows ────────────────────────────────────────────────────

  const allBodyRows = [...table.querySelectorAll("tbody tr")]
    .filter((row) => row.querySelectorAll("td").length > 1);

  log(`Total body rows: ${allBodyRows.length}`);

  const periodRows = allBodyRows.filter(rowMatchesPeriod);

  const matchingRows = periodRows.filter((row) => {
    const cn = isCreditNote(row);
    if (docType === "invoice")    return !cn;
    if (docType === "creditNote") return  cn;
    return true; // "all"
  }).filter((row) => includeCsv || !isFileTypeCsv(row));

  const invoiceCount    = matchingRows.filter((r) => !isCreditNote(r)).length;
  const creditNoteCount = matchingRows.filter((r) =>  isCreditNote(r)).length;
  log(`Matching rows for [${targetLabel}]: ${matchingRows.length} (${invoiceCount} faktur, ${creditNoteCount} dobropisů)`);

  if (matchingRows.length === 0) {
    log("No matching invoices found.");
    chrome.runtime.sendMessage({ type: "INVOICE_DOWNLOAD_DONE", count: 0 });
    return;
  }

  function generateTimestamp() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
  }

  log(`Download mode: ${downloadMode}`);

  // ─── Listen for PDF URLs from MAIN world interceptor ─────────────────────────
  // background.js injected a window.open override in MAIN world that dispatches
  // document CustomEvent "__invoicePdfCaptured" whenever Amazon calls window.open.

  const _queue    = [];
  let   _resolver = null;

  document.addEventListener("__invoicePdfCaptured", (e) => {
    const url = e.detail?.url;
    if (!url) return;
    log(`CustomEvent received → ${url}`);
    if (_resolver) { const r = _resolver; _resolver = null; r(url); }
    else           { _queue.push(url); }
  }, true);

  function waitForUrl(timeoutMs = 30_000) {
    if (_queue.length > 0) return Promise.resolve(_queue.shift());
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { _resolver = null; reject(new Error("Timeout (30 s)")); }, timeoutMs);
      _resolver = (url) => { clearTimeout(t); resolve(url); };
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function toAbsoluteUrl(url) {
    if (!url || url.startsWith("http")) return url;
    if (url.startsWith("/")) return `${location.origin}${url}`;
    return url;
  }

  function filenameFromUrl(url, fallbackId, ext = "pdf") {
    try {
      const u    = new URL(url, location.origin);
      const last = u.pathname.split("/").filter(Boolean).pop()?.split("?")[0] ?? "";
      if (last.length > 4) {
        const dot = last.lastIndexOf(".");
        return dot > 0 ? last : `${last}.${ext}`;
      }
    } catch (_) {}
    return `${fallbackId}_invoice.${ext}`;
  }

  function extractInvoiceId(row) {
    for (const cell of row.querySelectorAll("td")) {
      const t = cell.textContent.trim();
      if (/^[A-Z0-9][\w\-]{3,}$/i.test(t)) return t.replace(/[^a-z0-9\-_]/gi, "_");
    }
    const link = row.querySelector("a[href]");
    if (link) {
      const last = link.href.split("/").filter(Boolean).pop()?.split("?")[0];
      if (last) return last;
    }
    return `invoice_${Date.now()}`;
  }

  function findViewButton(row) {
    return [...row.querySelectorAll("a, button, input[type='submit'], input[type='button']")]
      .find((el) => {
        const t = (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().toLowerCase();
        return t === "view" || t === "view invoice";
      }) ?? null;
  }

  // ─── Process rows sequentially ────────────────────────────────────────────────

  const seenUrls          = new Set();
  const zipFiles          = []; // collected for ZIP mode
  let   downloadCount      = 0;
  let   invoiceDownCount   = 0;
  let   creditNoteDownCount = 0;

  for (let i = 0; i < matchingRows.length; i++) {
    const row       = matchingRows[i];
    const invoiceId = extractInvoiceId(row);
    const viewBtn   = findViewButton(row);
    const ext       = isFileTypeCsv(row) ? "csv" : "pdf";

    if (!viewBtn) {
      warn(`Row ${i + 1}: no "View" button — skipping.`);
      continue;
    }

    try {
      const urlPromise = waitForUrl(30_000);
      viewBtn.click();
      log(`Row ${i + 1}/${matchingRows.length}: "View" clicked (${invoiceId}) — waiting…`);

      const rawUrl      = await urlPromise;
      const absoluteUrl = toAbsoluteUrl(rawUrl);

      if (seenUrls.has(absoluteUrl)) {
        log(`Row ${i + 1}: duplicate URL — skipping.`);
        continue;
      }
      seenUrls.add(absoluteUrl);

      const baseName = filenameFromUrl(absoluteUrl, invoiceId, ext);

      if (downloadMode === "zip") {
        log(`Row ${i + 1}: fetching for ZIP — "${baseName}"…`);
        const resp = await fetch(absoluteUrl, { credentials: "include" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = new Uint8Array(await resp.arrayBuffer());
        zipFiles.push({ filename: baseName, data });
        log(`Row ${i + 1}: ✅ fetched (${data.length} bytes)`);
      } else {
        log(`Row ${i + 1}: ✅ "${baseName}"`);
        chrome.runtime.sendMessage({ type: "INVOICE_PDF_READY", url: absoluteUrl, filename: baseName });
      }

      downloadCount++;
      if (isCreditNote(row)) creditNoteDownCount++; else invoiceDownCount++;
      await sleep(500);

    } catch (err) {
      warn(`Row ${i + 1} failed: ${err.message}`);
    }
  }

  // ─── ZIP: send all collected files to background ──────────────────────────────

  if (downloadMode === "zip" && zipFiles.length > 0) {
    const zipName = `Amazon_Invoices_${generateTimestamp()}.zip`;
    log(`Sending ${zipFiles.length} file(s) to background for ZIP: "${zipName}"`);
    chrome.runtime.sendMessage({ type: "INVOICE_ZIP_READY", files: zipFiles, zipName });
  }

  // ─── Cleanup and report done ──────────────────────────────────────────────────

  chrome.storage.local.remove("_invoiceDownloaderParams").catch(() => {});
  log(`Done — ${downloadCount}/${matchingRows.length} invoice(s) queued (${invoiceDownCount} faktur, ${creditNoteDownCount} dobropisů).`);
  chrome.runtime.sendMessage({ type: "INVOICE_DOWNLOAD_DONE", count: downloadCount, invoices: invoiceDownCount, creditNotes: creditNoteDownCount });

  } finally {
    _marker.remove(); // always remove guard, even on early return or error
  }

})();
