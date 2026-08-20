const TASK_CONFIG = {
  draftScraping: {
    pageType: "drafts",
    relativePath: "/myinventory/inventory/views/drafts?page=1&pageSize=250&sort=last_updated&subview=submitted-missing-info",
    scriptFile: "scraper.js"
  },
  violationsExport: {
    relativePath: "/performance/account/health/product-policies?t=intel",
    policyPaths: [
      "/performance/account/health/product-policies?t=intel",
      "/performance/account/health/product-policies?t=auth",
    ],
    scriptFile: "violations.js"
  },
  notifPrefsEmail: {
    relativePath: "/notifications/preferences",
    scriptFile: "notification_preferences.js"
  }
};
const MULTI_MARKET_QUEUE_KEY = "seller_extension_multi_market_queue_v1";
const DRAFT_MULTI_MARKET_QUEUE_KEY = "seller_extension_draft_multi_market_queue_v1";
const DRAFT_PROGRESS_KEY = "seller_extension_draft_progress_v1";
const VAT_REPORT_PROGRESS_KEY = "seller_extension_vat_report_progress_v1";
const SC_BOOKMARKS_STORAGE_KEY = "sc_bookmarks_v1";
const SC_BOOKMARKS_CONTEXT_MENU_ID = "sc_add_bookmark";
const DRAFT_SCHEDULE_STORAGE_KEY = "draft_interval_schedule_v1";
const DRAFT_SCHEDULE_ALARM = "draft_interval_schedule_alarm";
const DRAFT_COLLECTION_STORAGE_KEY = "draft_collection_state_v1";
const IBA_SCHEDULE_STORAGE_KEY = "iba_daily_schedule_v1";
const IBA_SCHEDULE_ALARM = "iba_daily_schedule_alarm";
const IBA_START_URL = "https://sellercentral.amazon.de/orders-v3/mfn/unshipped?orderType=IBA&orderStatus=unshipped&fulfillmentType=mfn&page=1&date-range=last-30&_ibaStart=1";
const VAT_REPORT_URL = "https://sellercentral.amazon.de/reportcentral/VAT_TRANSACTION/1";
const DRAFT_FEED_RETOOL_URL = "https://expandoadmin.retool.com/apps/010b5280-0eed-11ec-988e-5f01aea24295/Admin%20v2";
const DEFAULT_SELLER_CENTRAL_ORIGIN = "https://sellercentral.amazon.de";
const VAT_REPORT_PARAMS_KEY = "_vatReportParams";
const VAT_REPORT_PENDING_PARAMS_KEY = "_vatReportPendingParams";
const PRICE_CHANGE_QUEUE_KEY = "_priceChangeQueue";
const PRICE_CHANGE_PROGRESS_KEY = "_priceChangeProgress";
const SHIPPING_TEMPLATE_LIST_KEY = "_shippingTemplateList";
const CONSOLE_LOG_KEY = "seller_extension_console_log_v1";
const SHIPPING_TEMPLATES_PATH = "/sbr#shipping_templates";
const SPC_MARKET_LOAD_QUEUE_KEY = "_spcMarketLoadQueue";
const DELETE_QUEUE_KEY = "_templateDeleteQueue";
const DELETE_PROGRESS_KEY = "_templateDeleteProgress";
const INVENTORY_AGE_QUEUE_KEY = "_inventoryAgeQueue";
const INVENTORY_AGE_PROGRESS_KEY = "_inventoryAgeProgress";
const INVENTORY_AGE_RESULTS_KEY = "_inventoryAgeResults";
const INVENTORY_AGE_PATH = "/inventoryplanning/manageinventoryhealth";
const SPP_ASSIGN_PROGRESS_KEY = "_sppAssignProgress";
const SPP_ASSIGN_LOG_KEY = "_sppAssignLog";
const SPP_DOMAIN = "solutionproviderportal.amazon.com";
let sppAssignStopRequested = false;
const IBA_MULTI_PROGRESS_KEY = "_ibaMultiProgress";
const IBA_MULTI_STATE_KEY = "_ibaMultiState";
const IBA_MULTI_CLIENT_MODE_KEY = "_ibaMultiClientMode";
const ACCOUNT_LIST_LOADING_KEY = "_accountListLoading";
const ACCOUNT_LIST_ACCOUNTS_KEY = "_accountListAccounts";
let bgScrapingAccounts = false;

function getMarketCodeFromOrigin(origin) {
  try {
    const host = new URL(origin).hostname; // sellercentral.amazon.XX
    if (host.endsWith(".co.uk")) return "GB";
    if (host.endsWith(".com.be")) return "BE";
    if (host.endsWith(".com.tr")) return "TR";
    const tld = host.split(".").pop().toUpperCase();
    return tld || "??";
  } catch (_) { return "??"; }
}
const DRAFT_PARALLEL_TAB_COUNT = 1;
const SELLER_CENTRAL_URL_PATTERNS = ["<all_urls>"];

const taskStateByTabId = new Map();
const scriptInjectedTabs = new Set();
const stoppedTabs = new Set();

// ─── Invoice Downloader helpers ──────────────────────────────────────────────

// ─── ZIP builder (store/no-compression — PDFs are already compressed) ─────────

function _zipCrc32(bytes) {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(files) {
  // files: [{filename: string, data: Uint8Array}]
  const enc = new TextEncoder();
  const u16 = (v, d, o) => d.setUint16(o, v, true);
  const u32 = (v, d, o) => d.setUint32(o, v, true);

  const locals  = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.filename);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
    const crc  = _zipCrc32(data);
    const size = data.length;

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    u32(0x04034b50, lv, 0); u16(20, lv, 4); u16(0, lv, 6); u16(0, lv, 8);
    u16(0, lv, 10); u16(0, lv, 12); u32(crc, lv, 14);
    u32(size, lv, 18); u32(size, lv, 22); u16(name.length, lv, 26); u16(0, lv, 28);
    lh.set(name, 30);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    u32(0x02014b50, cv, 0); u16(20, cv, 4); u16(20, cv, 6); u16(0, cv, 8); u16(0, cv, 10);
    u16(0, cv, 12); u16(0, cv, 14); u32(crc, cv, 16); u32(size, cv, 20); u32(size, cv, 24);
    u16(name.length, cv, 28); u16(0, cv, 30); u16(0, cv, 32); u16(0, cv, 34);
    u16(0, cv, 36); u32(0, cv, 38); u32(offset, cv, 42);
    ch.set(name, 46);

    locals.push(lh, data);
    central.push(ch);
    offset += lh.length + size;
  }

  const cdSize   = central.reduce((s, c) => s + c.length, 0);
  const eocd     = new Uint8Array(22);
  const ev       = new DataView(eocd.buffer);
  u32(0x06054b50, ev, 0); u16(0, ev, 4); u16(0, ev, 6);
  u16(files.length, ev, 8); u16(files.length, ev, 10);
  u32(cdSize, ev, 12); u32(offset, ev, 16); u16(0, ev, 20);

  const parts = [...locals, ...central, eocd];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out   = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

function uint8ArrayToDataUrl(bytes) {
  // Convert in chunks to avoid call stack overflow
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return "data:application/zip;base64," + btoa(binary);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseYearMonth(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(year, month - 1, 1);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1
  ) {
    return null;
  }

  return parsed;
}

function getCoveredMonths(startMonth, endMonth) {
  const start = parseYearMonth(startMonth);
  const end = parseYearMonth(endMonth);

  if (!start || !end) {
    throw new Error("Start month or end month is invalid.");
  }

  if (start.getTime() > end.getTime()) {
    throw new Error("Start month must be earlier than or equal to end month.");
  }

  const months = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor.getTime() <= last.getTime()) {
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
}

function getMonthDateRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}/${pad2(month)}/01`,
    end: `${year}/${pad2(month)}/${pad2(lastDay)}`
  };
}

function formatVatMonthLabel(year, month) {
  return `${year}-${pad2(month)}`;
}

function buildVatReportMonths(startMonth, endMonth) {
  return getCoveredMonths(startMonth, endMonth).map(({ year, month }) => {
    const range = getMonthDateRange(year, month);
    return {
      year,
      month,
      label: formatVatMonthLabel(year, month),
      filename: `VAT_Transaction_${year}_${pad2(month)}.csv`,
      start: range.start,
      end: range.end
    };
  });
}

function buildVatReportZipName(months) {
  if (!Array.isArray(months) || months.length === 0) {
    return `VAT_Transaction_${Date.now()}.zip`;
  }

  const first = months[0].label;
  const last = months[months.length - 1].label;
  return `VAT_Transaction_${first}_to_${last}.zip`;
}

function createVatProgressState(params) {
  return {
    active: true,
    phase: "queued",
    message: `Preparing VAT export for ${params.months.length} month(s)...`,
    totalMonths: params.months.length,
    submittedCount: 0,
    downloadedCount: 0,
    currentMonthLabel: "",
    pendingMonths: params.months.map((entry) => entry.label),
    downloadedMonths: [],
    rangeStart: params.startMonth,
    rangeEnd: params.endMonth,
    zipName: params.zipName,
    downloadMode: params.downloadMode,
    error: ""
  };
}

async function setVatReportProgress(progress) {
  await chrome.storage.local.set({ [VAT_REPORT_PROGRESS_KEY]: progress });
}

async function injectVatReportDownloader(tabId, params) {
  await chrome.storage.local.set({ [VAT_REPORT_PARAMS_KEY]: params });
  await injectConsoleInterceptor(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["vat_report_downloader.js"]
  });
}

async function injectShippingPriceChanger(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["shipping_price_changer.js"],
  });
}

async function injectConsoleInterceptor(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__extensionLogBuffer) return;
      window.__extensionLogBuffer = [];
      const _ts = () => new Date().toISOString().replace("T", " ").slice(0, 23);
      ["log", "warn", "error"].forEach((m) => {
        const orig = console[m];
        console[m] = function (...args) {
          orig.apply(console, args);
          const line = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
          window.__extensionLogBuffer.push(`[${_ts()}] [${m.toUpperCase()}] ${line}`);
        };
      });
    },
  });
}

async function maybeDownloadConsoleLog(tabId, featureName) {
  const r = await chrome.storage.local.get(CONSOLE_LOG_KEY);
  if (r[CONSOLE_LOG_KEY] !== true) return;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (fname) => {
        const lines = window.__extensionLogBuffer || [];
        window.__extensionLogBuffer = [];
        if (!lines.length) return null;
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        return { url, filename: `${fname}_${ts}.log` };
      },
      args: [featureName],
    });
    if (result?.result?.url) {
      chrome.downloads.download({ url: result.result.url, filename: result.result.filename, conflictAction: "uniquify" });
    }
  } catch (_) { /* tab may be gone */ }
}

// Inject a MAIN-world script that reads Amazon's Backbone template models
// and dispatches them via CustomEvent so the isolated-world content script can
// build proper edit URLs (each legacy template has its own numeric ID).
async function injectMainWorldTemplateCapture(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      if (window.__sbrTemplateCaptureActive) return;
      window.__sbrTemplateCaptureActive = true;

      function dispatch(templates) {
        document.dispatchEvent(
          new CustomEvent("__sbrTemplateModels", { detail: { templates } })
        );
      }

      function tryExtract() {
        // Try several possible paths to Amazon's Backbone collection
        const modelArrays = [
          window.SBRUI?.Main?.controller?.shippingTemplatesCollection?.models,
          window.SBRUI?.Main?.app?.shippingTemplatesCollection?.models,
          window.SBRUIMain?.controller?.shippingTemplatesCollection?.models,
          window.SBRUIMain?.app?.shippingTemplatesCollection?.models,
        ].filter(Array.isArray);

        if (modelArrays.length === 0) return null;

        return modelArrays[0].map((m) => {
          const a = m.attributes || {};
          // Log all attribute keys so we can tune the extraction
          const allAttrs = JSON.stringify(Object.keys(a));
          console.log("[SBRCapture] model id=" + m.id + " cid=" + m.cid + " attrKeys=" + allAttrs);
          return {
            id: m.id || m.cid,
            // Backbone model's own primary key — often the real numeric/UUID template ID
            modelId: String(m.id || ""),
            // Try common attribute names used by Amazon SBR for the template identifier
            templateId:
              a.shippingTemplateId ||
              a.merchantShippingGroupId ||
              a.templateId ||
              a.id ||
              m.id ||
              "",
            name:
              a.shippingTemplateName ||
              a.merchantShippingGroupName ||
              a.templateName ||
              a.name ||
              "",
            allAttrKeys: allAttrs,
          };
        });
      }

      let tries = 0;
      const poll = setInterval(() => {
        const result = tryExtract();
        if (result !== null || tries > 40) {
          clearInterval(poll);
          dispatch(result || []);
        }
        tries++;
      }, 500);
    },
  });
}

async function injectInvoiceDownloader(tabId, params) {
  // Store params in local storage — readable by the isolated-world script
  await chrome.storage.local.set({ _invoiceDownloaderParams: params });
  await injectConsoleInterceptor(tabId);

  // Step 1: inject window.open interceptor into MAIN world via func (Chrome 95+).
  // Dispatches a document CustomEvent that isolated world listens to.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      if (window.__invoiceOpenInterceptorActive) return;
      window.__invoiceOpenInterceptorActive = true;
      const origOpen = window.open;
      window.open = function interceptedOpen(url, ...rest) {
        if (url && (url.includes("/documents/") || /\.pdf(\?|$)/i.test(url))) {
          document.dispatchEvent(
            new CustomEvent("__invoicePdfCaptured", { detail: { url } })
          );
          return null; // block new tab
        }
        return origOpen.apply(this, [url, ...rest]);
      };
    }
  });

  // Step 2a: isolated world diagnostic
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { console.log("[InvoiceDownloader] Isolated world func test OK"); }
  });

  // Step 2b: inject main logic in ISOLATED world (chrome.runtime available here).
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["invoice_downloader.js"]
  });
}
const draftRunsById = new Map();
let runningDraftRunId = null;

function encodeState(payload) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))));
}

function getDefaultIbaSchedule() {
  return {
    enabled: false,
    time: "17:00",
    nextRun: null
  };
}

function getDefaultDraftSchedule() {
  return {
    enabled: false,
    intervalMinutes: 30,
    nextRun: null,
    selectedEmail: "amazonmroauto@gmail.com",
    origin: DEFAULT_SELLER_CENTRAL_ORIGIN
  };
}

function getDefaultDraftCollectionState() {
  return {
    sessionActive: false,
    selectedEmail: "amazonmroauto@gmail.com",
    skuMarketPairs: [],
    uniqueSkus: [],
    marketplaces: [],
    totalRuns: 0,
    lastRunAt: null
  };
}

async function loadDraftSchedule() {
  const result = await chrome.storage.sync.get(DRAFT_SCHEDULE_STORAGE_KEY);
  const rawConfig = result[DRAFT_SCHEDULE_STORAGE_KEY];

  if (!rawConfig || typeof rawConfig !== "object") {
    return getDefaultDraftSchedule();
  }

  return {
    enabled: rawConfig.enabled === true,
    intervalMinutes: Number.isInteger(rawConfig.intervalMinutes) && rawConfig.intervalMinutes > 0 ? rawConfig.intervalMinutes : 30,
    nextRun: typeof rawConfig.nextRun === "number" ? rawConfig.nextRun : null,
    selectedEmail: typeof rawConfig.selectedEmail === "string" && rawConfig.selectedEmail.trim()
      ? rawConfig.selectedEmail.trim()
      : "amazonmroauto@gmail.com",
    origin: typeof rawConfig.origin === "string" && rawConfig.origin.trim()
      ? rawConfig.origin.trim()
      : DEFAULT_SELLER_CENTRAL_ORIGIN
  };
}

async function loadDraftCollectionState() {
  const result = await chrome.storage.local.get(DRAFT_COLLECTION_STORAGE_KEY);
  const rawState = result[DRAFT_COLLECTION_STORAGE_KEY];

  if (!rawState || typeof rawState !== "object") {
    return getDefaultDraftCollectionState();
  }

  const rawPairs = Array.isArray(rawState.skuMarketPairs) ? rawState.skuMarketPairs : [];
  // Rebuild from pairs if uniqueSkus missing, or migrate from old format
  const pairMap = new Map();
  // First seed from old uniqueSkus (market unknown) for migration
  for (const sku of (Array.isArray(rawState.uniqueSkus) ? rawState.uniqueSkus : [])) {
    if (sku) pairMap.set(sku, "");
  }
  // Then overlay with pairs (which have market info)
  for (const p of rawPairs) {
    if (p?.sku) pairMap.set(p.sku, p.market || "");
  }
  const skuMarketPairs = Array.from(pairMap.entries()).map(([sku, market]) => ({ sku, market }));

  return {
    sessionActive: rawState.sessionActive === true,
    selectedEmail: typeof rawState.selectedEmail === "string" && rawState.selectedEmail.trim()
      ? rawState.selectedEmail.trim()
      : "amazonmroauto@gmail.com",
    skuMarketPairs,
    uniqueSkus: skuMarketPairs.map((p) => p.sku),
    marketplaces: [...new Set(skuMarketPairs.map((p) => p.market).filter(Boolean))],
    totalRuns: Number.isInteger(rawState.totalRuns) && rawState.totalRuns >= 0 ? rawState.totalRuns : 0,
    lastRunAt: typeof rawState.lastRunAt === "number" ? rawState.lastRunAt : null
  };
}

async function saveDraftCollectionState(state) {
  await chrome.storage.local.set({
    [DRAFT_COLLECTION_STORAGE_KEY]: state
  });
}

async function mergeDraftCollectionResults({ skus, marketplace, selectedEmail, incrementRunCount = true }) {
  const currentState = await loadDraftCollectionState();

  // Build pair map: existing pairs first, then add new SKUs with market info
  const pairMap = new Map((currentState.skuMarketPairs || []).map((p) => [p.sku, p.market]));
  for (const sku of skus.filter(Boolean)) {
    if (!pairMap.has(sku)) {
      pairMap.set(sku, marketplace || "");
    }
  }
  const skuMarketPairs = Array.from(pairMap.entries()).map(([sku, market]) => ({ sku, market }));

  const nextState = {
    ...currentState,
    selectedEmail: selectedEmail || currentState.selectedEmail,
    skuMarketPairs,
    uniqueSkus: skuMarketPairs.map((p) => p.sku),
    marketplaces: [...new Set(skuMarketPairs.map((p) => p.market).filter(Boolean))],
    totalRuns: currentState.totalRuns + (incrementRunCount ? 1 : 0),
    lastRunAt: Date.now()
  };

  await saveDraftCollectionState(nextState);
  return nextState;
}

async function saveDraftSchedule(config) {
  await chrome.storage.sync.set({
    [DRAFT_SCHEDULE_STORAGE_KEY]: config
  });
}

async function loadIbaSchedule() {
  const result = await chrome.storage.sync.get(IBA_SCHEDULE_STORAGE_KEY);
  const rawConfig = result[IBA_SCHEDULE_STORAGE_KEY];

  if (!rawConfig || typeof rawConfig !== "object") {
    return getDefaultIbaSchedule();
  }

  return {
    enabled: rawConfig.enabled === true,
    time: typeof rawConfig.time === "string" ? rawConfig.time : "17:00",
    nextRun: typeof rawConfig.nextRun === "number" ? rawConfig.nextRun : null
  };
}

async function saveIbaSchedule(config) {
  await chrome.storage.sync.set({
    [IBA_SCHEDULE_STORAGE_KEY]: config
  });
}

function getNextIntervalTimestamp(intervalMinutes) {
  const minutes = Number.parseInt(String(intervalMinutes || 30), 10);

  if (Number.isNaN(minutes) || minutes < 5) {
    throw new Error("Draft interval must be at least 5 minutes.");
  }

  return Date.now() + minutes * 60 * 1000;
}

function getNextScheduleTimestamp(timeValue) {
  const [hoursPart, minutesPart] = String(timeValue || "17:00").split(":");
  const hours = Number.parseInt(hoursPart, 10);
  const minutes = Number.parseInt(minutesPart, 10);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid time format.");
  }

  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setSeconds(0, 0);
  nextRun.setHours(hours, minutes, 0, 0);

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime();
}

async function scheduleIbaAlarm(timeValue) {
  const nextRun = getNextScheduleTimestamp(timeValue);
  await chrome.alarms.clear(IBA_SCHEDULE_ALARM);
  await chrome.alarms.create(IBA_SCHEDULE_ALARM, { when: nextRun });
  return nextRun;
}

async function scheduleDraftAlarm(intervalMinutes) {
  const nextRun = getNextIntervalTimestamp(intervalMinutes);
  await chrome.alarms.clear(DRAFT_SCHEDULE_ALARM);
  await chrome.alarms.create(DRAFT_SCHEDULE_ALARM, { when: nextRun });
  return nextRun;
}

async function disableIbaSchedule() {
  await chrome.alarms.clear(IBA_SCHEDULE_ALARM);
  const config = {
    enabled: false,
    time: "17:00",
    nextRun: null
  };
  await saveIbaSchedule(config);
  return config;
}

async function disableDraftSchedule() {
  await chrome.alarms.clear(DRAFT_SCHEDULE_ALARM);
  const config = {
    ...getDefaultDraftSchedule(),
    enabled: false,
    nextRun: null
  };
  await saveDraftSchedule(config);
  return config;
}

async function enableIbaSchedule(timeValue) {
  const nextRun = await scheduleIbaAlarm(timeValue);
  const config = {
    enabled: true,
    time: timeValue,
    nextRun
  };
  await saveIbaSchedule(config);
  return config;
}

async function enableDraftSchedule(intervalMinutes, selectedEmail, origin) {
  const nextRun = await scheduleDraftAlarm(intervalMinutes);
  const config = {
    enabled: true,
    intervalMinutes: Number.parseInt(String(intervalMinutes), 10),
    nextRun,
    selectedEmail: typeof selectedEmail === "string" && selectedEmail.trim()
      ? selectedEmail.trim()
      : "amazonmroauto@gmail.com",
    origin: origin || DEFAULT_SELLER_CENTRAL_ORIGIN
  };
  await saveDraftSchedule(config);
  return config;
}

async function restoreIbaSchedule() {
  const config = await loadIbaSchedule();

  if (!config.enabled) {
    await chrome.alarms.clear(IBA_SCHEDULE_ALARM);
    return;
  }

  const nextRun = await scheduleIbaAlarm(config.time);
  await saveIbaSchedule({
    ...config,
    nextRun
  });
}

async function restoreDraftSchedule() {
  const config = await loadDraftSchedule();

  if (!config.enabled) {
    await chrome.alarms.clear(DRAFT_SCHEDULE_ALARM);
    return;
  }

  const nextRun = await scheduleDraftAlarm(config.intervalMinutes);
  await saveDraftSchedule({
    ...config,
    nextRun
  });
}

async function runScheduledIbaStart() {
  await chrome.tabs.create({
    url: IBA_START_URL,
    active: true
  });
}

// ─── Account list background scraper ─────────────────────────────────────────

// Helper: scrape current account rows as plain objects (sync, no side effects)
function bgAccountScrapeRows(tabId, knownLabels) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (known) => {
      return [...document.querySelectorAll(".full-page-account-switcher-account-details")]
        .map(row => {
          const ft = row.querySelector(".full-page-account-switcher-account-label")?.textContent?.trim() || "";
          const lbl = ft.replace(/\s*\(current\)|\s*\(selected\)/gi, "").trim();
          return { label: lbl, isCurrent: /\(current\)/i.test(ft), className: row.className };
        })
        .filter(a => a.label && !known.includes(a.label));
    },
    args: [knownLabels || []],
  }).then(([r]) => r?.result || []).catch(() => []);
}

// Helper: click one account row by label (sync)
function bgAccountClickRow(tabId, label) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (lbl) => {
      for (const row of document.querySelectorAll(".full-page-account-switcher-account-details")) {
        const txt = (row.querySelector(".full-page-account-switcher-account-label")?.textContent?.trim() || "")
          .replace(/\s*\(current\)|\s*\(selected\)/gi, "").trim();
        if (txt === lbl) { row.click(); return true; }
      }
      return false;
    },
    args: [label],
  }).catch(() => {});
}

async function bgScrapeAccounts(domain, parentId, mkid) {
  if (bgScrapingAccounts) return;
  bgScrapingAccounts = true;
  await chrome.storage.local.set({ [ACCOUNT_LIST_LOADING_KEY]: true });

  let bgTab = null;
  try {
    const accounts = new Map();

    // ── APPROACH 1: Direct API call from background (no tab, no DOM scraping) ──
    // Background service worker has credentials access via host_permissions <all_urls>.
    // /account-switcher/global-and-regional-account/merchantMarketplace returns
    // globalAccounts[] with nested globalAccounts[] for agency sub-sellers.
    const apiData = await fetch(
      `https://${domain}/account-switcher/global-and-regional-account/merchantMarketplace`,
      {
        credentials: "include",
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "x-requested-with": "XMLHttpRequest",
        },
      }
    ).then(r => r.ok ? r.json() : null).catch(() => null);

    console.log("[bgScrapeAccounts] API globalAccounts:", JSON.stringify(apiData?.globalAccounts)?.slice(0, 500));

    const apiGlobal = apiData?.globalAccounts;
    if (Array.isArray(apiGlobal) && apiGlobal.length > 0) {
      const buildFromApi = (list, parentLabel) => {
        for (const acct of list) {
          const lbl = (acct.label || acct.name || acct.sellerName || "").trim();
          if (!lbl) continue;
          const isCurrent = !!(acct.isCurrent || acct.current || acct.isSelected);
          const children = Array.isArray(acct.globalAccounts) ? acct.globalAccounts
            : Array.isArray(acct.children) ? acct.children
            : Array.isArray(acct.subAccounts) ? acct.subAccounts : [];
          if (!accounts.has(lbl)) {
            accounts.set(lbl, { label: lbl, isCurrent, parent: parentLabel, hasChildren: children.length > 0 });
          }
          if (children.length > 0) buildFromApi(children, lbl);
        }
      };
      buildFromApi(apiGlobal, null);
    }

    // ── APPROACH 2: Background tab + Pinia _s Map (reads store, no clicking) ──
    // AJAX calls work normally in background tabs; only rAF (rendering) is throttled.
    // Pinia state is populated by the page's own API calls, independently of DOM render.
    // Also run if Approach 1 returned a flat list (no hasChildren) — API doesn't return hierarchy.
    if (accounts.size === 0 || ![...accounts.values()].some(a => a.hasChildren)) {
      const candidates = [
        `https://${domain}/account-switcher/default/merchantMarketplace`,
        `https://${domain}/account-switcher`,
      ];

      for (const url of candidates) {
        bgTab = await chrome.tabs.create({ url, active: false });

        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 10000);
          function listener(tabId, info) {
            if (tabId !== bgTab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer); resolve();
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        // Wait for Vue to fetch and populate Pinia (API calls, not DOM renders)
        await new Promise(r => setTimeout(r, 1500));

        const piniaResult = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id },
          world: "MAIN",
          func: () => {
            try {
              // Search all DOM elements for Vue 3 app mount point
              let app = null;
              for (const el of document.querySelectorAll("*")) {
                if (el.__vue_app__) { app = el.__vue_app__; break; }
              }
              if (!app) return { debug: "no vue app" };

              const pinia = app.config?.globalProperties?.$pinia;
              if (!pinia) return { debug: "no pinia" };

              // Use pinia._s (internal Map of all stores) for reliable access
              const storeMap = pinia._s || new Map();
              const results = [];

              for (const [storeId, store] of storeMap) {
                const state = store.$state || {};
                for (const [key, val] of Object.entries(state)) {
                  // Find arrays that look like account lists
                  const list = Array.isArray(val) ? val
                    : (val && typeof val === "object" && !Array.isArray(val))
                      ? Object.values(val).find(v => Array.isArray(v) && v.length > 0 && (v[0]?.label || v[0]?.name))
                      : null;
                  if (!list || !list.length) continue;
                  const first = list[0];
                  if (typeof first !== "object" || !(first.label || first.name)) continue;

                  for (const acct of list) {
                    const lbl = (acct.label || acct.name || acct.sellerName || "").trim();
                    if (!lbl) continue;
                    const isCurrent = !!(acct.isCurrent || acct.current || acct.isSelected);
                    const children = Array.isArray(acct.globalAccounts) ? acct.globalAccounts
                      : Array.isArray(acct.children) ? acct.children
                      : Array.isArray(acct.subAccounts) ? acct.subAccounts : [];
                    results.push({ label: lbl, isCurrent, parentLabel: null, hasChildren: children.length > 0 });
                    for (const child of children) {
                      const cLbl = (child.label || child.name || "").trim();
                      if (!cLbl) continue;
                      results.push({ label: cLbl, isCurrent: !!(child.isCurrent || child.current), parentLabel: lbl, hasChildren: false });
                    }
                  }
                  if (results.length > 0) {
                    console.log("[bgScrapeAccounts] Pinia storeId:", storeId, "key:", key, "count:", results.length);
                    return results;
                  }
                }
              }

              // Debug: what stores exist?
              const storeDebug = {};
              for (const [id, s] of storeMap) storeDebug[id] = Object.keys(s.$state || {});
              return { debug: "no accounts found", stores: storeDebug };
            } catch (e) { return { debug: "error: " + e.message }; }
          },
        }).then(([r]) => r?.result).catch(() => null);

        console.log("[bgScrapeAccounts] Pinia result:", JSON.stringify(piniaResult)?.slice(0, 500));

        // Pinia: only use if it found hierarchy (some accounts with hasChildren=true).
        // A flat list (all hasChildren=false) is unreliable — fall through to DOM.
        if (Array.isArray(piniaResult) && piniaResult.length > 0 && piniaResult.some(a => a.hasChildren)) {
          for (const a of piniaResult) {
            accounts.set(a.label, { label: a.label, isCurrent: a.isCurrent, parent: a.parentLabel, hasChildren: a.hasChildren });
          }
          break;
        }

        // ── APPROACH 3: Expand-all then read full DOM ──
        // Click all top-level rows at once (30ms apart) → wait once 600ms → read full DOM.
        // ~800ms total vs N×400ms sequential (e.g. 8 accounts = 3.2s → 0.8s).
        // Vue reactive updates use microtasks (not rAF) so they work in background tabs.
        // isCountry filter distinguishes SPN sub-sellers from country/marketplace rows.
        await new Promise(r => setTimeout(r, 400));

        const _t0 = Date.now();

        const topLevelLabels = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id },
          func: () => [...document.querySelectorAll(".full-page-account-switcher-account-details")]
            .filter(b => b.offsetHeight > 0)
            .map(b => {
              const ft = b.querySelector(".full-page-account-switcher-account-label")?.textContent?.trim() || "";
              return ft.replace(/\s*\(current\)|\s*\(selected\)/gi, "").trim();
            }).filter(Boolean),
        }).then(([r]) => r?.result || []).catch(() => []);

        console.log("[bgScrapeAccounts] Expanding", topLevelLabels.length, "top-level accounts...");

        for (const lbl of topLevelLabels) {
          await bgAccountClickRow(bgTab.id, lbl);
          await new Promise(r => setTimeout(r, 30));
        }
        await new Promise(r => setTimeout(r, 600));

        const expandedRows = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id },
          func: () => {
            const COUNTRIES = new Set(["afghanistan","albania","algeria","andorra","angola","argentina","armenia","australia","austria","azerbaijan","bahrain","bangladesh","belarus","belgium","belize","benin","bhutan","bolivia","brazil","brunei","bulgaria","cambodia","cameroon","canada","chile","china","colombia","congo","costa rica","croatia","cuba","cyprus","czech republic","czechia","denmark","ecuador","egypt","el salvador","estonia","ethiopia","finland","france","georgia","germany","ghana","greece","guatemala","hungary","iceland","india","indonesia","iran","iraq","ireland","israel","italy","jamaica","japan","jordan","kazakhstan","kenya","kuwait","latvia","lebanon","liechtenstein","lithuania","luxembourg","malaysia","malta","mauritius","mexico","moldova","monaco","mongolia","montenegro","morocco","nepal","netherlands","new zealand","nicaragua","nigeria","north korea","north macedonia","norway","oman","pakistan","panama","paraguay","peru","philippines","poland","portugal","qatar","romania","russia","saudi arabia","senegal","serbia","singapore","slovakia","slovenia","south africa","south korea","spain","sri lanka","sweden","switzerland","taiwan","tajikistan","tanzania","thailand","tunisia","turkey","ukraine","united arab emirates","united kingdom","united states","uruguay","uzbekistan","venezuela","vietnam","yemen","zambia","zimbabwe"]);
            const isCountry = lbl => COUNTRIES.has(lbl.replace(/\s*\(pending\s+registration\)/i, "").trim().toLowerCase());
            const rows = [];
            for (const btn of document.querySelectorAll(".full-page-account-switcher-account-details")) {
              if (btn.offsetHeight === 0) continue;
              const ft = btn.querySelector(".full-page-account-switcher-account-label")?.textContent?.trim() || "";
              const lbl = ft.replace(/\s*\(current\)|\s*\(selected\)/gi, "").trim();
              if (!lbl || isCountry(lbl)) continue;
              const isCurrent = /\(current\)/i.test(ft);
              // Ancestry traversal to detect parent SPN
              let parentLabel = null;
              let el = btn.parentElement;
              while (el && el !== document.body) {
                const cls = el.className || "";
                if (cls.includes("full-page-account-switcher-account") &&
                    !cls.includes("full-page-account-switcher-accounts") &&
                    !cls.includes("full-page-account-switcher-account-details") &&
                    !cls.includes("full-page-account-switcher-account-branch") &&
                    !cls.includes("full-page-account-switcher-account-store") &&
                    !cls.includes("full-page-account-switcher-account-expander") &&
                    !cls.includes("full-page-account-switcher-account-label")) {
                  const pBtn = el.querySelector(".full-page-account-switcher-account-details");
                  if (pBtn && pBtn !== btn) {
                    const pft = pBtn.querySelector(".full-page-account-switcher-account-label")?.textContent?.trim() || "";
                    const plbl = pft.replace(/\s*\(current\)|\s*\(selected\)/gi, "").trim();
                    if (plbl && !isCountry(plbl)) { parentLabel = plbl; break; }
                  }
                }
                el = el.parentElement;
              }
              rows.push({ label: lbl, isCurrent, parentLabel });
            }
            return rows;
          },
        }).then(([r]) => r?.result || []).catch(() => []);

        console.log(`[bgScrapeAccounts] Expand-all done in ${((Date.now() - _t0) / 1000).toFixed(2)}s — ${expandedRows.length} rows`);

        for (const r of expandedRows) {
          if (!accounts.has(r.label)) {
            accounts.set(r.label, { label: r.label, isCurrent: r.isCurrent, parent: r.parentLabel, hasChildren: false });
          } else if (r.parentLabel && !accounts.get(r.label).parent) {
            accounts.get(r.label).parent = r.parentLabel;
          } else if (r.parentLabel && accounts.get(r.label).parent && accounts.get(r.label).parent !== r.parentLabel) {
            const dupKey = `${r.label}::${r.parentLabel}`;
            if (!accounts.has(dupKey)) {
              accounts.set(dupKey, { label: r.label, isCurrent: r.isCurrent, parent: r.parentLabel, hasChildren: false });
            }
          }
          if (r.parentLabel && accounts.has(r.parentLabel)) {
            accounts.get(r.parentLabel).hasChildren = true;
          }
        }

        if (accounts.size > 0) break;
        await chrome.tabs.remove(bgTab.id).catch(() => {});
        bgTab = null;
      }
    }

    const accountsList = [...accounts.values()];
    await chrome.storage.local.set({ [ACCOUNT_LIST_ACCOUNTS_KEY]: { accounts: accountsList, cachedAt: Date.now() } });
    chrome.runtime.sendMessage({ type: "ACCOUNT_LIST_READY", accounts: accountsList }).catch(() => {});
  } catch (err) {
    console.error("[bgScrapeAccounts] error:", err);
    await chrome.storage.local.set({ [ACCOUNT_LIST_ACCOUNTS_KEY]: { error: err.message, cachedAt: Date.now() } });
    chrome.runtime.sendMessage({ type: "ACCOUNT_LIST_READY", error: err.message }).catch(() => {});
  } finally {
    bgScrapingAccounts = false;
    await chrome.storage.local.set({ [ACCOUNT_LIST_LOADING_KEY]: false });
    if (bgTab) await chrome.tabs.remove(bgTab.id).catch(() => {});
  }
}


