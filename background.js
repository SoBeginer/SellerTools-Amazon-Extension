const TASK_CONFIG = {
  draftScraping: {
    pageType: "drafts",
    relativePath: "/myinventory/inventory/views/drafts?page=1&pageSize=250&sort=last_updated&subview=submitted-missing-info",
    scriptFile: "scraper.js"
  },
  violationsExport: {
    relativePath: "/performance/account/health/product-policies?t=intel",
    scriptFile: "violations.js"
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
const SHIPPING_TEMPLATES_PATH = "/sbr#shipping_templates";
const DRAFT_PARALLEL_TAB_COUNT = 1;
const SELLER_CENTRAL_URL_PATTERNS = [
  "https://sellercentral.amazon.ae/*",
  "https://sellercentral.amazon.ca/*",
  "https://sellercentral.amazon.co.jp/*",
  "https://sellercentral.amazon.co.uk/*",
  "https://sellercentral.amazon.com.au/*",
  "https://sellercentral.amazon.com.br/*",
  "https://sellercentral.amazon.com.mx/*",
  "https://sellercentral.amazon.com.tr/*",
  "https://sellercentral.amazon.com/*",
  "https://sellercentral.amazon.de/*",
  "https://sellercentral.amazon.eg/*",
  "https://sellercentral.amazon.es/*",
  "https://sellercentral.amazon.fr/*",
  "https://sellercentral.amazon.in/*",
  "https://sellercentral.amazon.it/*",
  "https://sellercentral.amazon.nl/*",
  "https://sellercentral.amazon.pl/*",
  "https://sellercentral.amazon.sa/*",
  "https://sellercentral.amazon.se/*",
  "https://sellercentral.amazon.sg/*"
];

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
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
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
  const createdTab = await chrome.tabs.create({
    url: targetUrl,
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
    violationStage: taskType === "violationsExport" ? "collectPolicy" : null,
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
        await startTask("violationsExport");
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message || "Failed to start violations export." });
      }
    })();

    return true;
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
    const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

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
      asinSkuMap: taskState.asinSkuMap
    });
  }

  if (message?.type === "VIOLATIONS_POLICY_COLLECTED") {
    (async () => {
      const tabId = sender.tab?.id;
      const taskState = typeof tabId === "number" ? taskStateByTabId.get(tabId) : null;

      if (!taskState || taskState.taskType !== "violationsExport") {
        return;
      }

      taskState.violations = Array.isArray(message.violations) ? message.violations : [];
      taskState.uniqueAsins = [...new Set(taskState.violations.map((item) => item.asin).filter(Boolean))];

      if (taskState.uniqueAsins.length === 0) {
        clearTask(tabId);
        return;
      }

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

      taskState.asinOrderCount[message.asin] = message.orderCount ?? "N/A";
      taskState.asinIndex += 1;

      if (taskState.asinIndex < taskState.uniqueAsins.length) {
        await chrome.tabs.update(tabId, {
          url: getOrderSearchUrl(taskState.origin, taskState.uniqueAsins[taskState.asinIndex])
        });
        return;
      }

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

      taskState.asinSkuMap[message.asin] = message.sku ?? "N/A";
      taskState.asinIndex += 1;

      if (taskState.asinIndex < taskState.uniqueAsins.length) {
        await chrome.tabs.update(tabId, {
          url: getInventoryUrl(taskState.origin, taskState.uniqueAsins[taskState.asinIndex])
        });
        return;
      }

      taskState.violationStage = "downloadFiles";
      await runViolationsScript(tabId);
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
    if (typeof tabId === "number") clearTask(tabId);
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
        const { months, years, docType = "all", downloadMode = "zip" } = message;
        const params = { months, years, docType, downloadMode };
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
    if (typeof tabId === "number") clearTask(tabId);
  }

  if (message?.type === "LIST_SHIPPING_TEMPLATES") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ success: false, error: "No active tab." }); return; }

        // Derive SC origin from current tab or fall back to .de
        let origin = "https://sellercentral.amazon.de";
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) origin = u.origin;
        } catch (_) {}

        const listUrl = origin + SHIPPING_TEMPLATES_PATH;

        await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: null });
        taskStateByTabId.set(tab.id, { taskType: "listShippingTemplates", tabId: tab.id });
        await chrome.tabs.update(tab.id, { url: listUrl });

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

        let origin = DEFAULT_SELLER_CENTRAL_ORIGIN;
        try {
          const u = new URL(tab.url || "");
          if (u.hostname.includes("sellercentral.amazon")) origin = u.origin;
        } catch (_) {}

        const queue = {
          config,
          templates,
          currentIndex: 0,
          totalChanged: 0,
          errors: [],
          origin,
        };

        await chrome.storage.local.set({
          [PRICE_CHANGE_QUEUE_KEY]: queue,
          [PRICE_CHANGE_PROGRESS_KEY]: {
            active: true,
            current: 0,
            total: templates.length,
            totalChanged: 0,
            label: templates[0]?.name || "",
            error: "",
          },
        });

        // Navigate to the template list page — onUpdated will inject the script
        // and call __selectAndApplyForTemplate for each template in sequence.
        taskStateByTabId.set(tab.id, { taskType: "priceChange", phase: "selectEdit", tabId: tab.id });
        await chrome.tabs.update(tab.id, { url: origin + SHIPPING_TEMPLATES_PATH });

        sendResponse({ success: true });
      } catch (error) {
        console.error("[BG] PRICE_CHANGE_START error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

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
    try {
      await runViolationsScript(tabId);
    } catch (error) {
      console.error("Failed to inject violations.js", error);
      clearTask(tabId);
    }

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

  if (taskState.taskType === "listShippingTemplates") {
    if (tab.url?.includes("/sbr")) {
      (async () => {
        try {
          await injectShippingPriceChanger(tabId);
          const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.__listShippingTemplates(),
          });
          const templates = result?.result || [];
          console.log(`[BG] listShippingTemplates: found ${templates.length} template(s).`);
          await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: templates });
        } catch (error) {
          console.error("[BG] listShippingTemplates error:", error);
          await chrome.storage.local.set({ [SHIPPING_TEMPLATE_LIST_KEY]: [] });
        } finally {
          clearTask(tabId);
        }
      })();
    }
    return;
  }

  if (taskState.taskType === "priceChange") {
    (async () => {
      let queue;
      try {
        const stored = await chrome.storage.local.get(PRICE_CHANGE_QUEUE_KEY);
        queue = stored[PRICE_CHANGE_QUEUE_KEY];
        if (!queue) { clearTask(tabId); return; }

        const template = queue.templates[queue.currentIndex];
        if (!template) { clearTask(tabId); return; }

        const origin = queue.origin || DEFAULT_SELLER_CENTRAL_ORIGIN;
        const listUrl = origin + SHIPPING_TEMPLATES_PATH;
        const phase = taskState.phase || "selectEdit";

        await injectShippingPriceChanger(tabId);

        let r;

        if (phase === "selectEdit") {
          console.log(`[BG] priceChange: selecting "${template.name}" (${queue.currentIndex + 1}/${queue.templates.length})`);

          // ── Step 1: click template in sidebar (sets SPA state) ──────────
          let selectResult;
          try {
            const [s] = await chrome.scripting.executeScript({
              target: { tabId },
              func: (name) => window.__selectTemplateInSidebar(name),
              args: [template.name],
            });
            selectResult = s?.result;
          } catch (err) {
            console.error(`[BG] priceChange: __selectTemplateInSidebar threw:`, err);
            selectResult = { selected: false, error: err.message };
          }

          if (!selectResult?.selected) {
            r = { success: false, error: selectResult?.error || "Sidebar selection failed.", changed: 0 };
          } else {
            // ── Step 2: open the actions dropdown (async — needs a wait) ─────
            // Amazon's dropdown items are in the DOM but hidden; click trigger to reveal.
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  const trigger = document.querySelector(
                    ".a-button-dropdown .a-dropdown-trigger, " +
                    "button.a-dropdown-trigger, " +
                    "[data-action='a-dropdown-button'], " +
                    ".a-button-dropdown button"
                  );
                  if (trigger) {
                    console.log("[SBREdit] Opening actions dropdown…");
                    trigger.click();
                  }
                },
              });
            } catch (err) {
              console.warn("[BG] priceChange: dropdown trigger failed:", err.message);
            }

            // Wait for dropdown animation / DOM update
            await new Promise((res) => setTimeout(res, 500));

            // ── Step 3: read Edit element href from now-visible dropdown ─────
            let editUrl = null;
            try {
              const [hrefRes] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  const sidebar = document.querySelector("#sbrui_element_shippingTemplateLinks");

                  // 1) Check <li id="edit"> for a nested anchor with a real href
                  const editLi = document.getElementById("edit");
                  if (editLi) {
                    const a = editLi.querySelector("a[href]");
                    const href = a?.href || a?.getAttribute("href");
                    if (href && !href.endsWith("#") && !href.startsWith("javascript") && href.includes("/sbr")) {
                      console.log("[SBREdit] Found Edit href in #edit li:", href);
                      return href;
                    }
                  }

                  // 2) Scan all visible anchors whose text is "Edit" / "Bearbeiten"
                  for (const el of document.querySelectorAll("a[href]")) {
                    const t = (el.textContent || el.getAttribute("aria-label") || "").trim();
                    if ((t === "Edit" || t === "Bearbeiten") && el.offsetParent !== null && !sidebar?.contains(el)) {
                      const href = el.href;
                      if (href && !href.endsWith("#") && !href.startsWith("javascript") && href.includes("/sbr")) {
                        console.log("[SBREdit] Found Edit href by text scan:", href);
                        return href;
                      }
                    }
                  }

                  console.log("[SBREdit] No Edit href found — will click element.");
                  return null;
                },
              });
              editUrl = hrefRes?.result || null;
            } catch (err) {
              console.warn("[BG] priceChange: Edit href read failed:", err.message);
            }

            if (editUrl) {
              console.log(`[BG] priceChange: navigating to Edit href for "${template.name}": ${editUrl}`);
              taskStateByTabId.set(tabId, { taskType: "priceChange", phase: "applyChange", tabId });
              await chrome.storage.local.set({ [PRICE_CHANGE_QUEUE_KEY]: queue });
              await chrome.tabs.update(tabId, { url: editUrl });
              return;
            }

            // ── Step 4: no href — click Edit element and catch navigation ────
            console.log(`[BG] priceChange: clicking Edit element for "${template.name}".`);
            try {
              const [execResult] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                  // Click the Edit element that's already visible from Step 2
                  const editLi = document.getElementById("edit");
                  const editEl = editLi?.querySelector("a") || editLi
                    || [...document.querySelectorAll("a, button, li")].find((el) => {
                        const t = el.textContent.trim();
                        return (t === "Edit" || t === "Bearbeiten") && el.offsetParent !== null;
                      });
                  if (!editEl) return { clicked: false };
                  console.log("[SBREdit] Clicking Edit element:", editEl.tagName, editEl.id);
                  editEl.click();
                  return { clicked: true };
                },
              });
              // If click caused navigation, this executeScript result is irrelevant —
              // the navErr catch below handles it. If it stayed in SPA, apply price change.
              if (execResult?.result?.clicked) {
                await new Promise((res) => setTimeout(res, 800));
                const [applyResult] = await chrome.scripting.executeScript({
                  target: { tabId },
                  func: (cfg) => window.__applyPriceChange(cfg),
                  args: [queue.config],
                });
                r = applyResult?.result || { success: false, error: "No result from applyPriceChange", changed: 0 };
              } else {
                r = { success: false, error: "Edit element not found in dropdown.", changed: 0 };
              }
            } catch (navErr) {
              console.log(`[BG] priceChange: full-page navigation for "${template.name}" — waiting for edit page.`);
              taskStateByTabId.set(tabId, { taskType: "priceChange", phase: "applyChange", tabId });
              await chrome.storage.local.set({ [PRICE_CHANGE_QUEUE_KEY]: queue });
              return;
            }
          }
        } else {
          // phase === "applyChange": we're on the edit page after full-page navigation.
          console.log(`[BG] priceChange: applying on edit page for "${template.name}" — url: ${tab.url}`);
          try {
            const [execResult] = await chrome.scripting.executeScript({
              target: { tabId },
              func: (cfg) => window.__applyPriceChange(cfg),
              args: [queue.config],
            });
            r = execResult?.result || { success: false, error: "applyPriceChange returned null — script not injected?", changed: 0 };
          } catch (err) {
            console.warn(`[BG] priceChange: applyPriceChange executeScript threw: ${err.message}`);
            r = { success: false, error: `Script error: ${err.message}`, changed: 0 };
          }
        }

        if (r.success) {
          queue.totalChanged += r.changed || 0;
          console.log(`[BG] priceChange: ✓ ${r.changed} price(s) changed in "${template.name}"`);
        } else {
          console.warn(`[BG] priceChange: ✗ "${template.name}": ${r.error}`);
          queue.errors.push({ template: template.name, error: r.error || "Unknown error" });
        }

        queue.currentIndex++;
        const hasMore = queue.currentIndex < queue.templates.length;
        const nextTemplate = queue.templates[queue.currentIndex];

        await chrome.storage.local.set({
          [PRICE_CHANGE_PROGRESS_KEY]: {
            active: hasMore,
            current: queue.currentIndex,
            total: queue.templates.length,
            totalChanged: queue.totalChanged,
            label: nextTemplate?.name || "",
            error: queue.errors.map((e) => `${e.template}: ${e.error}`).join("; "),
          },
        });

        if (hasMore) {
          await chrome.storage.local.set({ [PRICE_CHANGE_QUEUE_KEY]: queue });
          // Navigate back to list page for the next template
          taskStateByTabId.set(tabId, { taskType: "priceChange", phase: "selectEdit", tabId });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await chrome.tabs.update(tabId, { url: listUrl });
        } else {
          await chrome.storage.local.remove(PRICE_CHANGE_QUEUE_KEY);
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