// ─── IBA Multi-client orchestration ──────────────────────────────────────────

function ibaMultiWaitForTabLoad(tabId, timeoutMs = 20000) {
  return new Promise(resolve => {
    let sawLoading = false;
    const timer = setTimeout(resolve, timeoutMs);
    function listener(tid, info) {
      if (tid !== tabId) return;
      if (info.status === "loading") { sawLoading = true; return; }
      if (info.status === "complete" && sawLoading) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ibaMultiProcessNext() {
  const stored = await chrome.storage.local.get(IBA_MULTI_STATE_KEY);
  const state = stored[IBA_MULTI_STATE_KEY];
  if (!state) return;

  const { accounts, currentIndex, results } = state;

  if (currentIndex >= accounts.length) {
    await chrome.storage.local.remove(IBA_MULTI_CLIENT_MODE_KEY);
    await chrome.storage.local.set({
      [IBA_MULTI_PROGRESS_KEY]: {
        active: false, done: true, results,
        total: accounts.length, completedAt: Date.now(),
      }
    });
    if (state.tabId) {
      try { await chrome.tabs.remove(state.tabId); } catch { /* tab already closed */ }
    }
    await chrome.storage.local.remove(IBA_MULTI_STATE_KEY);
    return;
  }

  const accountLabel = accounts[currentIndex];
  await chrome.storage.local.set({
    [IBA_MULTI_PROGRESS_KEY]: {
      active: true, phase: "switching",
      currentAccount: accountLabel,
      current: currentIndex + 1, total: accounts.length, results,
    }
  });

  // Ensure we have a live tab
  let tabId = state.tabId;
  if (tabId) {
    try { await chrome.tabs.get(tabId); } catch { tabId = null; }
  }
  if (!tabId) {
    const tab = await chrome.tabs.create({ url: "about:blank", active: true });
    tabId = tab.id;
  }
  await chrome.storage.local.set({ [IBA_MULTI_STATE_KEY]: { ...state, tabId } });

  // Navigate to account-switcher — register listener BEFORE tabs.update to avoid race condition
  const switcherUrl = "https://sellercentral.amazon.de/account-switcher/default/merchantMarketplace";
  const switcherLoadPromise = ibaMultiWaitForTabLoad(tabId, 20000);
  await chrome.tabs.update(tabId, { url: switcherUrl });
  await switcherLoadPromise;
  await new Promise(r => setTimeout(r, 1500));

  // Select the account and always switch to Germany — IBA runs only on DE
  const selectResult = await chrome.tabs.sendMessage(tabId, {
    action: "DO_ACCOUNT_SELECT",
    sellerName: accountLabel,
    marketLabel: "Germany",
  }).catch(() => ({ success: false, error: "Content script unavailable" }));

  if (!selectResult?.success) {
    const newResults = [...results, { account: accountLabel, status: "error", error: selectResult?.error || "Account selection failed" }];
    await chrome.storage.local.set({ [IBA_MULTI_STATE_KEY]: { ...state, tabId, currentIndex: currentIndex + 1, results: newResults } });
    await ibaMultiProcessNext();
    return;
  }

  // Wait for navigation away from account-switcher
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 15000);
    function onUpd(tid, info) {
      if (tid !== tabId || info.status !== "complete") return;
      chrome.tabs.get(tabId).then(t => {
        if (t.url && !t.url.includes("/account-switcher/")) {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(onUpd);
          resolve();
        }
      }).catch(() => {});
    }
    chrome.tabs.onUpdated.addListener(onUpd);
  });

  // Set multi-client mode so content script suppresses alerts and sends IBA_DONE
  await chrome.storage.local.set({ [IBA_MULTI_CLIENT_MODE_KEY]: true });
  await chrome.storage.local.set({
    [IBA_MULTI_PROGRESS_KEY]: {
      active: true, phase: "iba_running",
      currentAccount: accountLabel,
      current: currentIndex + 1, total: accounts.length, results,
    }
  });

  await chrome.tabs.update(tabId, { url: IBA_START_URL });
  // Content script detects _ibaStart=1, runs automation, sends IBA_DONE when finished.
}

async function runScheduledDraftStart(config) {
  const origin = getSellerCentralOrigin(config?.origin) || DEFAULT_SELLER_CENTRAL_ORIGIN;
  await startTask("draftScraping", {
    selectedEmail: config?.selectedEmail || "amazonmroauto@gmail.com",
    maxSkuCount: null,
    openInBackground: true,
    forceOrigin: origin
  });
}

async function rescheduleDraftAfterManualRun(selectedEmail) {
  const config = await loadDraftSchedule();

  if (!config.enabled) {
    return null;
  }

  const nextRun = await scheduleDraftAlarm(config.intervalMinutes);
  const nextConfig = {
    ...config,
    nextRun,
    selectedEmail: typeof selectedEmail === "string" && selectedEmail.trim()
      ? selectedEmail.trim()
      : config.selectedEmail
  };
  await saveDraftSchedule(nextConfig);
  return nextConfig;
}

function buildMultiMarketPricingUrl(market) {
  const domain = market.domain || "sellercentral.amazon.de";
  const url = new URL(`https://${domain}/myinventory/inventory`);
  url.searchParams.set("fulfilledBy", "all");
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "250");
  url.searchParams.set("sort", "sales_desc");
  url.searchParams.set("status", "pricing_issue");
  if (market.mkid) url.searchParams.set("mons_sel_mkid", market.mkid);
  if (market.mcid) url.searchParams.set("mons_sel_dir_mcid", market.mcid);
  if (market.globalAccountId) url.searchParams.set("mons_sel_dir_paid", market.globalAccountId);
  url.searchParams.set("ignore_selection_changed", "true");
  url.searchParams.set("_pricingFixerStart", "1");
  return url.toString();
}

function buildMultiMarketDraftUrl(market) {
  const domain = market.domain || "sellercentral.amazon.de";
  const url = new URL(`https://${domain}/myinventory/inventory/views/drafts`);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "250");
  url.searchParams.set("sort", "last_updated");
  url.searchParams.set("subview", "submitted-missing-info");
  if (market.mkid) url.searchParams.set("mons_sel_mkid", market.mkid);
  if (market.mcid) url.searchParams.set("mons_sel_dir_mcid", market.mcid);
  if (market.globalAccountId) url.searchParams.set("mons_sel_dir_paid", market.globalAccountId);
  url.searchParams.set("ignore_selection_changed", "true");
  return url.toString();
}

// Navigate to /home with mons_sel_ params to switch the market context reliably.
// After /home loads the account is switched — then navigate to /sbr to load templates.
function buildShippingTemplatesSwitchUrl(market, baseDomain) {
  const domain = baseDomain || DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
  const url = new URL(`https://${domain}/home`);
  if (market.mkid) url.searchParams.set("mons_sel_mkid", market.mkid);
  if (market.mcid) url.searchParams.set("mons_sel_dir_mcid", market.mcid);
  if (market.globalAccountId) url.searchParams.set("mons_sel_dir_paid", market.globalAccountId);
  if (market.mkid || market.mcid) url.searchParams.set("ignore_selection_changed", "true");
  return url.toString();
}

// Plain /sbr URL — used after the account switch has already been done via /home.
function buildShippingTemplatesUrl(baseDomain) {
  const domain = baseDomain || DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
  return `https://${domain}/sbr#shipping_templates`;
}

function getSellerCentralOrigin(urlString) {
  let parsedUrl;

  try {
    parsedUrl = new URL(urlString);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "https:") {
    return null;
  }

  if (!/^sellercentral\.amazon\./.test(parsedUrl.hostname)) {
    return null;
  }

  return parsedUrl.origin;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function buildDraftPageUrl(origin, pageNumber) {
  const url = new URL(`${origin}${TASK_CONFIG.draftScraping.relativePath}`);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function createDraftRunState(options) {
  const runId = `draft_run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const workerCount = options.workerCount || DRAFT_PARALLEL_TAB_COUNT;

  return {
    runId,
    taskType: "draftScraping",
    origin: options.origin,
    selectedEmail: typeof options.selectedEmail === "string" ? options.selectedEmail : "",
    maxSkuCount: Number.isInteger(options.maxSkuCount) && options.maxSkuCount > 0 ? options.maxSkuCount : null,
    skipRetool: options.skipRetool === true,
    openInBackground: options.openInBackground === true,
    scriptFile: TASK_CONFIG.draftScraping.scriptFile,
    workerCount,
    activeTabIds: new Set(),
    uniqueSkus: new Set(),
    marketplaces: new Set(),
    accountLabel: "amazon_skus",
    stopping: false,
    finalized: false
  };
}

function getDraftRun(runId) {
  return runId ? draftRunsById.get(runId) : null;
}

async function registerDraftWorkerTab(runState, workerIndex) {
  const pageNumber = workerIndex + 1;
  const createdTab = await chrome.tabs.create({
    url: buildDraftPageUrl(runState.origin, pageNumber),
    active: runState.openInBackground !== true && workerIndex === 0
  });

  if (!createdTab.id) {
    throw new Error(`Failed to create draft worker tab ${workerIndex + 1}.`);
  }

  runState.activeTabIds.add(createdTab.id);
  stoppedTabs.delete(createdTab.id);
  scriptInjectedTabs.delete(createdTab.id);
  taskStateByTabId.set(createdTab.id, {
    taskType: "draftScraping",
    runId: runState.runId,
    targetUrl: createdTab.url,
    scriptFile: runState.scriptFile,
    selectedEmail: runState.selectedEmail,
    maxSkuCount: runState.maxSkuCount,
    origin: runState.origin,
    workerIndex,
    pageNumber,
    pageStep: runState.workerCount,
    pageReported: false
  });
}

async function closeDraftWorkerTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    clearTask(tabId);
  }
}

async function finalizeDraftRun(runId) {
  const runState = getDraftRun(runId);

  if (!runState || runState.finalized) {
    return;
  }

  runState.finalized = true;
  draftRunsById.delete(runId);

  if (runningDraftRunId === runId) {
    runningDraftRunId = null;
  }

  const skus = [...runState.uniqueSkus];
  const marketplaces = [...runState.marketplaces];

  if (skus.length === 0 || !runState.selectedEmail) {
    return;
  }

  // Always merge into collection (collection session is always active during scraping)
  await mergeDraftCollectionResults({
    skus,
    marketplace: marketplaces.join(", "),
    selectedEmail: runState.selectedEmail
  });

  if (runState.skipRetool || runState.stopping) {
    return;
  }

  // Check if there's a next market in the multi-market draft queue
  const draftQueueResult = await chrome.storage.local.get(DRAFT_MULTI_MARKET_QUEUE_KEY);
  const draftQueue = draftQueueResult[DRAFT_MULTI_MARKET_QUEUE_KEY];

  if (draftQueue && typeof draftQueue === "object") {
    // Update progress (market scraping hotovo)
    const progressResult = await chrome.storage.local.get(DRAFT_PROGRESS_KEY);
    const progress = progressResult[DRAFT_PROGRESS_KEY];
    if (progress) {
      if (progress.markets[draftQueue.index]) progress.markets[draftQueue.index].done = true;
      progress.done = draftQueue.index + 1;
      await chrome.storage.local.set({ [DRAFT_PROGRESS_KEY]: progress });
    }

    // Uložit retoolTabId do queue stavu, aby ho mohl DRAFT_FEED_SUBMITTED handler použít
    await chrome.storage.local.set({
      [DRAFT_MULTI_MARKET_QUEUE_KEY]: { ...draftQueue, retoolTabId: runState.retoolTabId }
    });

    if (runState.skipRetool) {
      // CSV mode: přejít přímo na další market (bez Retoolu)
      const nextIndex = draftQueue.index + 1;
      if (nextIndex < draftQueue.queue.length) {
        const nextMarket = draftQueue.queue[nextIndex];
        await chrome.storage.local.set({ [DRAFT_MULTI_MARKET_QUEUE_KEY]: { ...draftQueue, index: nextIndex, retoolTabId: runState.retoolTabId } });
        try {
          await chrome.tabs.update(runState.retoolTabId, { url: buildMultiMarketDraftUrl(nextMarket) });
        } catch {
          await chrome.tabs.create({ url: buildMultiMarketDraftUrl(nextMarket), active: true });
        }
      } else {
        await chrome.storage.local.remove(DRAFT_MULTI_MARKET_QUEUE_KEY);
        await chrome.storage.local.remove(DRAFT_PROGRESS_KEY);
      }
      return;
    }

    // Retool mode: odeslat TENTO market do Retoolu zvlášť
    // Po submitu v Retoolu background obdrží DRAFT_FEED_SUBMITTED → pokračuje na další market
    const payload = encodeState({
      email: runState.selectedEmail,
      marketplace: marketplaces.join(", "),
      skus
    });
    const retoolUrl = `${DRAFT_FEED_RETOOL_URL}?_draftFeed=${encodeURIComponent(payload)}`;
    try {
      await chrome.tabs.update(runState.retoolTabId, { url: retoolUrl });
    } catch {
      await chrome.tabs.create({ url: retoolUrl, active: true });
    }
    return;
  }

  // Single market (no queue) — build Retool URL from this run's data
  const payload = encodeState({
    email: runState.selectedEmail,
    marketplace: marketplaces.join(", "),
    skus
  });
  const retoolUrl = `${DRAFT_FEED_RETOOL_URL}?_draftFeed=${encodeURIComponent(payload)}`;

  if (runState.retoolTabId) {
    try {
      await chrome.tabs.update(runState.retoolTabId, { url: retoolUrl });
      return;
    } catch { /* fallback */ }
  }
  await chrome.tabs.create({ url: retoolUrl, active: true });
}

function maybeFinalizeDraftRun(runId) {
  const runState = getDraftRun(runId);

  if (!runState || runState.finalized || runState.activeTabIds.size > 0) {
    return;
  }

  void finalizeDraftRun(runId);
}

async function startTask(taskType, options = {}) {
  const activeTab = await getActiveTab();
  const origin = options.forceOrigin || getSellerCentralOrigin(activeTab?.url || "");

  if (!origin) {
    throw new Error("Active tab is not on a Seller Central domain.");
  }

  if (taskType === "draftScraping") {
    if (runningDraftRunId && draftRunsById.has(runningDraftRunId)) {
      throw new Error("Draft scraping is already running.");
    }

    const runState = createDraftRunState({
      ...options,
      origin
    });

    draftRunsById.set(runState.runId, runState);
    runningDraftRunId = runState.runId;

    try {
      for (let workerIndex = 0; workerIndex < runState.workerCount; workerIndex += 1) {
        await registerDraftWorkerTab(runState, workerIndex);
      }
    } catch (error) {
      runState.stopping = true;
      await Promise.all([...runState.activeTabIds].map((tabId) => closeDraftWorkerTab(tabId)));
      draftRunsById.delete(runState.runId);

      if (runningDraftRunId === runState.runId) {
        runningDraftRunId = null;
      }

      throw error;
    }

    return;
  }

  const taskConfig = TASK_CONFIG[taskType];
  const targetUrl = `${origin}${taskConfig.relativePath}`;

  const violationsMarkets = taskType === "violationsExport" && Array.isArray(options.markets) ? options.markets : [];
  const hasViolationsMarkets = violationsMarkets.length > 0;
  const notifMarkets = taskType === "notifPrefsEmail" && Array.isArray(options.markets) ? options.markets : [];
  const hasNotifMarkets = notifMarkets.length > 0;
  const initialUrl = (taskType === "violationsExport" && hasViolationsMarkets) || (taskType === "notifPrefsEmail" && hasNotifMarkets)
    ? `${origin}/account-switcher/default/merchantMarketplace`
    : targetUrl;

  const createdTab = await chrome.tabs.create({
    url: initialUrl,
    active: options.openInBackground === true ? false : true
  });

  if (!createdTab.id) {
    throw new Error("Failed to create scraping tab.");
  }

  if (taskType === "draftScraping") {
    runningDraftTabId = createdTab.id;
  }

  stoppedTabs.delete(createdTab.id);
  scriptInjectedTabs.delete(createdTab.id);
  taskStateByTabId.set(createdTab.id, {
    taskType,
    targetUrl,
    scriptFile: taskConfig.scriptFile,
    selectedEmail: typeof options.selectedEmail === "string" ? options.selectedEmail : "",
    maxSkuCount: Number.isInteger(options.maxSkuCount) && options.maxSkuCount > 0 ? options.maxSkuCount : null,
    violationStage: taskType === "violationsExport" ? (hasViolationsMarkets ? "onSwitcher" : "collectPolicy") : null,
    violationsPolicyPathIndex: 0,
    violationsMarketQueue: violationsMarkets,
    violationsMarketIndex: 0,
    violationsAllResults: [],
    violationsSellerName: taskType === "violationsExport" ? (options.sellerName || null) : null,
    notifStage: taskType === "notifPrefsEmail" ? (hasNotifMarkets ? "onSwitcher" : "collectPrefs") : null,
    notifMarketQueue: notifMarkets,
    notifMarketIndex: 0,
    notifEmail: taskType === "notifPrefsEmail" ? (options.email || "") : null,
    notifSellerName: taskType === "notifPrefsEmail" ? (options.sellerName || null) : null,
    notifResults: [],
    notifSectionIndex: 0,
    notifPartialSectionResults: [],
    notifPrefsTimerRunning: false,
    notifPrefsInjectAttempts: 0,
    notifLastReloadTime: 0,
    processing: false,
    origin,
    violations: [],
    uniqueAsins: [],
    asinIndex: 0,
    asinOrderCount: {},
    asinSkuMap: {}
  });
}

async function stopTask() {
  if (runningDraftRunId === null) {
    throw new Error("No draft scraping tab is running.");
  }

  const runState = getDraftRun(runningDraftRunId);

  if (!runState) {
    runningDraftRunId = null;
    throw new Error("No draft scraping tab is running.");
  }

  runState.stopping = true;

  await Promise.all([...runState.activeTabIds].map(async (tabId) => {
    stoppedTabs.add(tabId);

    try {
      await chrome.tabs.sendMessage(tabId, { type: "STOP_SCRAPING" });
    } catch {
      // Ignore if no receiver is available in the tab yet.
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.__sellerExtensionStopRequested = true;
        }
      });
    } catch {
      // Ignore if the tab is already gone or injection is no longer possible.
    }

    await closeDraftWorkerTab(tabId);
  }));
}

function clearTask(tabId) {
  const taskState = taskStateByTabId.get(tabId);
  taskStateByTabId.delete(tabId);
  scriptInjectedTabs.delete(tabId);
  stoppedTabs.delete(tabId);

  if (taskState?.taskType === "draftScraping") {
    const runState = getDraftRun(taskState.runId);

    if (runState) {
      runState.activeTabIds.delete(tabId);
      maybeFinalizeDraftRun(taskState.runId);
    }
  }
}

function getOrderSearchUrl(origin, asin) {
  return `${origin}/orders-v3/search?myo-search-type=asin&page=1&date-range=last-365&q=${encodeURIComponent(asin)}&qt=asin`;
}

function getInventoryUrl(origin, asin) {
  return `${origin}/myinventory/inventory?fulfilledBy=all&page=1&pageSize=250&searchField=all&searchTerm=${encodeURIComponent(asin)}&sort=sales_desc&status=all&searchValue=${encodeURIComponent(asin)}`;
}

function isDraftPageUrl(urlString) {
  try {
    const url = new URL(urlString);
    return (
      url.pathname === TASK_CONFIG.draftScraping.relativePath.split("?")[0] ||
      url.pathname === "/myinventory/inventory"
    );
  } catch {
    return false;
  }
}

async function injectDraftScraper(tabId, taskState) {
  if (!taskState || taskState.taskType !== "draftScraping") {
    return;
  }

  const runState = getDraftRun(taskState.runId);

  if (!runState || runState.stopping || stoppedTabs.has(tabId) || scriptInjectedTabs.has(tabId)) {
    return;
  }

  scriptInjectedTabs.add(tabId);

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (maxSkuCount) => {
        window.__sellerExtensionDraftSkuLimit = maxSkuCount;
      },
      args: [taskState.maxSkuCount]
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [taskState.scriptFile]
    });
  } catch (error) {
    console.error(`Failed to inject ${taskState.scriptFile}`, error);
    scriptInjectedTabs.delete(tabId);
  }
}

function violationsSaveCurrentMarket(taskState) {
  const marketQueue = taskState.violationsMarketQueue || [];
  const idx = taskState.violationsMarketIndex;
  const market = marketQueue[idx] || null;
  taskState.violationsAllResults.push({
    marketLabel: market?.label || market?.code || `Market ${idx + 1}`,
    violations: [...taskState.violations],
    uniqueAsins: [...taskState.uniqueAsins],
    asinOrderCount: { ...taskState.asinOrderCount },
    asinSkuMap: { ...taskState.asinSkuMap },
  });
}

async function violationsAdvanceMarket(tabId, taskState) {
  taskState.violationsMarketIndex += 1;
  const marketQueue = taskState.violationsMarketQueue || [];

  if (taskState.violationsMarketIndex < marketQueue.length) {
    taskState.violations = [];
    taskState.uniqueAsins = [];
    taskState.asinIndex = 0;
    taskState.asinOrderCount = {};
    taskState.asinSkuMap = {};
    taskState.violationsPolicyPathIndex = 0;
    taskState.violationStage = "onSwitcher";
    taskState.processing = false;
    await chrome.tabs.update(tabId, { url: `${taskState.origin}/account-switcher/default/merchantMarketplace` });
  } else {
    taskState.violationStage = "downloadFiles";
    await runViolationsScript(tabId);
  }
}

async function runViolationsScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["violations.js"]
  });
}

function createBookmarkRecord(tab) {
  return {
    id: `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    name: tab.title || "Seller Central Page",
    url: tab.url,
    category: "Quick Saves",
    note: "",
    color: "#FF9900",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function loadBookmarks() {
  const result = await chrome.storage.sync.get(SC_BOOKMARKS_STORAGE_KEY);
  return Array.isArray(result[SC_BOOKMARKS_STORAGE_KEY]) ? result[SC_BOOKMARKS_STORAGE_KEY] : [];
}

async function saveBookmarks(bookmarks) {
  await chrome.storage.sync.set({ [SC_BOOKMARKS_STORAGE_KEY]: bookmarks });
}

function canBookmarkUrl(url) {
  return typeof url === "string" && /^https:\/\/sellercentral\.amazon\./.test(url);
}

async function ensureBookmarksContextMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: SC_BOOKMARKS_CONTEXT_MENU_ID,
    title: "\uD83D\uDD16 Add to SC Bookmarks",
    contexts: ["page"],
    documentUrlPatterns: SELLER_CENTRAL_URL_PATTERNS
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "START_DRAFT_SCRAPING") {
    (async () => {
      try {
        if (typeof message.selectedEmail !== "string" || message.selectedEmail.trim().length === 0) {
          throw new Error("Choose an email before starting draft scraping.");
        }

        const parsedLimit = Number.parseInt(String(message.maxSkuCount || "").trim(), 10);

        await startTask("draftScraping", {
          selectedEmail: message.selectedEmail,
          maxSkuCount: Number.isNaN(parsedLimit) ? null : parsedLimit,
          openInBackground: false,
          skipRetool: message.skipRetool === true
        });
        const draftSchedule = await rescheduleDraftAfterManualRun(message.selectedEmail);
        sendResponse({ success: true, draftSchedule });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start scraping." });
      }
    })();

    return true;
  }

  if (message?.type === "START_VIOLATIONS_EXPORT") {
    (async () => {
      try {
        await startTask("violationsExport", {
          markets: Array.isArray(message.markets) ? message.markets : [],
          sellerName: typeof message.sellerName === "string" ? message.sellerName : null,
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start violations export." });
      }
    })();

    return true;
  }

  if (message?.type === "START_NOTIF_PREFS") {
    (async () => {
      try {
        await startTask("notifPrefsEmail", {
          email: typeof message.email === "string" ? message.email : "",
          markets: Array.isArray(message.markets) ? message.markets : [],
          sellerName: typeof message.sellerName === "string" ? message.sellerName : null,
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start notification preferences." });
      }
    })();
    return true;
  }

  if (message?.type === "GET_NOTIF_PREFS_STATE") {
    const tabId = sender.tab?.id;
    const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
    if (!taskState || taskState.taskType !== "notifPrefsEmail") {
      sendResponse({ success: false });
      return;
    }
    sendResponse({ success: true, email: taskState.notifEmail, sectionIndex: taskState.notifSectionIndex || 0 });
  }

  if (message?.type === "NOTIF_PREFS_PROGRESS") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
      if (!taskState) return;
      await chrome.storage.local.set({
        _notifPrefsProgress: {
          active: true,
          currentMarket: (taskState.notifMarketQueue || [])[taskState.notifMarketIndex]?.label || "Market",
          sectionName: message.sectionName || "",
          marketIndex: taskState.notifMarketIndex,
          totalMarkets: (taskState.notifMarketQueue || []).length,
        }
      });
    })();
  }

  if (message?.type === "NOTIF_PREFS_SECTION_DONE") {
    const tabId = sender.tab?.id;
    const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
    if (taskState && taskState.taskType === "notifPrefsEmail") {
      taskState.notifSectionIndex = (taskState.notifSectionIndex || 0) + 1;
      if (message.sectionResult) {
        taskState.notifPartialSectionResults = [...(taskState.notifPartialSectionResults || []), message.sectionResult];
      }
      console.log(`[NotifPrefs] section done, next index=${taskState.notifSectionIndex}`);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "NOTIF_PREFS_MARKET_DONE") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
      if (!taskState || taskState.taskType !== "notifPrefsEmail") return;

      const currentMarket = (taskState.notifMarketQueue || [])[taskState.notifMarketIndex];
      const partialResults = taskState.notifPartialSectionResults || [];
      const finalResults = Array.isArray(message.sectionResults) ? message.sectionResults : [];
      // Merge: partialResults (from page-reload runs) + finalResults (from last run, no overlap)
      const partialNames = new Set(partialResults.map((r) => r.sectionName));
      const merged = [...partialResults, ...finalResults.filter((r) => !partialNames.has(r.sectionName))];
      taskState.notifResults.push({
        marketLabel: currentMarket?.label || currentMarket?.code || `Market ${taskState.notifMarketIndex + 1}`,
        sectionResults: merged,
      });

      taskState.notifMarketIndex += 1;
      taskState.notifSectionIndex = 0;
      taskState.notifPartialSectionResults = [];
      taskState.notifPrefsTimerRunning = false;
      taskState.notifPrefsInjectAttempts = 0;
      taskState.notifLastReloadTime = 0;
      scriptInjectedTabs.delete(tabId);

      if (taskState.notifMarketIndex < (taskState.notifMarketQueue || []).length) {
        taskState.notifStage = "onSwitcher";
        taskState.processing = false;
        await chrome.tabs.update(tabId, { url: `${taskState.origin}/account-switcher/default/merchantMarketplace` });
      } else {
        await chrome.storage.local.set({
          _notifPrefsProgress: { active: false },
          _notifPrefsResult: { done: true, results: taskState.notifResults },
        });
        clearTask(tabId);
      }
    })();
  }

  if (message?.type === "STOP_DRAFT_SCRAPING") {
    (async () => {
      try {
        await stopTask();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to stop scraping." });
      }
    })();

    return true;
  }

  if (message?.type === "STOP_VIOLATIONS_EXPORT") {
    let tabId = null;
    for (const [tid, state] of taskStateByTabId.entries()) {
      if (state.taskType === "violationsExport") { tabId = tid; break; }
    }
    if (tabId === null) {
      sendResponse({ success: false, error: "No violations export running." });
      return false;
    }
    stoppedTabs.add(tabId);
    clearTask(tabId);
    sendResponse({ success: true });
    return false;
  }

  if (message?.type === "GET_IBA_SCHEDULE") {
    (async () => {
      const config = await loadIbaSchedule();
      sendResponse({ success: true, config });
    })();

    return true;
  }

  if (message?.type === "GET_DRAFT_SCHEDULE") {
    (async () => {
      const config = await loadDraftSchedule();
      sendResponse({ success: true, config });
    })();

    return true;
  }

  if (message?.type === "GET_DRAFT_COLLECTION_STATE") {
    (async () => {
      const state = await loadDraftCollectionState();
      sendResponse({ success: true, state });
    })();

    return true;
  }

  if (message?.type === "START_LOG_CAPTURE") {
    logCaptureEnabled = true;
    capturedLogEntries = [];
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "STOP_LOG_CAPTURE") {
    logCaptureEnabled = false;
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "GET_CAPTURED_LOGS") {
    sendResponse({ entries: capturedLogEntries });
    return true;
  }

  if (message?.type === "GET_ACCOUNT_LIST") {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let domain;
        if (activeTab?.url && /sellercentral(?:-europe)?\.amazon\./.test(activeTab.url)) {
          domain = new URL(activeTab.url).hostname;
        } else {
          // Active tab is on SPP or non-SC — find an existing SC tab or fall back to .de
          let [scTab] = await chrome.tabs.query({ url: "https://sellercentral.amazon.*/*" });
          if (!scTab) [scTab] = await chrome.tabs.query({ url: "https://sellercentral-europe.amazon.com/*" });
          domain = scTab?.url ? new URL(scTab.url).hostname : "sellercentral.amazon.de";
        }
        const { parentId, mkid } = message;

        // Check if already loading — popup should just poll storage
        const { [ACCOUNT_LIST_LOADING_KEY]: alreadyLoading } = await chrome.storage.local.get(ACCOUNT_LIST_LOADING_KEY);
        if (alreadyLoading) {
          sendResponse({ loading: true });
          return;
        }

        // Fire scraping as background task — does NOT block on sendResponse
        bgScrapeAccounts(domain, parentId, mkid).catch(console.error);
        sendResponse({ loading: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message?.type === "LOG_ENTRY") {
    if (logCaptureEnabled) {
      capturedLogEntries.push(message.entry);
    }
    return;
  }

  if (message?.type === "START_DISBURSEMENT") {
    const { markets, originTabId, currentDomain, currentMarket, currentSellerName } = message;
    disbursementOrchestrate(markets, originTabId, currentDomain, currentMarket, currentSellerName).catch(() => {});
    sendResponse({ started: true });
    return true;
  }

  if (message?.type === "STOP_DISBURSEMENT") {
    disbursementStopRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "MARKET_SWITCH") {
    const { tabId, targetUrl, sellerName, marketLabel } = message;
    marketSwitchWithAccountCheck(tabId, targetUrl, sellerName, marketLabel).catch(() => {});
    sendResponse({ started: true });
    return true;
  }

  if (message?.type === "BRAND_SCANNER_ORCHESTRATE") {
    const { brands, originTabUrl } = message;
    brandScannerOrchestrate(brands, originTabUrl).catch(() => {});
    sendResponse({ started: true });
    return true;
  }

  if (message?.type === "OPEN_OPTIONS_PAGE") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "BRAND_SCANNER_STOP") {
    brandScannerStopRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "SAVE_IBA_SCHEDULE") {
    (async () => {
      try {
        const time = typeof message.time === "string" ? message.time : "17:00";
        const config = await enableIbaSchedule(time);
        sendResponse({ success: true, config });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to save IBA schedule." });
      }
    })();

    return true;
  }

  if (message?.type === "START_DRAFT_COLLECTION_SESSION") {
    (async () => {
      try {
        const state = {
          ...(await loadDraftCollectionState()),
          sessionActive: true,
          selectedEmail: typeof message.selectedEmail === "string" && message.selectedEmail.trim()
            ? message.selectedEmail.trim()
            : "amazonmroauto@gmail.com"
        };
        await saveDraftCollectionState(state);
        sendResponse({ success: true, state });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start draft collection session." });
      }
    })();

    return true;
  }

  if (message?.type === "STOP_DRAFT_COLLECTION_SESSION") {
    (async () => {
      try {
        const state = {
          ...(await loadDraftCollectionState()),
          sessionActive: false
        };
        await saveDraftCollectionState(state);
        sendResponse({ success: true, state });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to stop draft collection session." });
      }
    })();

    return true;
  }

  if (message?.type === "SAVE_DRAFT_SCHEDULE") {
    (async () => {
      try {
        const activeTab = await getActiveTab();
        const origin = getSellerCentralOrigin(activeTab?.url || "") || DEFAULT_SELLER_CENTRAL_ORIGIN;
        const intervalMinutes = Number.parseInt(String(message.intervalMinutes || "").trim(), 10);

        if (Number.isNaN(intervalMinutes) || intervalMinutes < 5) {
          throw new Error("Draft interval must be at least 5 minutes.");
        }

        if (typeof message.selectedEmail !== "string" || message.selectedEmail.trim().length === 0) {
          throw new Error("Choose an email before saving draft schedule.");
        }

        const config = await enableDraftSchedule(intervalMinutes, message.selectedEmail, origin);
        sendResponse({ success: true, config });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to save draft schedule." });
      }
    })();

    return true;
  }

  if (message?.type === "DISABLE_IBA_SCHEDULE") {
    (async () => {
      try {
        const config = await disableIbaSchedule();
        sendResponse({ success: true, config });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to disable IBA schedule." });
      }
    })();

    return true;
  }

  if (message?.type === "RESET_DRAFT_COLLECTION_STATE") {
    (async () => {
      try {
        const state = getDefaultDraftCollectionState();
        await saveDraftCollectionState(state);
        sendResponse({ success: true, state });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to reset draft collection." });
      }
    })();

    return true;
  }

  if (message?.type === "IBA_MULTI_START") {
    (async () => {
      try {
        const { accounts } = message;
        if (!Array.isArray(accounts) || accounts.length === 0) {
          sendResponse({ success: false, error: "No accounts specified." });
          return;
        }
        const state = {
          accounts,
          currentIndex: 0,
          tabId: null,
          results: [],
          startedAt: Date.now(),
        };
        await chrome.storage.local.set({ [IBA_MULTI_STATE_KEY]: state });
        ibaMultiProcessNext().catch(console.error);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "IBA_DONE") {
    (async () => {
      const stored = await chrome.storage.local.get(IBA_MULTI_STATE_KEY);
      const state = stored[IBA_MULTI_STATE_KEY];
      if (!state || sender.tab?.id !== state.tabId) return;

      const accountLabel = state.accounts[state.currentIndex];
      const resultEntry = {
        account: accountLabel,
        status: message.result === "no_orders" ? "skipped" : "done",
      };
      const newState = {
        ...state,
        currentIndex: state.currentIndex + 1,
        results: [...state.results, resultEntry],
      };
      await chrome.storage.local.set({ [IBA_MULTI_STATE_KEY]: newState });
      ibaMultiProcessNext().catch(console.error);
    })();
    return false;
  }

  if (message?.type === "IBA_MULTI_STOP") {
    (async () => {
      await chrome.storage.local.remove([IBA_MULTI_STATE_KEY, IBA_MULTI_CLIENT_MODE_KEY]);
      await chrome.storage.local.set({
        [IBA_MULTI_PROGRESS_KEY]: { active: false, done: false, stopped: true }
      });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message?.type === "DISABLE_DRAFT_SCHEDULE") {
    (async () => {
      try {
        const config = await disableDraftSchedule();
        sendResponse({ success: true, config });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to disable draft schedule." });
      }
    })();

    return true;
  }

  if (message?.type === "START_MULTI_MARKET_DRAFT") {
    (async () => {
      try {
        const { markets, skipRetool, selectedEmail, maxSkuCount, tabId } = message;

        if (!Array.isArray(markets) || markets.length === 0) {
          sendResponse({ success: false, error: "No markets selected." });
          return;
        }

        // Save queue
        const queueState = { queue: markets, index: 0, skipRetool: skipRetool === true };
        await chrome.storage.local.set({ [DRAFT_MULTI_MARKET_QUEUE_KEY]: queueState });

        // Save initial progress
        const progressState = {
          total: markets.length,
          done: 0,
          markets: markets.map((m) => ({ label: m.label, domain: m.domain, done: false }))
        };
        await chrome.storage.local.set({ [DRAFT_PROGRESS_KEY]: progressState });

        // Start first market scraping
        const firstMarket = markets[0];
        const parsedLimit = Number.isInteger(maxSkuCount) && maxSkuCount > 0 ? maxSkuCount : null;

        const runState = createDraftRunState({
          origin: `https://${firstMarket.domain || "sellercentral.amazon.de"}`,
          selectedEmail: typeof selectedEmail === "string" ? selectedEmail.trim() : "amazonmroauto@gmail.com",
          maxSkuCount: parsedLimit,
          skipRetool: skipRetool === true,
          openInBackground: false
        });

        draftRunsById.set(runState.runId, runState);
        runningDraftRunId = runState.runId;

        // Navigate existing tab to first market's draft page
        const firstUrl = buildMultiMarketDraftUrl(firstMarket);
        await chrome.tabs.update(tabId, { url: firstUrl });

        // Register the existing tab as a worker
        runState.activeTabIds.add(tabId);
        stoppedTabs.delete(tabId);
        scriptInjectedTabs.delete(tabId);
        taskStateByTabId.set(tabId, {
          taskType: "draftScraping",
          runId: runState.runId,
          targetUrl: firstUrl,
          scriptFile: runState.scriptFile,
          selectedEmail: runState.selectedEmail,
          maxSkuCount: runState.maxSkuCount,
          origin: runState.origin,
          workerIndex: 0,
          pageNumber: 1,
          pageStep: 1,
          pageReported: false
        });

        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start multi-market draft." });
      }
    })();

    return true;
  }

  if (message?.type === "GET_DRAFT_PROGRESS") {
    (async () => {
      try {
        const result = await chrome.storage.local.get(DRAFT_PROGRESS_KEY);
        sendResponse({ success: true, progress: result[DRAFT_PROGRESS_KEY] || null });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message?.type === "START_MULTI_MARKET_RUN") {
    (async () => {
      try {
        const { markets, scriptType, tabId } = message;

        if (!Array.isArray(markets) || markets.length === 0) {
          sendResponse({ success: false, error: "No markets selected." });
          return;
        }

        const queueState = { queue: markets, index: 0, scriptType: scriptType || "pricing_fixer" };
        await chrome.storage.local.set({ [MULTI_MARKET_QUEUE_KEY]: queueState });
        await chrome.tabs.update(tabId, { url: buildMultiMarketPricingUrl(markets[0]) });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start multi-market run." });
      }
    })();

    return true;
  }

  if (message?.type === "PRICING_FIXER_DONE") {
    (async () => {
      const tabId = sender.tab?.id;
      if (!tabId) return;

      try {
        const result = await chrome.storage.local.get(MULTI_MARKET_QUEUE_KEY);
        const queueState = result[MULTI_MARKET_QUEUE_KEY];
        if (!queueState || typeof queueState !== "object") return; // not a multi-market run

        const nextIndex = queueState.index + 1;

        if (nextIndex >= queueState.queue.length) {
          await chrome.storage.local.remove(MULTI_MARKET_QUEUE_KEY);
          return; // all markets done
        }

        const nextMarket = queueState.queue[nextIndex];
        await chrome.storage.local.set({ [MULTI_MARKET_QUEUE_KEY]: { ...queueState, index: nextIndex } });
        await chrome.tabs.update(tabId, { url: buildMultiMarketPricingUrl(nextMarket) });
      } catch (error) {
        console.error("Multi-market queue advance failed.", error);
      }
    })();
  }

  if (message?.type === "PAGE_READY") {
    (async () => {
      const tabId = sender.tab?.id;

      if (typeof tabId !== "number" || stoppedTabs.has(tabId) || scriptInjectedTabs.has(tabId)) {
        return;
      }

      const taskState = taskStateByTabId.get(tabId);

      if (!taskState || taskState.taskType !== "draftScraping" || message.pageType !== "drafts") {
        return;
      }

      await injectDraftScraper(tabId, taskState);
    })();
  }

  if (message?.type === "GET_VIOLATIONS_STATE") {
    const tabId = sender.tab?.id;
    let taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
    // Popup has no tab — scan for any active violations export
    if (!taskState || taskState.taskType !== "violationsExport") {
      for (const s of taskStateByTabId.values()) {
        if (s.taskType === "violationsExport") { taskState = s; break; }
      }
    }

    if (!taskState || taskState.taskType !== "violationsExport") {
      sendResponse({ success: false, error: "Violations task state not found." });
      return;
    }

    sendResponse({
      success: true,
      stage: taskState.violationStage,
      origin: taskState.origin,
      violations: taskState.violations,
      uniqueAsins: taskState.uniqueAsins,
      asinIndex: taskState.asinIndex,
      asinOrderCount: taskState.asinOrderCount,
      asinSkuMap: taskState.asinSkuMap,
      violationsAllResults: taskState.violationsAllResults || [],
    });
  }

  if (message?.type === "VIOLATIONS_POLICY_COLLECTED") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

      if (!taskState || taskState.taskType !== "violationsExport") {
        return;
      }

      taskState.processing = false;
      const newViolations = Array.isArray(message.violations) ? message.violations : [];
      taskState.violations = [...(taskState.violations || []), ...newViolations];
      console.log(`[Violations] Policy path ${taskState.violationsPolicyPathIndex + 1}: načteno ${newViolations.length} violations (celkem ${taskState.violations.length})`);

      const policyPaths = TASK_CONFIG.violationsExport.policyPaths;
      taskState.violationsPolicyPathIndex = (taskState.violationsPolicyPathIndex || 0) + 1;

      if (taskState.violationsPolicyPathIndex < policyPaths.length) {
        const nextPath = policyPaths[taskState.violationsPolicyPathIndex];
        console.log(`[Violations] Přechod na další policy path: ${nextPath}`);
        await chrome.tabs.update(tabId, { url: `${taskState.origin}${nextPath}` });
        return;
      }

      taskState.uniqueAsins = [...new Set(taskState.violations.map((item) => item.asin).filter(Boolean))];
      console.log(`[Violations] ✅ Policy collection hotova — ${taskState.violations.length} violations, ${taskState.uniqueAsins.length} unikátních ASINů`);
      console.log(`[Violations] ASINy:`, taskState.uniqueAsins);

      if (taskState.uniqueAsins.length === 0) {
        console.log(`[Violations] Žádné ASINy — konec.`);
        if ((taskState.violationsMarketQueue || []).length > 0) {
          violationsSaveCurrentMarket(taskState);
          await violationsAdvanceMarket(tabId, taskState);
        } else {
          clearTask(tabId);
        }
        return;
      }

      console.log(`[Violations] Zahajuji kontrolu objednávek (${taskState.uniqueAsins.length} ASINů)...`);
      taskState.violationStage = "collectOrders";
      taskState.asinIndex = 0;
      await chrome.tabs.update(tabId, { url: getOrderSearchUrl(taskState.origin, taskState.uniqueAsins[0]) });
    })();
  }

  if (message?.type === "VIOLATIONS_ORDER_COLLECTED") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

      if (!taskState || taskState.taskType !== "violationsExport") {
        return;
      }

      taskState.processing = false;
      taskState.asinOrderCount[message.asin] = message.orderCount ?? "N/A";
      taskState.asinIndex += 1;
      const total = taskState.uniqueAsins.length;
      console.log(`[Violations] Objednávky ${taskState.asinIndex}/${total}: ${message.asin} → ${message.orderCount ?? "N/A"} objednávek`);

      if (taskState.asinIndex < total) {
        await chrome.tabs.update(tabId, {
          url: getOrderSearchUrl(taskState.origin, taskState.uniqueAsins[taskState.asinIndex])
        });
        return;
      }

      console.log(`[Violations] ✅ Objednávky hotovy (${total}/${total}) — zahajuji kontrolu inventory...`);
      taskState.violationStage = "collectInventory";
      taskState.asinIndex = 0;
      await chrome.tabs.update(tabId, {
        url: getInventoryUrl(taskState.origin, taskState.uniqueAsins[0])
      });
    })();
  }

  if (message?.type === "VIOLATIONS_INVENTORY_COLLECTED") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

      if (!taskState || taskState.taskType !== "violationsExport") {
        return;
      }

      taskState.processing = false;
      taskState.asinSkuMap[message.asin] = message.sku ?? "N/A";
      taskState.asinIndex += 1;
      const invTotal = taskState.uniqueAsins.length;
      console.log(`[Violations] Inventory ${taskState.asinIndex}/${invTotal}: ${message.asin} → SKU: ${message.sku ?? "N/A"}`);

      if (taskState.asinIndex < invTotal) {
        await chrome.tabs.update(tabId, {
          url: getInventoryUrl(taskState.origin, taskState.uniqueAsins[taskState.asinIndex])
        });
        return;
      }

      console.log(`[Violations] ✅ Inventory hotovo (${invTotal}/${invTotal})`);
      console.log(`[Violations] Generuji výstupní soubory pro ${invTotal} ASINů...`);
      if ((taskState.violationsMarketQueue || []).length > 0) {
        violationsSaveCurrentMarket(taskState);
        await violationsAdvanceMarket(tabId, taskState);
      } else {
        taskState.violationStage = "downloadFiles";
        await runViolationsScript(tabId);
      }
    })();
  }

  if (message?.type === "DRAFT_PAGE_RESULTS") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;
      const runState = getDraftRun(taskState?.runId);

      if (!taskState || taskState.taskType !== "draftScraping" || !runState || taskState.pageReported) {
        return;
      }

      taskState.pageReported = true;

      const skus = Array.isArray(message.skus) ? message.skus.filter(Boolean) : [];
      const marketplace = typeof message.marketplace === "string" ? message.marketplace.trim() : "";
      const accountLabel = typeof message.accountLabel === "string" && message.accountLabel.trim()
        ? message.accountLabel.trim()
        : runState.accountLabel;

      runState.accountLabel = accountLabel;

      for (const sku of skus) {
        if (runState.maxSkuCount && runState.uniqueSkus.size >= runState.maxSkuCount) {
          break;
        }

        runState.uniqueSkus.add(sku);
      }

      if (marketplace) {
        runState.marketplaces.add(marketplace);
      }

      const shouldContinue = (
        !runState.stopping &&
        message.stopped !== true &&
        message.hasNextPage === true &&
        (!runState.maxSkuCount || runState.uniqueSkus.size < runState.maxSkuCount)
      );

      if (shouldContinue) {
        taskState.pageNumber += taskState.pageStep;
        taskState.targetUrl = buildDraftPageUrl(runState.origin, taskState.pageNumber);
        taskState.pageReported = false;
        scriptInjectedTabs.delete(tabId);
        await chrome.tabs.update(tabId, { url: taskState.targetUrl });
        return;
      }

      // Keep the last tab open for Retool navigation (same tab)
      if (runState.activeTabIds.size === 1) {
        runState.retoolTabId = tabId;
        clearTask(tabId);
      } else {
        await closeDraftWorkerTab(tabId);
      }
    })();
  }

  if (message?.type === "SCRAPING_FINISHED") {
    const tabId = sender.tab?.id;
    const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

    if (typeof tabId === "number" && taskState?.taskType !== "draftScraping") {
      clearTask(tabId);
    }
  }

  if (message?.type === "DRAFT_FEED_SUBMITTED") {
    (async () => {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") return;
      const result = await chrome.storage.local.get(DRAFT_MULTI_MARKET_QUEUE_KEY);
      const draftQueue = result[DRAFT_MULTI_MARKET_QUEUE_KEY];
      if (!draftQueue || typeof draftQueue !== "object") return;
      const nextIndex = draftQueue.index + 1;
      // Aktualizovat progress
      const progressResult = await chrome.storage.local.get(DRAFT_PROGRESS_KEY);
      const progress = progressResult[DRAFT_PROGRESS_KEY];
      if (progress) {
        progress.done = nextIndex;
        await chrome.storage.local.set({ [DRAFT_PROGRESS_KEY]: progress });
      }
      if (nextIndex < draftQueue.queue.length) {
        const nextMarket = draftQueue.queue[nextIndex];
        await chrome.storage.local.set({
          [DRAFT_MULTI_MARKET_QUEUE_KEY]: { ...draftQueue, index: nextIndex }
        });
        const nextUrl = buildMultiMarketDraftUrl(nextMarket);
        await chrome.tabs.update(tabId, { url: nextUrl });
      } else {
        // Vše hotovo — vyčistit frontu
        await chrome.storage.local.remove(DRAFT_MULTI_MARKET_QUEUE_KEY);
        await chrome.storage.local.remove(DRAFT_PROGRESS_KEY);
      }
    })();
  }

  if (message?.type === "VAT_REPORT_START") {
    (async () => {
      try {
        const startMonth = typeof message.startMonth === "string" ? message.startMonth.trim() : "";
        const endMonth = typeof message.endMonth === "string" ? message.endMonth.trim() : "";
        const downloadMode = ["zip", "individual", "both"].includes(message.downloadMode)
          ? message.downloadMode
          : "zip";

        if (!startMonth || !endMonth) {
          throw new Error("Start month and end month are required.");
        }

        const months = buildVatReportMonths(startMonth, endMonth);
        if (months.length === 0) {
          throw new Error("Selected range does not contain any months to export.");
        }

        const params = {
          startMonth,
          endMonth,
          downloadMode,
          months,
          zipName: buildVatReportZipName(months)
        };

        await setVatReportProgress(createVatProgressState(params));

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error("No active tab.");
        }

        if (tab.url?.includes("/reportcentral/VAT_TRANSACTION/1")) {
          await injectVatReportDownloader(tab.id, params);
        } else {
          await chrome.storage.local.set({ [VAT_REPORT_PENDING_PARAMS_KEY]: params });
          taskStateByTabId.set(tab.id, { taskType: "vatReportDownload", tabId: tab.id });
          await chrome.tabs.update(tab.id, { url: VAT_REPORT_URL });
        }

        sendResponse({ success: true, monthCount: months.length });
      } catch (error) {
        await setVatReportProgress({
          active: false,
          phase: "error",
          message: "",
          totalMonths: 0,
          submittedCount: 0,
          downloadedCount: 0,
          currentMonthLabel: "",
          pendingMonths: [],
          downloadedMonths: [],
          rangeStart: "",
          rangeEnd: "",
          zipName: "",
          downloadMode: "zip",
          error: error.message || "Failed to start VAT report export."
        });
        sendResponse({ success: false, error: error.message || "Failed to start VAT report export." });
      }
    })();
    return true;
  }

  if (message?.type === "VAT_REPORT_START_NEW") {
    (async () => {
      try {
        const months = Array.isArray(message.months) ? message.months : [];
        const downloadMode = ["zip", "individual"].includes(message.downloadMode)
          ? message.downloadMode
          : "zip";

        if (months.length === 0) {
          throw new Error("Select at least one month.");
        }

        // Convert month/year combinations to month entries
        const monthEntries = months.map(({ month, year }) => {
          const range = getMonthDateRange(year, month);
          return {
            year,
            month,
            label: formatVatMonthLabel(year, month),
            filename: `VAT_Transaction_${year}_${pad2(month)}.csv`,
            start: range.start,
            end: range.end
          };
        });

        const params = {
          startMonth: monthEntries[0]?.label || "",
          endMonth: monthEntries[monthEntries.length - 1]?.label || "",
          downloadMode,
          months: monthEntries,
          zipName: buildVatReportZipName(monthEntries)
        };

        await setVatReportProgress(createVatProgressState(params));

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error("No active tab.");
        }

        if (tab.url?.includes("/reportcentral/VAT_TRANSACTION/1")) {
          await injectVatReportDownloader(tab.id, params);
        } else {
          await chrome.storage.local.set({ [VAT_REPORT_PENDING_PARAMS_KEY]: params });
          taskStateByTabId.set(tab.id, { taskType: "vatReportDownload", tabId: tab.id });
          await chrome.tabs.update(tab.id, { url: VAT_REPORT_URL });
        }

        sendResponse({ success: true, monthCount: monthEntries.length });
      } catch (error) {
        await setVatReportProgress({
          active: false,
          phase: "error",
          message: "",
          totalMonths: 0,
          submittedCount: 0,
          downloadedCount: 0,
          currentMonthLabel: "",
          pendingMonths: [],
          downloadedMonths: [],
          rangeStart: "",
          rangeEnd: "",
          zipName: "",
          downloadMode: "zip",
          error: error.message || "Failed to start VAT report export."
        });
        sendResponse({ success: false, error: error.message || "Failed to start VAT report export." });
      }
    })();
    return true;
  }

  if (message?.type === "VAT_REPORT_PROGRESS") {
    (async () => {
      await setVatReportProgress(message.progress || null);
    })();
    return false;
  }

  if (message?.type === "VAT_REPORT_FILE_READY") {
    const { url, filename } = message;
    if (url && filename) {
      chrome.downloads.download({ url, filename, conflictAction: "uniquify" });
    }
    return false;
  }

  if (message?.type === "VAT_REPORT_ZIP_READY") {
    const { files, zipName } = message;
    try {
      const zipData = buildZip(files);
      const dataUrl = uint8ArrayToDataUrl(zipData);
      chrome.downloads.download({ url: dataUrl, filename: zipName, conflictAction: "uniquify" });
    } catch (error) {
      console.error("[BG] VAT ZIP build failed:", error);
    }
    return false;
  }

  if (message?.type === "VAT_REPORT_DONE") {
    chrome.storage.local.remove([VAT_REPORT_PARAMS_KEY, VAT_REPORT_PENDING_PARAMS_KEY]).catch(() => {});
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      void maybeDownloadConsoleLog(tabId, "vat_report");
      clearTask(tabId);
    }
    return false;
  }

  if (message?.type === "VAT_REPORT_ERROR") {
    chrome.storage.local.remove([VAT_REPORT_PARAMS_KEY, VAT_REPORT_PENDING_PARAMS_KEY]).catch(() => {});
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") clearTask(tabId);
    return false;
  }

  if (message?.type === "INVOICE_DOWNLOADER_START") {
    (async () => {
      try {
        const { months, years, docType = "all", downloadMode = "zip", includeCsv = false } = message;
        const params = { months, years, docType, downloadMode, includeCsv };
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log("[BG] INVOICE_DOWNLOADER_START tab:", tab?.id, tab?.url);
        if (!tab?.id) { sendResponse({ success: false, error: "No active tab." }); return; }

        if (tab.url?.includes("/tax/seller-fee-invoices")) {
          console.log("[BG] On invoice page — injecting…");
          await injectInvoiceDownloader(tab.id, params);
          console.log("[BG] Injection complete.");
        } else {
          console.log("[BG] Not on invoice page — navigating…");
          // Store params so onUpdated can inject after navigation completes
          await chrome.storage.local.set({ _invoiceDownloaderPendingParams: params });
          taskStateByTabId.set(tab.id, { taskType: "invoiceDownload", tabId: tab.id });
          await chrome.tabs.update(tab.id, { url: "https://sellercentral.amazon.de/tax/seller-fee-invoices" });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error("INVOICE_DOWNLOADER_START error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "INVOICE_PDF_READY") {
    const { url, filename } = message;
    if (url) chrome.downloads.download({ url, filename, conflictAction: "uniquify" });
  }

  if (message?.type === "INVOICE_ZIP_READY") {
    const { files, zipName } = message;
    try {
      console.log(`[BG] Building ZIP from ${files.length} file(s)…`);
      const zipData  = buildZip(files);
      const dataUrl  = uint8ArrayToDataUrl(zipData);
      chrome.downloads.download({ url: dataUrl, filename: zipName, conflictAction: "uniquify" });
      console.log(`[BG] ZIP download started: "${zipName}"`);
    } catch (err) {
      console.error("[BG] ZIP build failed:", err);
    }
  }

  if (message?.type === "INVOICE_DOWNLOAD_DONE") {
    chrome.storage.local.remove(["_invoiceDownloaderParams", "_invoiceDownloaderPendingParams"]).catch(() => {});
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      void maybeDownloadConsoleLog(tabId, "invoice_downloader");
      clearTask(tabId);
    }
    // Forward completion with counts to the popup (if open)
    chrome.runtime.sendMessage({
      type:        "INVOICE_DOWNLOAD_COMPLETE",
      count:       message.count       ?? 0,
      invoices:    message.invoices    ?? 0,
      creditNotes: message.creditNotes ?? 0,
      error:       message.error       ?? null,
    }).catch(() => {}); // popup may not be open — ignore
  }

  if (message?.type === "DELETE_TEMPLATES") {
    (async () => {
      try {
        const { templates } = message; // [{ name, origin, marketCode }]
        if (!templates?.length) {
          sendResponse({ success: false, error: "No templates provided." });
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ success: false, error: "No active tab." }); return; }

        let delBaseDomain = DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) delBaseDomain = u.hostname;
        } catch (_) {}

        const queue = {
          templates,
          currentIndex: 0,
          deleted: 0,
          errors: [],
          baseDomain: delBaseDomain,
        };

        await chrome.storage.local.set({
          [DELETE_QUEUE_KEY]: queue,
          [DELETE_PROGRESS_KEY]: {
            active: true,
            current: 0,
            total: templates.length,
            deleted: 0,
            label: (templates[0]?.marketCode ? `[${templates[0].marketCode}] ` : "") + (templates[0]?.name || ""),
            error: "",
          },
        });

        const firstTemplate = templates[0];
        const needsSwitch = !!(firstTemplate.mkid);
        const firstListUrl = needsSwitch
          ? buildShippingTemplatesSwitchUrl(firstTemplate, delBaseDomain)
          : buildShippingTemplatesUrl(delBaseDomain);
        taskStateByTabId.set(tab.id, {
          taskType: "deleteTemplate",
          tabId: tab.id,
          phase: needsSwitch ? "switch" : "delete",
          expectedUrl: `https://${delBaseDomain}`,
        });
        await chrome.tabs.update(tab.id, { url: firstListUrl });

        sendResponse({ success: true });
      } catch (error) {
        console.error("[BG] DELETE_TEMPLATES error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "LIST_SHIPPING_TEMPLATES") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ success: false, error: "No active tab." }); return; }

        // markets: array of market objects (or origin strings for backward compat) sent from popup
        let markets = null;
        if (Array.isArray(message.markets) && message.markets.length > 0) {
          markets = message.markets.map((m) =>
            typeof m === "string" ? { origin: m } : m
          );
        }

        if (!markets) {
          let origin = DEFAULT_SELLER_CENTRAL_ORIGIN;
          try {
            const u = new URL(tab.url || "");
            if (u.hostname.includes("sellercentral.amazon")) origin = u.origin;
          } catch (_) {}
          markets = [{ origin }];
        }

        let baseDomain = DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) baseDomain = u.hostname;
        } catch (_) {}

        const marketQueue = { markets, currentIndex: 0, accumulated: [], baseDomain };
        await chrome.storage.local.set({
          [SHIPPING_TEMPLATE_LIST_KEY]: null,
          [SPC_MARKET_LOAD_QUEUE_KEY]: marketQueue,
        });

        // Phase "switch": navigate to /home with mons_sel_ to switch the market account.
        // After /home loads, the onUpdated handler will navigate to /sbr to collect templates.
        const firstMarket = markets[0];
        const firstUrl = firstMarket.mkid
          ? buildShippingTemplatesSwitchUrl(firstMarket, baseDomain)
          : buildShippingTemplatesUrl(baseDomain);
        const firstExpected = `https://${baseDomain}`;
        taskStateByTabId.set(tab.id, {
          taskType: "listShippingTemplates",
          tabId: tab.id,
          phase: firstMarket.mkid ? "switch" : "load",
          expectedUrl: firstExpected,
        });
        await chrome.tabs.update(tab.id, { url: firstUrl });

        sendResponse({ success: true });
      } catch (error) {
        console.error("[BG] LIST_SHIPPING_TEMPLATES error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "PRICE_CHANGE_START") {
    (async () => {
      try {
        const { templates, config } = message;
        if (!templates?.length) {
          sendResponse({ success: false, error: "No templates provided." });
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ success: false, error: "No active tab." });
          return;
        }

        await injectConsoleInterceptor(tab.id).catch(() => {});

        // Templates may carry per-entry { origin, marketCode } from multi-market loading.
        // If not, fall back to the current tab's origin.
        let fallbackOrigin = DEFAULT_SELLER_CENTRAL_ORIGIN;
        let pcBaseDomain = DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) {
            fallbackOrigin = u.origin;
            pcBaseDomain = u.hostname;
          }
        } catch (_) {}

        const taggedTemplates = templates.map((t) => ({
          name: t.name,
          origin: t.origin || fallbackOrigin,
          marketCode: t.marketCode || getMarketCodeFromOrigin(t.origin || fallbackOrigin),
          mkid: t.mkid || "",
          mcid: t.mcid || "",
          globalAccountId: t.globalAccountId || "",
        }));

        const queue = {
          config,
          templates: taggedTemplates,
          currentIndex: 0,
          totalChanged: 0,
          errors: [],
          baseDomain: pcBaseDomain,
        };

        const firstLabel = taggedTemplates[0]
          ? (taggedTemplates[0].marketCode ? `[${taggedTemplates[0].marketCode}] ` : "") + taggedTemplates[0].name
          : "";

        await chrome.storage.local.set({
          [PRICE_CHANGE_QUEUE_KEY]: queue,
          [PRICE_CHANGE_PROGRESS_KEY]: {
            active: true,
            current: 0,
            total: taggedTemplates.length,
            totalChanged: 0,
            label: firstLabel,
            error: "",
          },
        });

        // Navigate to the template list page via two-step: /home switch → /sbr.
        const firstPcTemplate = taggedTemplates[0];
        const needsPcSwitch = !!(firstPcTemplate?.mkid);
        const firstPcUrl = needsPcSwitch
          ? buildShippingTemplatesSwitchUrl(firstPcTemplate, pcBaseDomain)
          : buildShippingTemplatesUrl(pcBaseDomain);
        taskStateByTabId.set(tab.id, {
          taskType: "priceChange",
          phase: needsPcSwitch ? "switch" : "selectEdit",
          tabId: tab.id,
          expectedUrl: `https://${pcBaseDomain}`,
        });
        await chrome.tabs.update(tab.id, { url: firstPcUrl });

        sendResponse({ success: true });
      } catch (error) {
        console.error("[BG] PRICE_CHANGE_START error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "INVENTORY_AGE_START" || message?.type === "INVENTORY_AGE_START_ALL") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ success: false, error: "No active tab." }); return; }

        await chrome.storage.local.remove("_inventoryAgeLog");

        const dryRun = message.dryRun === true;
        const allMarkets = message.type === "INVENTORY_AGE_START_ALL";

        let baseDomain = DEFAULT_SELLER_CENTRAL_ORIGIN.replace(/^https?:\/\//, "");
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) baseDomain = u.hostname;
        } catch (_) {}

        let markets = [];
        if (allMarkets) {
          const mkResp = await chrome.tabs.sendMessage(tab.id, { action: "GET_MARKET_DATA" }).catch(() => null);
          markets = mkResp?.data?.standaloneRegionalAccounts || [];
        }
        if (!markets.length) {
          markets = [{ origin: `https://${baseDomain}`, label: getMarketCodeFromOrigin(`https://${baseDomain}`) }];
        }

        const queue = {
          markets: markets.map(m => ({
            label: m.label || getMarketCodeFromOrigin(m.origin || `https://${baseDomain}`),
            mkid: m.ids?.mons_sel_mkid || "",
            mcid: m.ids?.mons_sel_dir_mcid || "",
            globalAccountId: m.globalAccountId || "",
            origin: m.origin || `https://${baseDomain}`,
          })),
          currentIndex: 0,
          results: {},
          startedAt: new Date().toISOString(),
          baseDomain,
          dryRun,
          startOrigin: `https://${baseDomain}`,
        };

        await chrome.storage.local.set({
          [INVENTORY_AGE_QUEUE_KEY]: queue,
          [INVENTORY_AGE_PROGRESS_KEY]: {
            active: true, phase: "init",
            currentMarket: queue.markets[0]?.label || baseDomain,
            page: 1, rowsSoFar: 0, totalEstimate: null, startedAt: queue.startedAt, error: null,
          },
          [INVENTORY_AGE_RESULTS_KEY]: null,
        });

        const firstMarket = queue.markets[0];
        const targetUrl = firstMarket.mkid
          ? `https://${baseDomain}/home?mons_sel_mkid=${encodeURIComponent(firstMarket.mkid)}&mons_sel_dir_mcid=${encodeURIComponent(firstMarket.mcid)}&ignore_selection_changed=true`
          : `https://${baseDomain}${INVENTORY_AGE_PATH}`;

        taskStateByTabId.set(tab.id, {
          taskType: "inventoryAgeScan",
          tabId: tab.id,
          phase: firstMarket.mkid ? "switch" : "scrape",
          expectedUrl: `https://${baseDomain}`,
        });
        await chrome.tabs.update(tab.id, { url: targetUrl });

        sendResponse({ success: true });
      } catch (error) {
        console.error("[BG] INVENTORY_AGE_START error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message?.type === "INVENTORY_AGE_ROWS") {
    (async () => {
      try {
        const { rows, hasNextPage, marketCode, scanLog } = message;
        if (scanLog?.length) {
          const existing = (await chrome.storage.local.get("_inventoryAgeLog"))._inventoryAgeLog || [];
          await chrome.storage.local.set({ _inventoryAgeLog: existing.concat(scanLog) });
        }
        const stored = await chrome.storage.local.get([INVENTORY_AGE_QUEUE_KEY, INVENTORY_AGE_PROGRESS_KEY]);
        const queue = stored[INVENTORY_AGE_QUEUE_KEY];
        const prog = stored[INVENTORY_AGE_PROGRESS_KEY] || {};
        if (!queue) { sendResponse({ success: false }); return; }

        const mkt = queue.markets[queue.currentIndex];
        const mktKey = mkt?.label || marketCode || "??";
        if (!queue.results[mktKey]) queue.results[mktKey] = [];
        queue.results[mktKey].push(...(rows || []));

        const newProg = {
          ...prog,
          rowsSoFar: (queue.results[mktKey] || []).length,
          page: (prog.page || 1) + (hasNextPage ? 0 : 0),
        };

        if (hasNextPage) {
          newProg.page = (prog.page || 1) + 1;
          await chrome.storage.local.set({ [INVENTORY_AGE_QUEUE_KEY]: queue, [INVENTORY_AGE_PROGRESS_KEY]: newProg });
          sendResponse({ action: "nextPage" });
        } else {
          queue.currentIndex++;
          if (queue.currentIndex < queue.markets.length) {
            const nextMkt = queue.markets[queue.currentIndex];
            newProg.currentMarket = nextMkt?.label || "??";
            newProg.page = 1;
            newProg.rowsSoFar = 0;
            newProg.phase = "switch";
            await chrome.storage.local.set({ [INVENTORY_AGE_QUEUE_KEY]: queue, [INVENTORY_AGE_PROGRESS_KEY]: newProg });
            const switchUrl = `https://${queue.baseDomain}/home?mons_sel_mkid=${encodeURIComponent(nextMkt.mkid)}&mons_sel_dir_mcid=${encodeURIComponent(nextMkt.mcid)}&ignore_selection_changed=true`;
            const tabId = message.tabId;
            taskStateByTabId.set(tabId, { taskType: "inventoryAgeScan", tabId, phase: "switch", expectedUrl: `https://${queue.baseDomain}` });
            await chrome.tabs.update(tabId, { url: switchUrl });
            sendResponse({ action: "switching" });
          } else {
            await finalizeInventoryAgeScan(queue);
            sendResponse({ action: "done" });
          }
        }
      } catch (error) {
        console.error("[BG] INVENTORY_AGE_ROWS error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // ── SPP Management ──────────────────────────────────────────────────────────

  if (message?.type === "GET_SPP_DATA") {
    (async () => {
      let bgTab = null;
      try {
        bgTab = await chrome.tabs.create({
          url: `https://${SPP_DOMAIN}/account/#/user-management/users`,
          active: false,
        });

        await new Promise(resolve => {
          const timer = setTimeout(resolve, 15000);
          function listener(tabId, info) {
            if (tabId !== bgTab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer); resolve();
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        // Wait for Vue app + userList store to have data
        const usersReady = await sppPollInTab(bgTab.id, () => {
          const root = document.getElementById("global-user-permissions-root");
          if (!root?.__vue_app__) return false;
          const pinia = root.__vue_app__.config.globalProperties.$pinia;
          const users = pinia?.state?.value?.userList?.users?.data;
          return Array.isArray(users) && users.length > 0;
        });
        console.log("[SellerTools] SPP userList ready:", usersReady);

        // Navigate to clients page to populate clientList store
        await chrome.scripting.executeScript({
          target: { tabId: bgTab.id }, world: "MAIN",
          func: () => {
            const root = document.getElementById("global-user-permissions-root");
            root?.__vue_app__?.config?.globalProperties?.$router?.push("/user-management/clients");
          },
        });

        await sppPollInTab(bgTab.id, () => {
          const root = document.getElementById("global-user-permissions-root");
          if (!root?.__vue_app__) return false;
          const pinia = root.__vue_app__.config.globalProperties.$pinia;
          const clients = pinia?.state?.value?.clientList?.clients?.data;
          return Array.isArray(clients) && clients.length > 0;
        });

        const [result] = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id }, world: "MAIN",
          func: () => {
            const root = document.getElementById("global-user-permissions-root");
            if (!root?.__vue_app__) return { error: "Vue app not found" };
            const pinia = root.__vue_app__.config.globalProperties.$pinia;
            if (!pinia) return { error: "Pinia not found" };
            const s = pinia.state.value;
            const employees = (s.userList?.users?.data || []).map(u => ({
              id: u.id, name: u.name, email: u.email,
              isOwner: !!u.partnerAccountOwner, isVerified: !!u.identityVerified,
            }));
            const clients = (s.clientList?.clients?.data || []).map(c => ({
              id: c.id, name: c.name,
            }));
            return { employees, clients };
          },
        });

        await chrome.tabs.remove(bgTab.id).catch(() => {});
        bgTab = null;
        const data = result?.result;
        if (data?.error) sendResponse({ success: false, error: data.error });
        else sendResponse({ success: true, employees: data?.employees || [], clients: data?.clients || [] });
      } catch (err) {
        if (bgTab) await chrome.tabs.remove(bgTab.id).catch(() => {});
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message?.type === "SPP_ASSIGN") {
    (async () => {
      const { employees, clients, rolePermissions, roleSections } = message;
      sppAssignStopRequested = false;
      const setProgress = (current, total, msg, errors = []) =>
        chrome.storage.local.set({ [SPP_ASSIGN_PROGRESS_KEY]: {
          active: current < total && !sppAssignStopRequested, current, total, message: msg, errors,
        }});

      await setProgress(0, employees.length, "Otevírám SPP Portal…");

      let sppTab = null;
      try {
        const SPP_PERMS_URL = `https://${SPP_DOMAIN}/account/permissions#/user-management/users`;
        const existing = await chrome.tabs.query({ url: `https://${SPP_DOMAIN}/*` });
        if (existing.length > 0) {
          sppTab = existing[0];
          // Always navigate to the permissions section — global-user-permissions-root only exists there
          await chrome.tabs.update(sppTab.id, { active: true, url: SPP_PERMS_URL });
        } else {
          sppTab = await chrome.tabs.create({ url: SPP_PERMS_URL, active: true });
        }
        // Wait for the page to fully load
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 20000);
          function listener(tabId, info) {
            if (tabId !== sppTab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer); resolve();
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        const vueReady = await sppPollInTab(sppTab.id, () =>
          !!document.getElementById("global-user-permissions-root")?.__vue_app__
        , 400, 15000);
        if (!vueReady) throw new Error("SPP Portal se nenačetl. Zkontroluj přihlášení na solutionproviderportal.amazon.com.");

        const errors = [];
        const log = [];
        let assigned = 0;
        let skipped = 0;
        const logTs = () => new Date().toISOString();
        const appendLog = (entry) => {
          log.push({ ts: logTs(), ...entry });
          chrome.storage.local.set({ [SPP_ASSIGN_LOG_KEY]: { startedAt: log[0]?.ts, entries: log } });
        };

        // Clear previous log at start of new run
        await chrome.storage.local.set({ [SPP_ASSIGN_LOG_KEY]: { startedAt: logTs(), entries: [] } });

        for (let i = 0; i < employees.length; i++) {
          if (sppAssignStopRequested) break;
          const emp = employees[i];
          await setProgress(i, employees.length, `Přiřazuji: ${emp.name} (${i + 1}/${employees.length})`, errors);
          try {
            const result = await sppAssignOne(sppTab.id, emp, clients);
            if (result?.saved) {
              assigned++;
              appendLog({ employee: emp.name, action: 'assign', result: 'ok', detail: clients.map(c => c.name).join(', ') });
            } else {
              skipped++;
              appendLog({ employee: emp.name, action: 'assign', result: 'skipped', detail: 'Již přiřazen' });
            }

            // Apply role permissions for each client if a role was selected —
            // regardless of whether assignment was new or already existed
            if (rolePermissions && roleSections) {
              let sppPageCount = 0; // track consecutive page loads for cooldown
              for (const client of clients) {
                if (sppAssignStopRequested) break;
                await setProgress(i, employees.length,
                  `Nastavuji oprávnění: ${emp.name} → ${client.name}`, errors);

                // Cooldown every 10 pages to avoid Amazon rate-limiting
                if (sppPageCount > 0 && sppPageCount % 10 === 0) {
                  await setProgress(i, employees.length,
                    `Pauza (anti-rate-limit) po ${sppPageCount} stránkách…`, errors);
                  await new Promise(r => setTimeout(r, 25000));
                }

                let permOk = false;
                for (let attempt = 1; attempt <= 2; attempt++) {
                  try {
                    await sppApplyRolePermissions(sppTab.id, emp.id, client.id, rolePermissions, roleSections);
                    appendLog({ employee: emp.name, client: client.name, action: 'permissions', result: 'ok' });
                    permOk = true;
                    break;
                  } catch (permErr) {
                    if (attempt < 2) {
                      // Wait longer before retry — Amazon may have temporarily throttled
                      await new Promise(r => setTimeout(r, 15000));
                    } else {
                      console.error(`[SPP] perms error ${emp.name}/${client.name}:`, permErr.message);
                      errors.push({ employee: emp.name, error: `Oprávnění ${client.name}: ${permErr.message}` });
                      appendLog({ employee: emp.name, client: client.name, action: 'permissions', result: 'error', detail: permErr.message });
                    }
                  }
                }
                sppPageCount++;
                // Jittered delay between clients (2–4 s) to look more human
                if (permOk) {
                  const jitter = 2000 + Math.floor(Math.random() * 2000);
                  await new Promise(r => setTimeout(r, jitter));
                }
              }
            }
          } catch (err) {
            console.error(`[SellerTools] SPP assign error for ${emp.name}:`, err.message);
            errors.push({ employee: emp.name, error: err.message });
            appendLog({ employee: emp.name, action: 'assign', result: 'error', detail: err.message });
          }
          await new Promise(r => setTimeout(r, 800));
        }

        const parts = [];
        if (assigned) parts.push(`${assigned} přiřazeno`);
        if (skipped) parts.push(`${skipped} bez změn`);
        const summary = parts.join(', ') || '0 přiřazeno';
        const msg = sppAssignStopRequested
          ? `Zastaveno. ${summary}.`
          : `Hotovo. ${summary}.`;
        appendLog({ action: 'summary', result: msg, detail: `Errors: ${errors.length}` });
        await chrome.storage.local.set({ [SPP_ASSIGN_PROGRESS_KEY]: {
          active: false, current: employees.length, total: employees.length, message: msg, errors,
        }});
        sendResponse({ success: true, assigned, errors });
      } catch (err) {
        await chrome.storage.local.set({ [SPP_ASSIGN_PROGRESS_KEY]: {
          active: false, current: 0, total: 0, message: `Chyba: ${err.message}`, errors: [],
        }});
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message?.type === "SPP_ASSIGN_STOP") {
    sppAssignStopRequested = true;
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "GET_SPP_EMPLOYEE_ASSIGNMENTS") {
    (async () => {
      let bgTab = null;
      try {
        bgTab = await chrome.tabs.create({
          url: `https://${SPP_DOMAIN}/account/#/user-management/users`,
          active: false,
        });
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 15000);
          function listener(tabId, info) {
            if (tabId !== bgTab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer); resolve();
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        await sppOpenAddToClientModal(bgTab.id, message.employeeId);

        // Read pre-checked checkboxes (= already assigned clients) across ALL pages.
        // On the "Add Client" tab, already-assigned clients have:
        //   - input[type="checkbox"] that is checked
        //   - an "Assigned" badge/text next to the name
        const [readRes] = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id }, world: "MAIN",
          func: async () => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));

            const modal = document.querySelector('kat-modal');
            if (!modal) return { error: 'Modal not found' };

            // Click "Client Assignments" tab via shadow DOM
            const assignTab = modal.querySelector('kat-tab[data-qa="client-assignments"]');
            if (!assignTab) return { error: 'Client Assignments tab not found' };
            const tabBtn = assignTab.shadowRoot?.querySelector('[role="tab"]');
            if (!tabBtn) return { error: 'Tab button not found in shadow DOM' };
            tabBtn.click();
            await sleep(900);

            const assigned = [];

            function readCurrentPage() {
              const list = modal.querySelector('kat-list');
              if (!list) return;
              for (const item of list.querySelectorAll('li[role="listitem"]')) {
                const name = item.textContent?.trim();
                if (name) assigned.push(name);
              }
            }

            readCurrentPage();

            // Paginate via kat-pagination
            const paginator = modal.querySelector('kat-pagination');
            if (paginator) {
              const totalItems = parseInt(paginator.getAttribute('total-items') || '0', 10);
              const perPage = parseInt(paginator.getAttribute('items-per-page') || '10', 10);
              const totalPages = Math.ceil(totalItems / perPage);

              for (let p = 2; p <= totalPages && p <= 20; p++) {
                const shadow = paginator.shadowRoot;
                const nextBtn = shadow && (
                  shadow.querySelector('[aria-label="Next page"]') ||
                  shadow.querySelector('[aria-label="next"]') ||
                  shadow.querySelector('button[class*="next"]') ||
                  shadow.querySelector('[data-action="next"]')
                );
                if (!nextBtn || nextBtn.disabled) break;
                nextBtn.click();
                await sleep(700);
                readCurrentPage();
              }
            }

            // Close modal
            modal.querySelector('kat-button[data-qa="cancel-button"]')?.click();

            return { ok: true, assigned };
          },
        });

        await chrome.tabs.remove(bgTab.id).catch(() => {});
        bgTab = null;

        const data = readRes?.result;
        if (data?.error) sendResponse({ success: false, error: data.error });
        else sendResponse({ success: true, assigned: data?.assigned || [] });
      } catch (err) {
        if (bgTab) await chrome.tabs.remove(bgTab.id).catch(() => {});
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message?.type === "GET_SPP_EMPLOYEE_PERMISSIONS") {
    (async () => {
      let bgTab = null;
      try {
        const { employeeId, clientId, sections } = message;
        const url = `https://${SPP_DOMAIN}/account/permissions#/edit-user-permissions/${employeeId}/${clientId}`;
        bgTab = await chrome.tabs.create({ url, active: false });

        await new Promise(resolve => {
          const timer = setTimeout(resolve, 20000);
          function listener(tabId, info) {
            if (tabId !== bgTab.id || info.status !== "complete") return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer); resolve();
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        // Phase 1: wait until Pinia toolCategories structure exists
        const ready = await sppPollInTab(bgTab.id, () => {
          const root = document.getElementById("global-user-permissions-root");
          const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia;
          const tc = pinia?.state?.value?.userPermissions?.actorPermissionsData?.data?.toolCategories;
          if (!Array.isArray(tc) || tc.length === 0) return false;
          const firstTool = tc[0]?.tools?.[0];
          return firstTool != null && firstTool.noneRole != null;
        }, 500, 30000);

        if (!ready) throw new Error("Stránka oprávnění se nenačetla (toolCategories prázdné)");

        // Phase 2: wait until non-None permission count stabilizes (API data fully loaded)
        let lastNonNoneCount = -1;
        let stableRounds = 0;
        const stabilizeDeadline = Date.now() + 20000;
        while (Date.now() < stabilizeDeadline) {
          const [cr] = await chrome.scripting.executeScript({
            target: { tabId: bgTab.id }, world: "MAIN",
            func: () => {
              const root = document.getElementById("global-user-permissions-root");
              const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia;
              const permData = pinia?.state?.value?.userPermissions?.actorPermissionsData?.data;
              const rawData = Array.isArray(permData)
                ? permData
                : (Array.isArray(permData?.toolCategories) ? permData.toolCategories : null);
              if (!Array.isArray(rawData)) return 0;
              let count = 0;
              for (const cat of rawData) {
                for (const tool of (cat.tools || [])) {
                  // Count old-style (selected) OR new-style (dimensionGrants) non-None items
                  const hasSelected = tool.adminRole?.selected || tool.editRole?.selected || tool.viewRole?.selected;
                  const hasGrants = (tool.dimensionGrants?.length ?? 0) > 0;
                  if (hasSelected || hasGrants) count++;
                }
              }
              return count;
            },
          });
          const currentCount = cr?.result ?? 0;
          if (currentCount > 0 && currentCount === lastNonNoneCount) {
            stableRounds++;
            if (stableRounds >= 3) break;
          } else {
            stableRounds = 0;
            lastNonNoneCount = currentCount;
          }
          await new Promise(r => setTimeout(r, 600));
        }

        const [result] = await chrome.scripting.executeScript({
          target: { tabId: bgTab.id }, world: "MAIN",
          func: (sectionsArg) => { try {
            // Build displayName → "sect.item" key map
            // Category-qualified keys take priority to disambiguate same-named tools across sections
            const labelToKey = {};
            const catLabelToKey = {}; // "SectionLabel:ItemLabel" → key
            for (const sect of sectionsArg) {
              for (const item of sect.items) {
                labelToKey[item.label] = `${sect.id}.${item.id}`;
                labelToKey[item.label.toLowerCase()] = `${sect.id}.${item.id}`;
                const norm = item.label.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
                if (norm) labelToKey[norm] = `${sect.id}.${item.id}`;
                // Category-qualified (exact match, used when tool name is ambiguous)
                const sLabel = sect.label || sect.id;
                const iLabel = item.label || item.id;
                catLabelToKey[`${sLabel}:${iLabel}`] = `${sect.id}.${item.id}`;
                catLabelToKey[`${sLabel.toLowerCase()}:${iLabel.toLowerCase()}`] = `${sect.id}.${item.id}`;
              }
            }

            function resolveKey(catDisplayName, toolDisplayName) {
              if (!toolDisplayName) return null;
              // Try category-qualified first (resolves same-label tools in different sections)
              if (catDisplayName) {
                const catKey = `${catDisplayName}:${toolDisplayName}`;
                const hit = catLabelToKey[catKey] || catLabelToKey[catKey.toLowerCase()];
                if (hit) return hit;
              }
              return labelToKey[toolDisplayName] ||
                     labelToKey[toolDisplayName.toLowerCase()] ||
                     labelToKey[toolDisplayName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim()] ||
                     null;
            }

            const perms = {};
            const unmatched = [];
            const allToolsDebug = [];

            // ── Primary: Pinia userPermissions.actorPermissionsData ──────────
            const root = document.getElementById("global-user-permissions-root");
            const pinia = root?.__vue_app__?.config?.globalProperties?.$pinia;
            const permData = pinia?.state?.value?.userPermissions?.actorPermissionsData?.data;
            const rawData = Array.isArray(permData)
              ? permData
              : (Array.isArray(permData?.toolCategories) ? permData.toolCategories : null);

            if (Array.isArray(rawData)) {
              const levelOrder = { None: 0, View: 1, Edit: 2, Admin: 3 };
              for (const category of rawData) {
                for (const tool of (category.tools || [])) {
                  // Build roleName → level map from the tool's role objects
                  const roleNameToLevel = {};
                  if (tool.noneRole?.name)  roleNameToLevel[tool.noneRole.name]  = "None";
                  if (tool.viewRole?.name)  roleNameToLevel[tool.viewRole.name]  = "View";
                  if (tool.editRole?.name)  roleNameToLevel[tool.editRole.name]  = "Edit";
                  if (tool.adminRole?.name) roleNameToLevel[tool.adminRole.name] = "Admin";

                  // Method 1: dimensionGrants (new-style per-scope grants)
                  let levelFromGrants = "None";
                  for (const grant of (tool.dimensionGrants || [])) {
                    const grantLevel = roleNameToLevel[grant.role];
                    if (grantLevel && (levelOrder[grantLevel] ?? 0) > (levelOrder[levelFromGrants] ?? 0)) {
                      levelFromGrants = grantLevel;
                    }
                  }

                  // Method 2: role.selected (old-style / form pre-population)
                  let levelFromSelected = "None";
                  if (tool.adminRole?.selected)     levelFromSelected = "Admin";
                  else if (tool.editRole?.selected)  levelFromSelected = "Edit";
                  else if (tool.viewRole?.selected)  levelFromSelected = "View";

                  // Take the higher of both signals
                  const level = (levelOrder[levelFromGrants] ?? 0) >= (levelOrder[levelFromSelected] ?? 0)
                    ? levelFromGrants : levelFromSelected;

                  allToolsDebug.push(`[${category.displayName}] ${tool.displayName}=${level}`);
                  const key = resolveKey(category.displayName, tool.displayName);
                  if (!key) {
                    unmatched.push(`[${category.displayName}] ${tool.displayName}`);
                    continue;
                  }
                  // For duplicates (same key): take max, but prefer dimensionGrants signal when available
                  const existing = perms[key];
                  if (!existing) {
                    perms[key] = level;
                  } else if ((levelOrder[levelFromGrants] ?? 0) > 0) {
                    // This occurrence has real grants — trust it over old-style selected
                    if ((levelOrder[levelFromGrants] ?? 0) > (levelOrder[existing] ?? 0)) {
                      perms[key] = levelFromGrants;
                    }
                  } else if ((levelOrder[level] ?? 0) > (levelOrder[existing] ?? 0)) {
                    perms[key] = level;
                  }
                }
              }
            }

            return {
              ok: true,
              permissions: perms,
              foundCount: Object.keys(perms).length,
              unmatched,
              allToolsDebug,
              pageUrl: window.location.href,
            };
          } catch(e) { return { ok: false, error: e.message + " @ " + e.stack?.split("\n")[1] }; }
          },
          args: [sections],
        });

        await chrome.tabs.remove(bgTab.id).catch(() => {});
        bgTab = null;

        const data = result?.result;
        if (!data?.ok) throw new Error(data?.error ? `Skript: ${data.error}` : "Skript selhal při čtení oprávnění");

        sendResponse({ success: true, permissions: data.permissions, foundCount: data.foundCount, unmatched: data.unmatched || [], allToolsDebug: data.allToolsDebug || [], pageUrl: data.pageUrl });
      } catch (err) {
        if (bgTab) await chrome.tabs.remove(bgTab.id).catch(() => {});
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

async function finalizeInventoryAgeScan(queue) {
  const allRows = Object.values(queue.results || {}).flat();
  const results = {
    scannedAt: new Date().toISOString(),
    marketsScanned: Object.keys(queue.results || {}),
    rowsByMarket: queue.results || {},
  };
  await chrome.storage.local.set({
    [INVENTORY_AGE_RESULTS_KEY]: results,
    [INVENTORY_AGE_PROGRESS_KEY]: { active: false, phase: "done", rowsSoFar: allRows.length, error: null },
  });
  await chrome.storage.local.remove(INVENTORY_AGE_QUEUE_KEY);
  console.log(`[BG] inventoryAgeScan: done, ${allRows.length} rows across ${results.marketsScanned.length} market(s).`);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTask(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || stoppedTabs.has(tabId)) {
    return;
  }

  const taskState = taskStateByTabId.get(tabId);

  if (!taskState) {
    return;
  }

  if (taskState.taskType === "draftScraping") {
    if (isDraftPageUrl(tab.url)) {
      await injectDraftScraper(tabId, taskState);
    }

    return;
  }

  if (taskState.taskType === "violationsExport") {
    if (taskState.violationStage === "onSwitcher") {
      if (taskState.processing) return;
      taskState.processing = true;
      const nextMarket = taskState.violationsMarketQueue[taskState.violationsMarketIndex];
      const marketLabel = nextMarket?.label || nextMarket?.code || null;
      const sellerName = taskState.violationsSellerName;
      await new Promise(r => setTimeout(r, 1500));
      const result = await chrome.tabs.sendMessage(tabId, {
        action: "DO_ACCOUNT_SELECT",
        sellerName,
        marketLabel,
      }).catch(() => ({ success: false }));
      taskState.processing = false;
      if (result?.success) {
        taskState.violationStage = "waitSwitchDone";
      } else {
        console.warn("[Violations] DO_ACCOUNT_SELECT failed, going to violations directly");
        taskState.violationStage = "collectPolicy";
        await chrome.tabs.update(tabId, { url: `${taskState.origin}${TASK_CONFIG.violationsExport.relativePath}` });
      }
      return;
    }

    if (taskState.violationStage === "waitSwitchDone") {
      if (!tab.url?.includes("/account-switcher/")) {
        taskState.violationStage = "collectPolicy";
        await chrome.tabs.update(tabId, { url: `${taskState.origin}${TASK_CONFIG.violationsExport.relativePath}` });
      }
      return;
    }

    if (taskState.processing) return;
    taskState.processing = true;
    try {
      await runViolationsScript(tabId);
    } catch (error) {
      console.error("Failed to inject violations.js", error);
      taskState.processing = false;
      clearTask(tabId);
    }

    return;
  }

  if (taskState.taskType === "notifPrefsEmail") {
    console.log(`[NotifPrefs] onUpdated stage=${taskState.notifStage} url=${tab.url}`);

    if (taskState.notifStage === "onSwitcher") {
      if (taskState.processing) return;
      taskState.processing = true;
      const nextMarket = (taskState.notifMarketQueue || [])[taskState.notifMarketIndex];
      const marketLabel = nextMarket?.label || nextMarket?.code || null;
      const sellerName = taskState.notifSellerName;
      console.log(`[NotifPrefs] DO_ACCOUNT_SELECT seller=${sellerName} market=${marketLabel}`);
      await new Promise((r) => setTimeout(r, 1500));
      const result = await chrome.tabs.sendMessage(tabId, {
        action: "DO_ACCOUNT_SELECT",
        sellerName,
        marketLabel,
      }).catch(() => ({ success: false }));
      taskState.processing = false;
      console.log(`[NotifPrefs] DO_ACCOUNT_SELECT result=${result?.success}`);
      if (result?.success) {
        taskState.notifStage = "waitSwitchDone";
      } else {
        console.warn("[NotifPrefs] DO_ACCOUNT_SELECT failed, going to preferences directly");
        taskState.notifStage = "collectPrefs";
        await chrome.tabs.update(tabId, { url: `${taskState.origin}/notifications/preferences` });
      }
      return;
    }

    if (taskState.notifStage === "waitSwitchDone") {
      if (!tab.url?.includes("/account-switcher/")) {
        taskState.notifStage = "collectPrefs";
        console.log(`[NotifPrefs] navigating to preferences`);
        await chrome.tabs.update(tabId, { url: `${taskState.origin}/notifications/preferences` });
      }
      return;
    }

    if (taskState.notifStage === "collectPrefs") {
      if (!tab.url?.includes("/notifications/preferences")) {
        console.log(`[NotifPrefs] wrong URL after save (${tab.url}), navigating back`);
        await chrome.tabs.update(tabId, { url: `${taskState.origin}/notifications/preferences` });
        return;
      }
      taskState.notifLastReloadTime = Date.now();
      console.log(`[NotifPrefs] collectPrefs reload, timerRunning=${taskState.notifPrefsTimerRunning}`);

      if (taskState.notifPrefsTimerRunning) return;
      taskState.notifPrefsTimerRunning = true;

      const capturedTabId = tabId;
      const STABILITY_MS = 6000;

      const checkAndInject = async () => {
        const st = taskStateByTabId.get(capturedTabId);
        if (!st || st.taskType !== "notifPrefsEmail" || st.notifStage !== "collectPrefs") return;

        const age = Date.now() - (st.notifLastReloadTime || 0);
        if (age < STABILITY_MS) {
          console.log(`[NotifPrefs] reloaded ${age}ms ago, waiting…`);
          setTimeout(checkAndInject, STABILITY_MS - age + 300);
          return;
        }

        if ((st.notifPrefsInjectAttempts || 0) >= 6) {
          console.error("[NotifPrefs] too many inject attempts, aborting");
          clearTask(capturedTabId);
          return;
        }
        st.notifPrefsInjectAttempts = (st.notifPrefsInjectAttempts || 0) + 1;
        // Reset timer flag BEFORE inject so a post-inject reload can start a new cycle
        st.notifPrefsTimerRunning = false;

        console.log(`[NotifPrefs] stable ${age}ms — injecting (attempt ${st.notifPrefsInjectAttempts})`);
        try {
          await chrome.scripting.executeScript({
            target: { tabId: capturedTabId },
            files: ["notification_preferences.js"],
          });
          console.log(`[NotifPrefs] injection complete`);
        } catch (error) {
          console.error("[NotifPrefs] injection failed:", error);
          clearTask(capturedTabId);
        }
      };

      setTimeout(checkAndInject, STABILITY_MS);
      return;
    }

    return;
  }

  if (taskState.taskType === "inventoryAgeScan") {
    if (taskState.processing) return;
    if (taskState.expectedUrl && !tab.url.startsWith(taskState.expectedUrl)) return;
    taskState.processing = true;

    (async () => {
      try {
        const stored = await chrome.storage.local.get(INVENTORY_AGE_QUEUE_KEY);
        const queue = stored[INVENTORY_AGE_QUEUE_KEY];
        if (!queue) { clearTask(tabId); return; }

        if (taskState.phase === "switch") {
          // /home loaded — navigate to inventory age page
          const targetUrl = `https://${queue.baseDomain}${INVENTORY_AGE_PATH}`;
          taskStateByTabId.set(tabId, {
            taskType: "inventoryAgeScan", tabId,
            phase: "scrape",
            expectedUrl: `https://${queue.baseDomain}${INVENTORY_AGE_PATH}`,
          });
          await chrome.storage.local.set({
            [INVENTORY_AGE_PROGRESS_KEY]: {
              active: true, phase: "load",
              currentMarket: queue.markets[queue.currentIndex]?.label || "??",
              page: 1, rowsSoFar: 0, startedAt: queue.startedAt, error: null,
            },
          });
          await chrome.tabs.update(tabId, { url: targetUrl });
          return;
        }

        if (taskState.phase === "scrape" && tab.url?.includes(INVENTORY_AGE_PATH)) {
          const mkt = queue.markets[queue.currentIndex];
          await chrome.storage.local.set({
            [INVENTORY_AGE_PROGRESS_KEY]: {
              active: true, phase: "scrape",
              currentMarket: mkt?.label || "??",
              page: 1, rowsSoFar: 0, startedAt: queue.startedAt, error: null,
            },
          });

          if (queue.dryRun) {
            // Generate fake rows for dry run
            const fakeRows = Array.from({ length: 12 }, (_, i) => ({
              asin: `B00FAKE${i.toString().padStart(4,"0")}`,
              sku: `SKU-DRYRUN-${i}`, fnsku: `X00FAKE${i}`,
              title: `Dry Run Product ${i + 1}`,
              ageBuckets: { "0-60": 5, "61-90": 2, "91-180": 1, "181-330": i === 3 ? 19 : 0, "331-365": 0, "366-455": 0, "456+": i === 7 ? 3 : 0 },
              totalUnits: 5 + i, onHand: i > 2 ? 5 + i : 0,
              excessUnits: i === 1 ? 10 : 0,
              recommendedMinUnits: 3, recommendedMinDoS: 14 + i * 3,
              estAisTotal: "--", recommendedAction: i === 0 ? "Restock 5 units today at FBA" : "",
              sellThroughRaw: "0.5", yourPriceRaw: "€12.99",
            }));
            const mktKey = mkt?.label || "DRY";
            queue.results[mktKey] = fakeRows;
            queue.currentIndex++;
            await chrome.storage.local.set({ [INVENTORY_AGE_QUEUE_KEY]: queue });
            await finalizeInventoryAgeScan(queue);
            clearTask(tabId);
            return;
          }

          // Real scrape — send message to content script
          clearTask(tabId);
          await chrome.tabs.sendMessage(tabId, { action: "SCRAPE_INVENTORY_AGE", tabId }).catch(e => {
            console.error("[BG] SCRAPE_INVENTORY_AGE send error:", e);
            chrome.storage.local.set({ [INVENTORY_AGE_PROGRESS_KEY]: { active: false, phase: "done", error: e.message } });
          });
        }
      } catch (error) {
        console.error("[BG] inventoryAgeScan onUpdated error:", error);
        await chrome.storage.local.set({ [INVENTORY_AGE_PROGRESS_KEY]: { active: false, phase: "done", error: error.message } });
        clearTask(tabId);
      }
    })();
    return;
  }

  if (taskState.taskType === "invoiceDownload") {
    if (tab.url?.includes("/tax/seller-fee-invoices")) {
      try {
        const r = await chrome.storage.local.get("_invoiceDownloaderPendingParams");
        const params = r._invoiceDownloaderPendingParams;
        if (params) await injectInvoiceDownloader(tabId, params);
        clearTask(tabId);
      } catch (error) {
        console.error("Failed to inject invoice_downloader.js", error);
        clearTask(tabId);
      }
    }
    return;
  }

  if (taskState.taskType === "vatReportDownload") {
    if (tab.url?.includes("/reportcentral/VAT_TRANSACTION/1")) {
      try {
        const result = await chrome.storage.local.get(VAT_REPORT_PENDING_PARAMS_KEY);
        const params = result[VAT_REPORT_PENDING_PARAMS_KEY];
        if (params) {
          await injectVatReportDownloader(tabId, params);
        }
        clearTask(tabId);
      } catch (error) {
        console.error("Failed to inject vat_report_downloader.js", error);
        clearTask(tabId);
      }
    }
    return;
  }

  if (taskState.taskType === "deleteTemplate") {
    if (taskState.processing) {
      console.log(`[BG] deleteTemplate: already processing — ignoring onUpdated for "${tab.url}"`);
      return;
    }
    if (taskState.expectedUrl && !tab.url.startsWith(taskState.expectedUrl)) {
      console.log(`[BG] deleteTemplate: unexpected URL "${tab.url}" — skipping`);
      return;
    }

    taskState.processing = true;

    (async () => {
      let queue;
      try {
        const stored = await chrome.storage.local.get(DELETE_QUEUE_KEY);
        queue = stored[DELETE_QUEUE_KEY];
        if (!queue) { clearTask(tabId); return; }

        // ── Phase "switch": /home loaded, account switched — navigate to /sbr.
        if (taskState.phase === "switch") {
          const sbrUrl = buildShippingTemplatesUrl(queue.baseDomain);
          taskStateByTabId.set(tabId, {
            taskType: "deleteTemplate",
            tabId,
            phase: "delete",
            expectedUrl: `https://${queue.baseDomain}/sbr`,
          });
          await chrome.tabs.update(tabId, { url: sbrUrl });
          return;
        }

        if (!tab.url?.includes("/sbr")) { return; }

        const template = queue.templates[queue.currentIndex];
        if (!template) { clearTask(tabId); return; }

        const marketTag = template.marketCode ? `[${template.marketCode}] ` : "";
        console.log(`[BG] deleteTemplate: deleting "${marketTag}${template.name}" (${queue.currentIndex + 1}/${queue.templates.length})`);

        await injectShippingPriceChanger(tabId);

        let r;
        try {
          const [execResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (name) => window.__deleteShippingTemplate(name),
            args: [template.name],
          });
          r = execResult?.result || { success: false, error: "No result from __deleteShippingTemplate", deleted: false };
        } catch (err) {
          const isNavigation = /frame|removed|detached|destroyed|navigat/i.test(err.message || "");
          r = isNavigation
            ? { success: true, navigationDelete: true }
            : { success: false, error: `Script error: ${err.message}` };
        }

        if (r.success) {
          queue.deleted++;
          console.log(`[BG] deleteTemplate: ✓ "${template.name}" deleted.`);
        } else {
          console.warn(`[BG] deleteTemplate: ✗ "${template.name}": ${r.error}`);
          queue.errors.push({ template: template.name, error: r.error || "Unknown error" });
        }

        queue.currentIndex++;
        const hasMore = queue.currentIndex < queue.templates.length;
        const nextTemplate = queue.templates[queue.currentIndex];
        const nextLabel = nextTemplate
          ? (nextTemplate.marketCode ? `[${nextTemplate.marketCode}] ` : "") + nextTemplate.name
          : "";

        await chrome.storage.local.set({
          [DELETE_PROGRESS_KEY]: {
            active: hasMore,
            current: queue.currentIndex,
            total: queue.templates.length,
            deleted: queue.deleted,
            label: nextLabel,
            error: queue.errors.map((e) => `${e.template}: ${e.error}`).join("; "),
          },
        });

        if (hasMore) {
          await chrome.storage.local.set({ [DELETE_QUEUE_KEY]: queue });
          const delBase = queue.baseDomain || new URL(tab.url).hostname;
          await new Promise((resolve) => setTimeout(resolve, 1200));
          if (nextTemplate.mkid) {
            taskStateByTabId.set(tabId, {
              taskType: "deleteTemplate", tabId,
              phase: "switch", expectedUrl: `https://${delBase}`,
            });
            await chrome.tabs.update(tabId, { url: buildShippingTemplatesSwitchUrl(nextTemplate, delBase) });
          } else {
            taskStateByTabId.set(tabId, {
              taskType: "deleteTemplate", tabId,
              phase: "delete", expectedUrl: `https://${delBase}/sbr`,
            });
            await chrome.tabs.update(tabId, { url: buildShippingTemplatesUrl(delBase) });
          }
        } else {
          await chrome.storage.local.remove(DELETE_QUEUE_KEY);
          clearTask(tabId);
        }
      } catch (error) {
        console.error("[BG] deleteTemplate error:", error);
        await chrome.storage.local.set({
          [DELETE_PROGRESS_KEY]: {
            active: false,
            current: queue?.currentIndex ?? 0,
            total: queue?.templates?.length ?? 0,
            deleted: queue?.deleted ?? 0,
            label: "",
            error: error.message || String(error),
          },
        }).catch(() => {});
        await chrome.storage.local.remove(DELETE_QUEUE_KEY).catch(() => {});
        clearTask(tabId);
      } finally {
        if (taskStateByTabId.get(tabId) === taskState) taskState.processing = false;
      }
    })();
    return;
  }

  if (taskState.taskType === "listShippingTemplates") {
    if (taskState.processing) return;
    if (taskState.expectedUrl && !tab.url.startsWith(taskState.expectedUrl)) return;

    taskState.processing = true;
    (async () => {
      let keepTaskAlive = false;
      try {
        const phase = taskState.phase || "load";

        // ── Phase "switch": /home has loaded, account is now switched.
        //    Navigate to /sbr to collect templates.
        if (phase === "switch") {
          const stored = await chrome.storage.local.get(SPC_MARKET_LOAD_QUEUE_KEY);
          const mq = stored[SPC_MARKET_LOAD_QUEUE_KEY];
          if (!mq) { clearTask(tabId); return; }
          const sbrUrl = buildShippingTemplatesUrl(mq.baseDomain);
          keepTaskAlive = true;
          taskStateByTabId.set(tabId, {
            taskType: "listShippingTemplates",
            tabId,
            phase: "load",
            expectedUrl: `https://${mq.baseDomain}/sbr`,
          });
          await chrome.tabs.update(tabId, { url: sbrUrl });
          return;
        }

        // ── Phase "load": /sbr has loaded, collect templates.
        if (!tab.url?.includes("/sbr")) { taskState.processing = false; return; }

        await injectShippingPriceChanger(tabId);
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.__listShippingTemplates(),
        });
        const templates = result?.result || [];

        const stored = await chrome.storage.local.get(SPC_MARKET_LOAD_QUEUE_KEY);
        const marketQueue = stored[SPC_MARKET_LOAD_QUEUE_KEY];

        if (marketQueue) {
          const currentMarket = marketQueue.markets[marketQueue.currentIndex];
          const currentOrigin = currentMarket.origin
            || (currentMarket.domain ? `https://${currentMarket.domain}` : DEFAULT_SELLER_CENTRAL_ORIGIN);
          const marketCode = getMarketCodeFromOrigin(currentOrigin);
          const tagged = templates.map((t) => ({
            ...t,
            origin: currentOrigin,
            marketCode,
            mkid: currentMarket.mkid || "",
            mcid: currentMarket.mcid || "",
            globalAccountId: currentMarket.globalAccountId || "",
          }));
          console.log(`[BG] listShippingTemplates [${marketCode}]: found ${templates.length} template(s).`);

          marketQueue.accumulated.push(...tagged);
          marketQueue.currentIndex++;

          if (marketQueue.currentIndex < marketQueue.markets.length) {
            keepTaskAlive = true;
            await chrome.storage.local.set({ [SPC_MARKET_LOAD_QUEUE_KEY]: marketQueue });
            const nextMarket = marketQueue.markets[marketQueue.currentIndex];
            if (nextMarket.mkid) {
              // Switch account first, then load
              const switchUrl = buildShippingTemplatesSwitchUrl(nextMarket, marketQueue.baseDomain);
              taskStateByTabId.set(tabId, {
                taskType: "listShippingTemplates",
                tabId,
                phase: "switch",
                expectedUrl: `https://${marketQueue.baseDomain}`,
              });
              await chrome.tabs.update(tabId, { url: switchUrl });
            } else {
              const sbrUrl = buildShippingTemplatesUrl(marketQueue.baseDomain);
              taskStateByTabId.set(tabId, {
                taskType: "listShippingTemplates",
                tabId,
                phase: "load",
                expectedUrl: `https://${marketQueue.baseDomain}/sbr`,
              });
              await chrome.tabs.update(tabId, { url: sbrUrl });
            }
            return;
          }

          console.log(`[BG] listShippingTemplates: total ${marketQueue.accumulated.length} template(s) across ${marketQueue.currentIndex} market(s).`);
          await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: marketQueue.accumulated });
          await chrome.storage.local.remove(SPC_MARKET_LOAD_QUEUE_KEY);
        } else {
          console.log(`[BG] listShippingTemplates: found ${templates.length} template(s).`);
          await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: templates });
        }
      } catch (error) {
        console.error("[BG] listShippingTemplates error:", error);
        await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: [] });
        await chrome.storage.local.remove(SPC_MARKET_LOAD_QUEUE_KEY).catch(() => {});
      } finally {
        if (taskStateByTabId.get(tabId) === taskState) taskState.processing = false;
        if (!keepTaskAlive) clearTask(tabId);
      }
    })();
    return;
  }

  if (taskState.taskType === "priceChange") {
    // ── Processing lock — prevents re-entrant execution when onUpdated fires
    // multiple times for the same template (e.g. post-save redirect triggers
    // onUpdated while the original applyChange handler is still running).
    if (taskState.processing) {
      console.log(`[BG] priceChange: already processing — ignoring onUpdated for "${tab.url}"`);
      return;
    }

    // ── URL guard — only process if the current URL matches what we navigated to.
    // This blocks spurious onUpdated calls caused by Amazon's post-save redirects.
    if (taskState.expectedUrl && !tab.url.startsWith(taskState.expectedUrl)) {
      console.log(`[BG] priceChange: unexpected URL "${tab.url}" (expected "${taskState.expectedUrl}") — skipping`);
      return;
    }

    taskState.processing = true;

    (async () => {
      let queue;
      try {
        const stored = await chrome.storage.local.get(PRICE_CHANGE_QUEUE_KEY);
        queue = stored[PRICE_CHANGE_QUEUE_KEY];
        if (!queue) { clearTask(tabId); return; }

        const template = queue.templates[queue.currentIndex];
        if (!template) { clearTask(tabId); return; }

        const phase = taskState.phase || "selectEdit";

        // ── Phase "switch": /home loaded, account switched — navigate to /sbr.
        if (phase === "switch") {
          const pcBase = queue.baseDomain || new URL(tab.url).hostname;
          taskStateByTabId.set(tabId, {
            taskType: "priceChange", phase: "selectEdit", tabId,
            expectedUrl: `https://${pcBase}/sbr`,
          });
          await chrome.tabs.update(tabId, { url: buildShippingTemplatesUrl(pcBase) });
          return;
        }

        // ── Safety check: verify the template name is actually in the selected list.
        const templateInQueue = queue.templates.some((t) => t.name === template.name);
        if (!templateInQueue) {
          console.error(`[BG] priceChange: "${template.name}" not found in selected templates — aborting.`);
          clearTask(tabId);
          return;
        }

        await injectShippingPriceChanger(tabId);

        let r;

        if (phase === "selectEdit") {
          const marketTag = template.marketCode ? `[${template.marketCode}] ` : "";
          console.log(`[BG] priceChange: getting edit URL for "${marketTag}${template.name}" (${queue.currentIndex + 1}/${queue.templates.length})`);

          let urlRes;
          try {
            const [s] = await chrome.scripting.executeScript({
              target: { tabId },
              func: (name) => window.__getTemplateEditUrl(name),
              args: [template.name],
            });
            urlRes = s?.result;
          } catch (err) {
            console.error(`[BG] priceChange: __getTemplateEditUrl threw:`, err);
            urlRes = { found: false, error: err.message };
          }

          if (!urlRes?.found) {
            r = { success: false, error: urlRes?.error || "Template edit URL not found.", changed: 0 };
          } else {
            const pcOrigin = `https://${queue.baseDomain || new URL(tab.url).hostname}`;
            const fullEditUrl = pcOrigin + urlRes.editUrl;
            console.log(`[BG] priceChange: navigating to edit URL for "${template.name}": ${fullEditUrl}`);
            // Store expectedUrl so we only react to the edit page load, not any other navigation.
            taskStateByTabId.set(tabId, { taskType: "priceChange", phase: "applyChange", tabId, expectedUrl: fullEditUrl });
            await chrome.storage.local.set({ [PRICE_CHANGE_QUEUE_KEY]: queue });
            await chrome.tabs.update(tabId, { url: fullEditUrl });
            return;
          }
        } else {
          // phase === "applyChange": on the edit page, apply prices and save.
          console.log(`[BG] priceChange: applying on edit page for "${template.name}" — url: ${tab.url}`);

          // Clear expectedUrl immediately so any post-save navigation is ignored.
          taskState.expectedUrl = null;

          try {
            const [execResult] = await chrome.scripting.executeScript({
              target: { tabId },
              func: (cfg) => window.__applyPriceChange(cfg),
              args: [queue.config],
            });
            r = execResult?.result || { success: false, error: "applyPriceChange returned null — script not injected?", changed: 0 };
          } catch (err) {
            // Frame destroyed = Save button was clicked and Amazon navigated away.
            // This means the save succeeded — treat it as success with unknown changed count.
            const isNavigation = /frame|removed|detached|destroyed|navigat/i.test(err.message || "");
            if (isNavigation) {
              console.log(`[BG] priceChange: frame navigated after Save for "${template.name}" — treating as success.`);
              r = { success: true, changed: 0, navigationSave: true };
            } else {
              console.warn(`[BG] priceChange: applyPriceChange threw: ${err.message}`);
              r = { success: false, error: `Script error: ${err.message}`, changed: 0 };
            }
          }
        }

        if (r.success) {
          queue.totalChanged += r.changed || 0;
          console.log(`[BG] priceChange: ✓ "${template.name}" done — ${r.navigationSave ? "saved (via navigation)" : `${r.changed} price(s) changed`}`);
        } else {
          console.warn(`[BG] priceChange: ✗ "${template.name}": ${r.error}`);
          queue.errors.push({ template: template.name, error: r.error || "Unknown error" });
        }

        queue.currentIndex++;
        const hasMore = queue.currentIndex < queue.templates.length;
        const nextTemplate = queue.templates[queue.currentIndex];

        const nextLabel = nextTemplate
          ? (nextTemplate.marketCode ? `[${nextTemplate.marketCode}] ` : "") + nextTemplate.name
          : "";

        await chrome.storage.local.set({
          [PRICE_CHANGE_PROGRESS_KEY]: {
            active: hasMore,
            current: queue.currentIndex,
            total: queue.templates.length,
            totalChanged: queue.totalChanged,
            label: nextLabel,
            error: queue.errors.map((e) => `${e.template}: ${e.error}`).join("; "),
          },
        });

        if (hasMore) {
          await chrome.storage.local.set({ [PRICE_CHANGE_QUEUE_KEY]: queue });
          const pcBase = queue.baseDomain || new URL(tab.url).hostname;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (nextTemplate.mkid) {
            taskStateByTabId.set(tabId, {
              taskType: "priceChange", phase: "switch", tabId,
              expectedUrl: `https://${pcBase}`,
            });
            await chrome.tabs.update(tabId, { url: buildShippingTemplatesSwitchUrl(nextTemplate, pcBase) });
          } else {
            taskStateByTabId.set(tabId, {
              taskType: "priceChange", phase: "selectEdit", tabId,
              expectedUrl: `https://${pcBase}/sbr`,
            });
            await chrome.tabs.update(tabId, { url: buildShippingTemplatesUrl(pcBase) });
          }
        } else {
          await chrome.storage.local.remove(PRICE_CHANGE_QUEUE_KEY);
          void maybeDownloadConsoleLog(tabId, "shipping_price_change");
          clearTask(tabId);
        }
      } catch (error) {
        console.error("[BG] priceChange error:", error);
        await chrome.storage.local.set({
          [PRICE_CHANGE_PROGRESS_KEY]: {
            active: false,
            current: queue?.currentIndex ?? 0,
            total: queue?.templates?.length ?? 0,
            totalChanged: queue?.totalChanged ?? 0,
            label: "",
            error: error.message || String(error),
          },
        }).catch(() => {});
        await chrome.storage.local.remove(PRICE_CHANGE_QUEUE_KEY).catch(() => {});
        clearTask(tabId);
      } finally {
        // Always release the lock so the task state doesn't get stuck.
        if (taskStateByTabId.get(tabId) === taskState) {
          taskState.processing = false;
        }
      }
    })();
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureBookmarksContextMenu();
  void restoreDraftSchedule();
  void restoreIbaSchedule();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureBookmarksContextMenu();
  void restoreDraftSchedule();
  void restoreIbaSchedule();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  (async () => {
    if (alarm.name === DRAFT_SCHEDULE_ALARM) {
      const config = await loadDraftSchedule();

      if (!config.enabled) {
        return;
      }

      await runScheduledDraftStart(config);
      const nextRun = await scheduleDraftAlarm(config.intervalMinutes);
      await saveDraftSchedule({
        ...config,
        nextRun
      });
      return;
    }

    if (alarm.name === IBA_SCHEDULE_ALARM) {
      const config = await loadIbaSchedule();

      if (!config.enabled) {
        return;
      }

      await runScheduledIbaStart();
      const nextRun = await scheduleIbaAlarm(config.time);
      await saveIbaSchedule({
        ...config,
        nextRun
      });
    }
  })();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SC_BOOKMARKS_CONTEXT_MENU_ID || !tab?.url || !canBookmarkUrl(tab.url)) {
    return;
  }

  (async () => {
    const bookmarks = await loadBookmarks();
    bookmarks.unshift(createBookmarkRecord(tab));
    await saveBookmarks(bookmarks);
  })();
});

// ── Brand Scanner orchestration ───────────────────────────────────────────────
// Runs in background so it survives popup closing when a new tab gets focus.

const BRAND_SCANNER_PATH = "/performance/account/health/product-policies";
const BRAND_SCANNER_FALLBACK_ORIGIN = "https://sellercentral.amazon.de";

function brandScannerGetOrigin(tabUrl) {
  try {
    const u = new URL(tabUrl);
    if (/sellercentral\.amazon\./i.test(u.hostname)) return u.origin;
  } catch (_) { /* ignore */ }
  return BRAND_SCANNER_FALLBACK_ORIGIN;
}

function brandScannerWaitForTabLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      clearInterval(stopPoller);
    }

    function onUpdated(id, changeInfo) {
      if (id !== tabId) return;
      if (changeInfo.status === "complete") { cleanup(); resolve(); }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    const timer = setTimeout(() => { cleanup(); reject(new Error("Tab load timeout")); }, timeoutMs);

    const stopPoller = setInterval(() => {
      if (brandScannerStopRequested) { cleanup(); reject(new Error("Stopped")); }
    }, 100);
  });
}

const BRAND_SCANNER_STORAGE_KEY = "_brandScannerState";
let brandScannerStopRequested = false;

async function brandScannerOrchestrate(brands, originTabUrl) {
  brandScannerStopRequested = false;
  const origin = brandScannerGetOrigin(originTabUrl);

  // Clear previous results and mark scan as running
  await chrome.storage.local.set({
    [BRAND_SCANNER_STORAGE_KEY]: { status: "running", total: brands.length, rows: [] }
  });

  function broadcast(msg) {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }

  async function appendStorageRow(rowEntry) {
    const data = (await chrome.storage.local.get(BRAND_SCANNER_STORAGE_KEY))[BRAND_SCANNER_STORAGE_KEY] || { rows: [] };
    data.rows.push(rowEntry);
    await chrome.storage.local.set({ [BRAND_SCANNER_STORAGE_KEY]: data });
  }

  // Open a single reusable tab for the whole scan
  let scanTab;
  try {
    scanTab = await chrome.tabs.create({
      url: `${origin}${BRAND_SCANNER_PATH}`,
      active: false
    });
    await brandScannerWaitForTabLoad(scanTab.id);
  } catch (err) {
    broadcast({ type: "BRAND_SCANNER_DONE" });
    return;
  }

  async function stopScan(scanned) {
    chrome.tabs.remove(scanTab.id).catch(() => {});
    broadcast({ type: "BRAND_SCANNER_STOPPED", scanned, total: brands.length });
    const fd = (await chrome.storage.local.get(BRAND_SCANNER_STORAGE_KEY))[BRAND_SCANNER_STORAGE_KEY] || { rows: [] };
    fd.status = "stopped";
    await chrome.storage.local.set({ [BRAND_SCANNER_STORAGE_KEY]: fd });
  }

  // Navigate the shared tab to a brand variant URL and wait for the result
  async function fetchBrandVariant(variant) {
    const url = `${origin}${BRAND_SCANNER_PATH}?t=regulatory-compliance&s=${encodeURIComponent(variant)}`;

    // Register load listener BEFORE navigating to avoid race condition
    const loadPromise = brandScannerWaitForTabLoad(scanTab.id);
    try {
      await chrome.tabs.update(scanTab.id, { url });
      await loadPromise;
    } catch (err) {
      return { rows: null, error: err.message }; // "Stopped" or load error
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => { cleanup(); resolve({ rows: null, error: "Timeout" }); }, 15000);
      const stopPoller = setInterval(() => {
        if (brandScannerStopRequested) { cleanup(); resolve({ rows: null, error: "Stopped" }); }
      }, 100);

      function cleanup() {
        clearTimeout(timeout);
        clearInterval(stopPoller);
        chrome.runtime.onMessage.removeListener(onMsg);
      }
      function onMsg(msg, sender) {
        if (msg.type === "BRAND_SCANNER_PAGE_RESULT" && sender.tab?.id === scanTab.id) {
          cleanup();
          resolve(msg);
        }
      }
      chrome.runtime.onMessage.addListener(onMsg);
    });
  }

  for (let i = 0; i < brands.length; i++) {
    if (brandScannerStopRequested) { await stopScan(i); return; }

    const brand = brands[i];

    // Build fallback variants: original → UPPERCASE → lowercase (skip duplicates)
    const variants = [brand];
    const upper = brand.toUpperCase();
    const lower = brand.toLowerCase();
    if (upper !== brand) variants.push(upper);
    if (lower !== brand && lower !== upper) variants.push(lower);

    let result = null;
    for (const variant of variants) {
      result = await fetchBrandVariant(variant);
      if (result.error === "Stopped") break;
      if (result.error) break;
      if (result.rows && result.rows.length > 0) break;
    }

    if (brandScannerStopRequested) { await stopScan(i); return; }

    const entry = { brand, rows: result.rows, error: result.error || null, index: i, total: brands.length };
    await appendStorageRow(entry);
    broadcast({ type: "BRAND_SCANNER_RESULT", ...entry });
  }

  chrome.tabs.remove(scanTab.id).catch(() => {});

  // Mark done in storage
  const finalData = (await chrome.storage.local.get(BRAND_SCANNER_STORAGE_KEY))[BRAND_SCANNER_STORAGE_KEY] || { rows: [] };
  finalData.status = "done";
  await chrome.storage.local.set({ [BRAND_SCANNER_STORAGE_KEY]: finalData });

  broadcast({ type: "BRAND_SCANNER_DONE" });
}

// ── Console log capture ────────────────────────────────────────────────────────
let capturedLogEntries = [];
let logCaptureEnabled = false;

// ── Request Payment / Disbursement orchestration ──────────────────────────────
// Runs entirely in background — survives popup closing or tab switching.

let disbursementStopRequested = false;

function disbursementBroadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function disbursementWaitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let sawLoading = false;
    function cleanup() {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
    }
    function onUpdated(id, changeInfo) {
      if (id !== tabId) return;
      if (changeInfo.status === "loading") sawLoading = true;
      if (changeInfo.status === "complete" && sawLoading) { cleanup(); resolve(); }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    const timer = setTimeout(() => { cleanup(); reject(new Error("Navigation timeout")); }, timeoutMs);
  });
}

// Wait until the tab's URL contains /payments/disburse (user completed step-up auth)
function disbursementWaitForAuthOnTab(tabId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function cleanup() {
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
    }
    function check(url) {
      if (url && url.includes("/payments/disburse")) { cleanup(); resolve(); }
    }
    function onUpdated(id, changeInfo) {
      if (id !== tabId || settled) return;
      if (changeInfo.status === "complete") {
        chrome.tabs.get(tabId).then((t) => check(t.url)).catch(() => {});
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Check current URL immediately in case tab is already on the right page
    chrome.tabs.get(tabId).then((t) => check(t.url)).catch(() => {});
    const timer = setTimeout(() => { cleanup(); reject(new Error("Auth wait timeout")); }, timeoutMs);
  });
}

// Top-level page type detector — usable by any feature, not just disbursement.
async function getPageTypeStandalone(tabId, retries = 4) {
  for (let i = 0; i < retries; i++) {
    const result = await chrome.tabs.sendMessage(tabId, { action: "GET_PAGE_TYPE" })
      .catch(() => null);
    if (result && result.type !== "other") return result;
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 500));
  }
  return { type: "other", url: "" };
}

// Wait for a tab to reach "complete" status — simpler than disbursementWaitForTabLoad,
// does NOT require seeing "loading" first (avoids race conditions on redirects).
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    function onUpdated(id, changeInfo) {
      if (id === tabId && changeInfo.status === "complete") done();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    const timer = setTimeout(done, timeoutMs);
  });
}

// ── Market Switch with account-switcher handling ──────────────────────────────
async function marketSwitchWithAccountCheck(tabId, targetUrl, sellerName, marketLabel) {
  console.log("[SellerTools] marketSwitchWithAccountCheck START tabId=%d seller=%s market=%s", tabId, sellerName, marketLabel);

  const loadPromise = waitForTabComplete(tabId, 20000);
  await chrome.tabs.update(tabId, { url: targetUrl });
  await loadPromise;
  console.log("[SellerTools] marketSwitchWithAccountCheck: tab reached complete, settling 2s…");

  await new Promise((r) => setTimeout(r, 2000));

  if (!sellerName) {
    console.log("[SellerTools] marketSwitchWithAccountCheck: no sellerName, stopping");
    return;
  }

  console.log("[SellerTools] marketSwitchWithAccountCheck: sending DO_ACCOUNT_SELECT");
  const selectResult = await chrome.tabs.sendMessage(tabId, {
    action: "DO_ACCOUNT_SELECT",
    sellerName,
    marketLabel: marketLabel || null,
  }).catch((e) => ({ success: false, error: "sendMessage failed: " + e.message }));
  console.log("[SellerTools] marketSwitchWithAccountCheck: DO_ACCOUNT_SELECT result:", JSON.stringify(selectResult));

  if (selectResult?.success) {
    await new Promise((resolve) => {
      const deadline = Date.now() + 20000;
      let settled = false;
      function cleanup() { settled = true; chrome.tabs.onUpdated.removeListener(onUpdated); }
      function onUpdated(id, changeInfo) {
        if (id !== tabId || settled) return;
        if (changeInfo.status === "complete") {
          chrome.tabs.get(tabId).then((t) => {
            if (t.url && !t.url.includes("/account-switcher/")) { cleanup(); resolve(); }
            else if (Date.now() > deadline) { cleanup(); resolve(); }
          }).catch(() => { cleanup(); resolve(); });
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      if (Date.now() > deadline) { cleanup(); resolve(); }
    });
  }
  console.log("[SellerTools] marketSwitchWithAccountCheck: DONE");
}

async function disbursementOrchestrate(markets, originTabId, currentDomain, currentMarket, currentSellerName) {
  disbursementStopRequested = false;

  function broadcast(msg) { disbursementBroadcast({ ...msg, type: "DISBURSEMENT_" + msg.type }); }

  // Use the original tab directly — it has a valid full session
  const workTab = { id: originTabId };

  let completed = 0;
  const results = []; // { market, amount }

  // Build pre-flight URL — include current market params to preserve account context
  // (without them, agency sub-accounts get redirected to the account switcher page)
  function buildDisburseUrl(market) {
    const url = new URL(`https://${currentDomain}/payments/disburse`);
    const mkid = market?.ids?.mons_sel_mkid || "";
    const mcid = market?.ids?.mons_sel_dir_mcid || "";
    const paid = market?.globalAccountId || "";
    if (mkid) url.searchParams.set("mons_sel_mkid", mkid);
    if (mcid) url.searchParams.set("mons_sel_dir_mcid", mcid);
    if (paid) url.searchParams.set("mons_sel_dir_paid", paid);
    url.searchParams.set("ignore_selection_changed", "true");
    return url.toString();
  }

  // Ask content script what page type is currently loaded — more reliable than URL matching.
  // Retries a few times in case the content script is still loading after a redirect.
  async function getPageType(tabId, retries = 4) {
    for (let i = 0; i < retries; i++) {
      const result = await chrome.tabs.sendMessage(tabId, { action: "GET_PAGE_TYPE" })
        .catch(() => null);
      if (result && result.type !== "other") return result;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 500));
    }
    return { type: "other", url: "" };
  }

  // Try to auto-select the seller on the account switcher page, then wait for
  // redirect back to /payments/disburse. Falls back to manual auth wait.
  async function handleUnexpectedUrl(tabId, retryUrl, marketLabel = null) {
    const pageType = await getPageType(tabId);

    if (pageType.type === "account-switcher" && currentSellerName) {
      broadcast({ type: "PROGRESS", completed, total: markets.length, market: "", step: "selecting_account" });
      const selectResult = await chrome.tabs.sendMessage(tabId, {
        action: "DO_ACCOUNT_SELECT",
        sellerName: currentSellerName,
        marketLabel,
      }).catch(() => ({ success: false }));

      if (selectResult?.success) {
        // Use waitForAuthOnTab — checks current URL immediately and watches future navigations,
        // doesn't require catching the "loading" event before it fires.
        await disbursementWaitForAuthOnTab(tabId, 30000).catch(() => {});
        const afterType = await getPageType(tabId);
        if (afterType.type === "disburse") return; // success
      }
    }

    // Fallback: ask user to handle login / account selection manually
    broadcast({ type: "AWAIT_AUTH" });
    await disbursementWaitForAuthOnTab(tabId, 120000);
    if (retryUrl) {
      const retryLoad = disbursementWaitForTabLoad(tabId, 30000);
      await chrome.tabs.update(tabId, { url: retryUrl });
      await retryLoad;
    }
  }

  try {
    // Pre-flight: navigate to /payments/disburse with current market context to trigger
    // step-up auth if needed. The user can log in directly in the tab.
    broadcast({ type: "PROGRESS", completed, total: markets.length, market: "", step: "auth_check" });
    const preflightMarket = currentMarket || markets[0];
    const preflightLoadPromise = disbursementWaitForTabLoad(workTab.id, 30000);
    await chrome.tabs.update(workTab.id, { url: buildDisburseUrl(preflightMarket) });
    await preflightLoadPromise;

    // Wait briefly — the disburse page may itself redirect to account-switcher or login
    await new Promise((r) => setTimeout(r, 1500));
    const preflightType = await getPageType(workTab.id);
    if (preflightType.type !== "disburse") {
      await handleUnexpectedUrl(workTab.id, null, preflightMarket?.label || null);
    }

    if (disbursementStopRequested) { broadcast({ type: "STOPPED", completed }); return; }

    for (const market of markets) {
      if (disbursementStopRequested) {
        broadcast({ type: "STOPPED", completed });
        return;
      }

      broadcast({ type: "PROGRESS", completed, total: markets.length, market: market.label, step: "switching" });

      // Navigate directly to /payments/disburse with market switch params combined —
      // avoids a second navigation that could invalidate the step-up auth cookie
      const marketDisburseUrl = buildDisburseUrl(market);
      const disburseLoadPromise = disbursementWaitForTabLoad(workTab.id, 30000);
      await chrome.tabs.update(workTab.id, { url: marketDisburseUrl });
      await disburseLoadPromise;

      // Wait briefly — the disburse page may itself redirect to account-switcher or login
      await new Promise((r) => setTimeout(r, 1500));
      const pageTypeAfterNav = await getPageType(workTab.id);
      if (pageTypeAfterNav.type !== "disburse") {
        await handleUnexpectedUrl(workTab.id, marketDisburseUrl, market.label);
      }

      if (disbursementStopRequested) { broadcast({ type: "STOPPED", completed }); return; }

      // Settle time for KAT components to initialize on the payments page
      await new Promise((r) => setTimeout(r, 2000));

      if (disbursementStopRequested) { broadcast({ type: "STOPPED", completed }); return; }

      // Step 3: click the disbursement button via content script
      broadcast({ type: "PROGRESS", completed, total: markets.length, market: market.label, step: "disbursing" });
      const response = await chrome.tabs.sendMessage(workTab.id, { action: "DO_DISBURSEMENT" })
        .catch((e) => ({ success: false, error: e.message }));

      if (!response?.success) {
        broadcast({ type: "ERROR", market: market.label, error: response?.error || "Unknown error" });
        return;
      }

      completed++;
      results.push({ market: market.label, amount: response.amount || null });
      broadcast({ type: "PROGRESS", completed, total: markets.length, market: market.label, step: "done" });

      if (completed < markets.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    broadcast({ type: "DONE", completed, results });
  } catch (err) {
    broadcast({ type: "ERROR", market: "", error: err.message });
  }
}

// ── SPP Management helpers ────────────────────────────────────────────────────

function sppPollInTab(tabId, func, intervalMs = 400, timeoutMs = 12000) {
  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs;
    function check() {
      chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func })
        .then(([r]) => {
          if (r?.result) { resolve(true); return; }
          if (Date.now() > deadline) { resolve(false); return; }
          setTimeout(check, intervalMs);
        })
        .catch(() => {
          // executeScript can fail transiently during page load/reload — retry instead of failing
          if (Date.now() > deadline) { resolve(false); return; }
          setTimeout(check, intervalMs);
        });
    }
    setTimeout(check, intervalMs);
  });
}

async function sppOpenAddToClientModal(tabId, actorId) {
  await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: () => {
      const root = document.getElementById("global-user-permissions-root");
      root?.__vue_app__?.config?.globalProperties?.$router?.push("/user-management/users");
    },
  });

  // Clear any pre-filled client filter (kat-dropdown[data-test="client"] with part="clear-btn")
  await new Promise(r => setTimeout(r, 700));
  const [hadFilter] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: () => {
      const clientDropdown = document.querySelector('kat-dropdown[data-test="client"]');
      if (!clientDropdown) return false;
      if (!clientDropdown.getAttribute('value') && !clientDropdown.value) return false;
      const clearBtn = clientDropdown.shadowRoot?.querySelector('button[part="clear-btn"]');
      if (!clearBtn) return false;
      clearBtn.click();
      // Programmatic click clears the DOM but may not dispatch kat-change that Vue watches.
      // Dispatch it manually so Vue's @kat-change handler fires and re-fetches the employee list.
      clientDropdown.dispatchEvent(new CustomEvent('kat-change', {
        bubbles: true,
        composed: true,
        detail: { value: '', id: '' },
      }));
      return true;
    },
  });
  // If we cleared a filter, wait for the API re-fetch to complete and table to re-render
  await new Promise(r => setTimeout(r, hadFilter?.result ? 2000 : 400));

  const rowsReady = await sppPollInTab(tabId, () =>
    !!document.querySelector('kat-table-row[data-test="user"]')
  );
  if (!rowsReady) throw new Error("User table rows did not appear");
  await new Promise(r => setTimeout(r, 500));

  const [openRes] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: (id) => {
      for (const row of document.querySelectorAll('kat-table-row[data-test="user"]')) {
        if (!(row.querySelector('.user-column a')?.getAttribute('href') || '').includes(id)) continue;
        const toggleBtn = row.querySelector('kat-dropdown-button')
          ?.shadowRoot?.querySelector('button[part="dropdown-button-toggle-button"]');
        if (!toggleBtn) return { error: "Toggle button not found in shadow DOM" };
        toggleBtn.click();
        return { ok: true };
      }
      return { error: `Row not found for actorId: ${id}` };
    },
    args: [actorId],
  });
  if (openRes?.result?.error) throw new Error(openRes.result.error);
  await new Promise(r => setTimeout(r, 400));

  const [addRes] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: (id) => {
      for (const row of document.querySelectorAll('kat-table-row[data-test="user"]')) {
        if (!(row.querySelector('.user-column a')?.getAttribute('href') || '').includes(id)) continue;
        const shadow = row.querySelector('kat-dropdown-button')?.shadowRoot;
        if (!shadow) return { error: "kat-dropdown-button shadow not found" };
        // Amazon renamed "Add to client" → "Update Client Access"; try both data-action values,
        // then fall back to button text content.
        const btn = shadow.querySelector('button[data-action="update_client_access"]')
          || shadow.querySelector('button[data-action="add_to_client"]')
          || [...shadow.querySelectorAll('button')].find(b =>
              /update.client.access|add.to.client/i.test(b.textContent));
        if (!btn) return { error: "update_client_access / add_to_client button not found in shadow DOM" };
        if (btn.disabled) return { error: "button is disabled" };
        btn.click();
        return { ok: true };
      }
      return { error: "Row not found for update_client_access click" };
    },
    args: [actorId],
  });
  if (addRes?.result?.error) throw new Error(addRes.result.error);

  // Wait for modal — new UI is flat (no tabs), old UI had kat-tab[data-qa="add-client"].
  // Accept either: tab-based old modal, OR new flat modal with kat-checkbox list visible.
  const modalOk = await sppPollInTab(tabId, () => {
    const modal = document.querySelector('kat-modal');
    if (!modal) return false;
    return !!modal.querySelector('kat-tab[data-qa="add-client"], kat-tab[data-qa="update-client"]')
      || !!modal.querySelector('kat-checkbox')
      || !!modal.querySelector('kat-input');
  }, 300, 8000);
  if (!modalOk) throw new Error("Update-client-access modal did not appear");
  await new Promise(r => setTimeout(r, 400));
}

async function sppApplyRolePermissions(tabId, employeeId, clientId, rolePermissions, sections) {
  console.log(`[SPP perms] START emp=${employeeId} client=${clientId} keys=${Object.keys(rolePermissions || {}).length}`);

  // Navigate to the permissions edit page and force a FULL reload (simulates F5).
  // In-app router.push() leaves a stuck loading spinner — full reload always initializes correctly.
  // Listener must be registered BEFORE calling reload to avoid missing the "complete" event.
  const permUrl = `https://${SPP_DOMAIN}/account/permissions#/edit-user-permissions/${employeeId}/${clientId}`;
  await chrome.tabs.update(tabId, { url: permUrl });
  await new Promise(r => setTimeout(r, 400)); // let hash change settle

  await new Promise(resolve => {
    let sawLoading = false;
    const timer = setTimeout(resolve, 25000);
    const listener = (tid, info) => {
      if (tid !== tabId) return;
      if (info.status === 'loading') { sawLoading = true; return; }
      if (info.status === 'complete' && sawLoading) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer); resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener); // register BEFORE reload
    chrome.tabs.reload(tabId);                    // then trigger reload
  });

  // Extra wait for Vue SPA initialization and initial API call after reload
  await new Promise(r => setTimeout(r, 1500));

  // Wait for Pinia toolCategories — fresh data guaranteed after full reload
  const ready = await sppPollInTab(tabId, () => {
    const root = document.getElementById("global-user-permissions-root");
    const tc = root?.__vue_app__?.config?.globalProperties?.$pinia
      ?.state?.value?.userPermissions?.actorPermissionsData?.data?.toolCategories;
    return Array.isArray(tc) && tc.length > 0;
  }, 500, 30000);
  if (!ready) throw new Error("Stránka oprávnění se nenačetla");

  // Wait for radio buttons to render
  await sppPollInTab(tabId, () => document.querySelectorAll('input[type="radio"]').length > 50, 300, 10000);
  await new Promise(r => setTimeout(r, 800));

  // Apply permissions: match tool rows by display name and click the right radio
  const [applyRes] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: (permissions, sects) => {
      // Build lowercased displayName → "section.item" key map
      const labelToKey = {};
      for (const s of sects) {
        for (const it of s.items) {
          labelToKey[it.label.toLowerCase().trim()] = `${s.id}.${it.id}`;
        }
      }

      let changed = 0;
      const allRows = document.querySelectorAll('[data-qa^="toolRow"]');
      for (const row of allRows) {
        const nameEl = row.querySelector('[data-qa="tool-item-display-name"]');
        if (!nameEl) continue;
        const displayName = (nameEl.textContent || '').trim();
        const key = labelToKey[displayName.toLowerCase()];
        if (!key) continue;

        const desiredLevel = (permissions[key] || 'None').toLowerCase();
        // toolRow is inside kat-col-xs-7 (label column) — go up 2 levels to reach the full row
        // Radio inputs have no data-qa; instead their parent CELL has data-qa="none"/"view"/"edit"/"admin"
        const fullRow = row.parentElement?.parentElement;
        const radioBtn = fullRow?.querySelector(`[data-qa="${desiredLevel}"] input[type="radio"]`);
        if (radioBtn && !radioBtn.checked) {
          radioBtn.click();
          changed++;
        }
      }
      return { changed, totalRows: allRows.length, sampleKey: Object.keys(permissions).slice(0, 3).join(',') };
    },
    args: [rolePermissions, sections],
  });
  console.log(`[SPP perms] ${employeeId}/${clientId}: changed=${applyRes?.result?.changed}/${applyRes?.result?.totalRows} rows`);

  if ((applyRes?.result?.changed ?? 0) === 0) return; // Nothing to save

  await new Promise(r => setTimeout(r, 400));

  // Click Save Changes button
  const [saveRes] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: () => {
      // Find kat-button by label attribute
      const byLabel = document.querySelector('kat-button[label="Save Changes"]');
      const btn = byLabel || [...document.querySelectorAll('kat-button, button')]
        .find(b => (b.getAttribute('label') || b.textContent || '').trim() === 'Save Changes');
      if (!btn) return { error: 'Save Changes button not found' };
      const inner = btn.shadowRoot?.querySelector('button');
      if (inner) inner.click(); else btn.click();
      return { ok: true };
    },
  });
  if (saveRes?.result?.error) throw new Error(`Permissions save: ${saveRes.result.error}`);
  await new Promise(r => setTimeout(r, 2000));
}

async function sppAssignOne(tabId, employee, clients) {
  await sppOpenAddToClientModal(tabId, employee.id);

  const targetNames = new Set(clients.map(c => c.name.trim().toLowerCase()));
  let anyChecked = false;

  // Activate "Add Client" tab if present (old modal has tabs; new flat modal has none).
  await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const modal = document.querySelector('kat-modal');
      const addTab = modal?.querySelector('kat-tab[data-qa="add-client"], kat-tab[data-qa="update-client"]');
      const addTabBtn = addTab?.shadowRoot?.querySelector('[role="tab"]');
      if (addTabBtn) { addTabBtn.click(); await sleep(400); }
    },
  });
  await new Promise(r => setTimeout(r, 500));

  // For each target client: type name in search box, find and click its checkbox
  for (const clientName of targetNames) {
    const [clientRes] = await chrome.scripting.executeScript({
      target: { tabId }, world: "MAIN",
      func: async (name) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const modal = document.querySelector('kat-modal');
        if (!modal) return { error: 'Modal not found' };

        // New modal is flat (no tabs); old modal scoped content to [data-qa="add-client"] tab.
        const tabContent = modal.querySelector('[data-qa="add-client"], [data-qa="update-client"]') || modal;

        // Type client name into search box.
        // Try specific class first, then any kat-input, then plain input[placeholder].
        const searchKatInput = tabContent.querySelector('kat-input.search-input')
          || tabContent.querySelector('kat-input');
        const searchInput = searchKatInput?.shadowRoot?.querySelector('input[part="input"]')
          || searchKatInput?.shadowRoot?.querySelector('input')
          || tabContent.querySelector('input[placeholder]');
        if (!searchInput) {
          return { ok: true, skipped: true, reason: 'no search input — possibly all clients already assigned' };
        }

        searchInput.focus();
        document.execCommand('selectAll', false);
        document.execCommand('delete', false);
        document.execCommand('insertText', false, name);
        // Also dispatch native events so Vue/Katal re-filter the list
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(900); // Wait for live search to filter

        // Find the matching kat-checkbox.
        // New modal: checkboxes are direct children of modal body, not scoped to .clients-list.
        let clientsList = tabContent.querySelector('.clients-list') || tabContent;
        let katCheckboxes = [...clientsList.querySelectorAll('kat-checkbox')];
        // Wait up to 1.5s more if list not yet rendered
        for (let w = 0; w < 8 && !katCheckboxes.length; w++) {
          await sleep(200);
          clientsList = tabContent.querySelector('.clients-list') || tabContent;
          katCheckboxes = [...clientsList.querySelectorAll('kat-checkbox')];
        }

        for (const katCb of katCheckboxes) {
          const labelName = (katCb.getAttribute('label') || '').toLowerCase().trim();
          if (labelName !== name && !labelName.includes(name) && !name.includes(labelName)) continue;

          const checkDiv = katCb.shadowRoot?.querySelector('[role="checkbox"]');
          const isDisabled = checkDiv
            ? checkDiv.getAttribute('aria-disabled') === 'true'
            : katCb.hasAttribute('disabled');
          if (isDisabled) return { ok: true, skipped: true, reason: 'already assigned' };

          const isChecked = checkDiv
            ? checkDiv.getAttribute('aria-checked') === 'true'
            : false;
          if (isChecked) return { ok: true, skipped: true, reason: 'already checked' };

          if (checkDiv) { checkDiv.click(); } else { katCb.click(); }
          await sleep(300);
          return { ok: true, checked: 1 };
        }

        return { ok: true, checked: 0, debug: `no match for "${name}", found ${katCheckboxes.length} checkboxes` };
      },
      args: [clientName],
    });

    if (clientRes?.result?.error) throw new Error(clientRes.result.error);
    console.log(`[SPP assign] client "${clientName}":`, JSON.stringify(clientRes?.result));
    if (clientRes?.result?.checked > 0) anyChecked = true;
    await new Promise(r => setTimeout(r, 300));
  }

  // Wait for Vue to enable the Save button after checkbox changes
  await new Promise(r => setTimeout(r, 800));

  // Click "Save Changes"
  const [saveRes] = await chrome.scripting.executeScript({
    target: { tabId }, world: "MAIN",
    func: async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const modal = document.querySelector('kat-modal');
      if (!modal) return { ok: true, skipped: true };

      const closeModal = () => {
        // Try Cancel button first, then kat-modal close button
        const cancelBtn = [...modal.querySelectorAll('kat-button')]
          .find(b => (b.getAttribute('label') || '').toLowerCase() === 'cancel');
        const inner = cancelBtn?.shadowRoot?.querySelector('button');
        if (inner) inner.click();
        else if (cancelBtn) cancelBtn.click();
        else modal.querySelector('[part="close-button"], button[aria-label*="close" i]')?.click();
      };

      // Try old data-qa first, then new data-qa, then fall back to button label text.
      const saveBtn = modal.querySelector('kat-button[data-qa="add-client-save"]')
        || modal.querySelector('kat-button[data-qa="save-changes"]')
        || [...modal.querySelectorAll('kat-button')].find(b =>
            /save.changes|save/i.test(b.getAttribute('label') || b.textContent));
      if (!saveBtn) { closeModal(); return { ok: true, skipped: true }; }

      const saveBtnInner = saveBtn.shadowRoot?.querySelector('button');
      const isDisabled = saveBtn.hasAttribute('disabled')
        || saveBtn.getAttribute('disabled') === ''
        || saveBtnInner?.disabled === true
        || saveBtnInner?.getAttribute('aria-disabled') === 'true';
      if (isDisabled) { closeModal(); return { ok: true, skipped: true }; }

      if (saveBtnInner) { saveBtnInner.click(); } else { saveBtn.click(); }
      await sleep(200);
      return { ok: true };
    },
  });
  if (saveRes?.result?.error) throw new Error(`Save: ${saveRes.result.error}`);
  const saved = !saveRes?.result?.skipped;
  if (saved) await new Promise(r => setTimeout(r, 1500));
  return { saved, checked: anyChecked };
}
