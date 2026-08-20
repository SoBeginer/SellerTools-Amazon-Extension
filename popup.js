(() => {
  const statusElement = document.getElementById("status");
  const toolsView = document.getElementById("toolsView");
  const bookmarksView = document.getElementById("bookmarksView");
  const toolsViewButton = document.getElementById("toolsViewButton");
  const bookmarksViewButton = document.getElementById("bookmarksViewButton");
  const dryRunToggle = document.getElementById("dryRunToggle");
  const draftSectionToggle = document.getElementById("draftSectionToggle");
  const draftSectionBody = document.getElementById("draftSectionBody");
  const draftEmailSelect = document.getElementById("draftEmailSelect");
  const draftSkuLimitInput = document.getElementById("draftSkuLimitInput");
  const draftScheduleIntervalInput = document.getElementById("draftScheduleIntervalInput");
  const draftScheduleSaveButton = document.getElementById("draftScheduleSaveButton");
  const draftScheduleDisableButton = document.getElementById("draftScheduleDisableButton");
  const draftScheduleStatus = document.getElementById("draftScheduleStatus");
  const draftCollectionStatus = document.getElementById("draftCollectionStatus");
  const draftCollectionCount = document.getElementById("draftCollectionCount");
  const draftCollectionToggle = document.getElementById("draftCollectionToggle");
  const draftCsvModeToggle = document.getElementById("draftCsvModeToggle");
  const draftModeLabel = document.getElementById("draftModeLabel");
  const draftProgressContainer = document.getElementById("draftProgressContainer");
  const draftProgressFill = document.getElementById("draftProgressFill");
  const draftProgressText = document.getElementById("draftProgressText");
  const draftCollectionExportButton = document.getElementById("draftCollectionExportButton");
  const draftCollectionResetButton = document.getElementById("draftCollectionResetButton");
  const draftScrapingNoRetoolButton = document.getElementById("draftScrapingNoRetoolButton");
  const draftStopButton = document.getElementById("draftStopButton");
  const ibaSectionToggle = document.getElementById("ibaSectionToggle");
  const ibaSectionBody = document.getElementById("ibaSectionBody");
  const ibaAutomationButton = document.getElementById("ibaAutomationButton");
  const marketSectionToggle = document.getElementById("marketSectionToggle");
  const marketSectionBody = document.getElementById("marketSectionBody");
  const marketCurrentLabel = document.getElementById("marketCurrentLabel");
  const marketRefreshButton = document.getElementById("marketRefreshButton");
  const marketRunPricingButton = document.getElementById("marketRunPricingButton");
  const marketPickerSelect = document.getElementById("marketPickerSelect");
  const marketSwitchButton = document.getElementById("marketSwitchButton");
  const marketList = document.getElementById("marketList");
  const marketSearchInput = document.getElementById("marketSearchInput");
  const marketSelectionCountBadge = document.getElementById("marketSelectionCount");
  const accountSectionToggle = document.getElementById("accountSectionToggle");
  const accountSectionBody = document.getElementById("accountSectionBody");
  const accountCurrentLabel = document.getElementById("accountCurrentLabel");
  const accountSwitchingIndicator = document.getElementById("accountSwitchingIndicator");
  const accountSwitchingText = document.getElementById("accountSwitchingText");
  const accountSelectorTree = document.getElementById("accountSelectorTree");
  const accountRefreshButton = document.getElementById("accountRefreshButton");
  const notScPanel = document.getElementById("notScPanel");
  const toolsPanel = document.getElementById("toolsPanel");
  const violationsSectionToggle = document.getElementById("violationsSectionToggle");
  const violationsSectionBody = document.getElementById("violationsSectionBody");
  const notifPrefsSectionToggle = document.getElementById("notifPrefsSectionToggle");
  const notifPrefsSectionBody = document.getElementById("notifPrefsSectionBody");
  const violationsScheduleSaveButton = document.getElementById("violationsScheduleSaveButton");
  const violationsScheduleStatus = document.getElementById("violationsScheduleStatus");
  const pricingFixMinMaxCheck = document.getElementById("pricingFixMinMaxCheck");
  const pricingFixB2BCheck = document.getElementById("pricingFixB2BCheck");
  const pricingFixRunButton = document.getElementById("pricingFixRunButton");
  const shippingTemplateSectionToggle = document.getElementById("shippingTemplateSectionToggle");
  const shippingTemplateSectionBody = document.getElementById("shippingTemplateSectionBody");
  const shippingTemplateStatus = document.getElementById("shippingTemplateStatus");
  const stTemplateName = document.getElementById("stTemplateName");
  const stDownloadCsvTemplate = document.getElementById("stDownloadCsvTemplate");
  const stUploadCsvBtn = document.getElementById("stUploadCsvBtn");
  const stCsvUpload = document.getElementById("stCsvUpload");
  const stCsvStatus = document.getElementById("stCsvStatus");
  const stExpeditedEnabled = document.getElementById("stExpeditedEnabled");
  const stExpeditedOptions = document.getElementById("stExpeditedOptions");
  const stExpeditedMarkup = document.getElementById("stExpeditedMarkup");
  const stExpeditedDomTransit = document.getElementById("stExpeditedDomTransit");
  const stExpeditedIntlTransit = document.getElementById("stExpeditedIntlTransit");
  const stTwoDayEnabled = document.getElementById("stTwoDayEnabled");
  const stTwoDayOptions = document.getElementById("stTwoDayOptions");
  const stTwoDayPrice = document.getElementById("stTwoDayPrice");
  const stOneDayEnabled = document.getElementById("stOneDayEnabled");
  const stOneDayOptions = document.getElementById("stOneDayOptions");
  const stOneDayPrice = document.getElementById("stOneDayPrice");
  const stGenerateButton = document.getElementById("stGenerateButton");
  const stCreateButton = document.getElementById("stCreateButton");
  const violationsStopButton = document.getElementById("violationsStopButton");
  const vatReportSectionToggle = document.getElementById("vatReportSectionToggle");
  const vatReportSectionBody = document.getElementById("vatReportSectionBody");
  const vatSummary = document.getElementById("vatReportSummary");
  const vatReportStatus = document.getElementById("vatReportStatus");
  const vatReportDownloadButton = document.getElementById("vatReportDownloadButton");
  const invoiceSectionToggle  = document.getElementById("invoiceSectionToggle");
  const invoiceSectionBody    = document.getElementById("invoiceSectionBody");
  const invoiceStatusEl       = document.getElementById("invoiceStatus");
  const invoiceDownloadButton = document.getElementById("invoiceDownloadButton");
  const shippingPriceChangeSectionToggle = document.getElementById("shippingPriceChangeSectionToggle");
  const shippingPriceChangeSectionBody   = document.getElementById("shippingPriceChangeSectionBody");
  const spcLoadTemplatesBtn  = document.getElementById("spcLoadTemplatesBtn");
  const spcTemplateListEl    = document.getElementById("spcTemplateList");
  const spcApplyButton       = document.getElementById("spcApplyButton");
  const spcStatusDiv         = document.getElementById("spcStatus");
  const spcStatusLabel       = document.getElementById("spcStatusLabel");
  const ibaStartUrl = "https://sellercentral.amazon.de/orders-v3/mfn/unshipped?orderType=IBA&orderStatus=unshipped&fulfillmentType=mfn&page=1&date-range=last-30&_ibaStart=1";
  const pricingFixerUrl = "https://sellercentral.amazon.de/myinventory/inventory?fulfilledBy=all&page=1&pageSize=250&sort=sales_desc&status=pricing_issue&_pricingFixerStart=1";
  const b2bFixerUrl = "https://sellercentral.amazon.de/myinventory/inventory?fulfilledBy=all&page=1&pageSize=250&sort=sales_desc&status=pricing_issue&ref_=xx_invmgr_favb_xx&_b2bFixerStart=1";
  const dryRunStorageKey = "seller_extension_dry_run_v1";
  const draftCsvModeKey = "seller_extension_draft_csv_mode_v1";
  const draftProgressKey = "seller_extension_draft_progress_v1";
  const vatReportProgressKey = "seller_extension_vat_report_progress_v1";
  const marketCacheKey = "seller_extension_market_cache_v2";
  const marketSelectionKey = "seller_extension_market_selection_v1";
  const marketCacheTtlMs = 30 * 60 * 1000;


  function setStatus(message) {
    statusElement.textContent = message;
  }

  function setDraftScheduleStatus(message) {
    draftScheduleStatus.textContent = message;
  }

  function setDraftCollectionState(state) {
    const active = state?.sessionActive === true;
    draftCollectionStatus.textContent = active ? "Active" : "Inactive";
    const pairsCount = Array.isArray(state?.skuMarketPairs) ? state.skuMarketPairs.length : 0;
    const skusCount = Array.isArray(state?.uniqueSkus) ? state.uniqueSkus.length : 0;
    draftCollectionCount.textContent = String(pairsCount || skusCount);
    draftCollectionToggle.checked = active;
  }

  function setDryRunStatus(enabled) {
    dryRunToggle.checked = enabled;
  }

  function setActiveView(viewName) {
    const showingBookmarks = viewName === "bookmarks";
    toolsView.classList.toggle("is-active", !showingBookmarks);
    bookmarksView.classList.toggle("is-active", showingBookmarks);
    toolsViewButton.classList.toggle("is-active", !showingBookmarks);
    bookmarksViewButton.classList.toggle("is-active", showingBookmarks);
  }

  function setSectionExpanded(toggleElement, bodyElement, expanded) {
    toggleElement.setAttribute("aria-expanded", String(expanded));
    bodyElement.hidden = !expanded;
  }

  function parseYearMonthInput(value) {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
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

  function getCoveredMonthsForRange(startValue, endValue) {
    const start = parseYearMonthInput(startValue);
    const end = parseYearMonthInput(endValue);

    if (!start || !end) {
      return [];
    }

    if (start.getTime() > end.getTime()) {
      return [];
    }

    const covered = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor.getTime() <= last.getTime()) {
      covered.push({
        year: cursor.getFullYear(),
        month: cursor.getMonth() + 1
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return covered;
  }

  function formatYearMonthLabel(year, month) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function renderVatReportSummary(message, isError = false) {
    if (!vatReportSummary) return;
    if (!message) {
      vatReportSummary.style.display = "none";
      vatReportSummary.textContent = "";
      vatReportSummary.style.background = "#f3f4f6";
      vatReportSummary.style.color = "";
      return;
    }

    vatReportSummary.style.display = "block";
    vatReportSummary.style.background = isError ? "#fee2e2" : "#f3f4f6";
    vatReportSummary.style.color = isError ? "#dc2626" : "";
    vatReportSummary.textContent = message;
  }

  function renderVatReportStatus(progress) {
    if (!vatReportStatus) return;
    const label = document.getElementById("vatReportStatusLabel");

    if (!progress || typeof progress !== "object" || !progress.active) {
      vatReportStatus.style.display = "none";
      return;
    }

    const phase = progress.phase || "";
    const phaseWords = {
      submitting:  "Requesting",
      waiting:     "Processing",
      downloading: "Downloading",
      zipping:     "Zipping",
      error:       "Error",
    };
    const word = phaseWords[phase];
    if (!word) { vatReportStatus.style.display = "none"; return; }

    vatReportStatus.style.display = "flex";
    if (label) { label.textContent = word; label.style.color = phase === "error" ? "#EF4444" : "#6B7280"; }
  }

  function updateVatReportInputsSummary() {
    if (!vatReportStartMonthInput || !vatReportEndMonthInput) return;

    const startValue = vatReportStartMonthInput.value;
    const endValue = vatReportEndMonthInput.value;

    if (!startValue && !endValue) {
      renderVatReportSummary("");
      return;
    }

    if (!startValue || !endValue) {
      renderVatReportSummary("Select both start month and end month.", true);
      return;
    }

    const startDate = parseYearMonthInput(startValue);
    const endDate = parseYearMonthInput(endValue);
    if (!startDate || !endDate) {
      renderVatReportSummary("Month format is invalid.", true);
      return;
    }

    if (startDate.getTime() > endDate.getTime()) {
      renderVatReportSummary("Start date must be earlier than or equal to end date.", true);
      return;
    }

    const coveredMonths = getCoveredMonthsForRange(startValue, endValue);
    if (coveredMonths.length === 0) {
      renderVatReportSummary("Selected range does not contain any month.", true);
      return;
    }

    const monthLabels = coveredMonths.map(({ year, month }) => formatYearMonthLabel(year, month));
    renderVatReportSummary(`Months to download: ${coveredMonths.length} (${monthLabels.join(", ")})`);
  }

  async function loadVatReportProgress() {
    try {
      const result = await chrome.storage.local.get(vatReportProgressKey);
      renderVatReportStatus(result[vatReportProgressKey] || null);
    } catch {
      renderVatReportStatus(null);
    }
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function canInjectIntoTab(url) {
    return typeof url === "string" && (
      /^https:\/\/sellercentral(?:-europe)?\.amazon\./.test(url) ||
      /^https:\/\/solutionproviderportal\.amazon\.com\//.test(url) ||
      /^https:\/\/expandoadmin\.retool\.com\//.test(url)
    );
  }

  async function sendMessageToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  }

  async function ensureContentScriptAndSend(tab, message) {
    try {
      return await sendMessageToTab(tab.id, message);
    } catch (error) {
      if (!canInjectIntoTab(tab.url) || !String(error?.message || "").includes("Receiving end does not exist")) {
        throw error;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });

      return sendMessageToTab(tab.id, message);
    }
  }

  function formatScheduleMessage(config) {
    if (!config?.enabled || !config?.time) {
      return "Daily start is disabled.";
    }

    const nextRun = config.nextRun ? new Date(config.nextRun) : null;
    const nextRunText = nextRun && !Number.isNaN(nextRun.getTime())
      ? nextRun.toLocaleString()
      : "pending";
    return `Daily start is enabled for ${config.time}. Next run: ${nextRunText}.`;
  }

  function formatDraftScheduleMessage(config) {
    if (!config?.enabled || !config?.intervalMinutes) {
      return "Manual only";
    }

    const nextRun = config.nextRun ? new Date(config.nextRun) : null;
    const nextRunText = nextRun && !Number.isNaN(nextRun.getTime())
      ? nextRun.toLocaleString()
      : "pending";
    const emailText = config.selectedEmail ? ` for ${config.selectedEmail}` : "";
    return `Every ${config.intervalMinutes} min${emailText}. Next run: ${nextRunText}.`;
  }

  async function loadDraftSchedule() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_DRAFT_SCHEDULE" });

      if (!response?.success) {
        setDraftScheduleStatus("Unable to load schedule.");
        return;
      }

      draftScheduleIntervalInput.value = String(response.config?.intervalMinutes || 30);

      if (response.config?.selectedEmail) {
        draftEmailSelect.value = response.config.selectedEmail;
      }

      setDraftScheduleStatus(formatDraftScheduleMessage(response.config));
    } catch (error) {
      setDraftScheduleStatus(error.message || "Unable to load schedule.");
    }
  }

  async function loadDraftCollectionState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_DRAFT_COLLECTION_STATE" });

      if (!response?.success) {
        setDraftCollectionState(null);
        return;
      }

      setDraftCollectionState(response.state);
    } catch {
      setDraftCollectionState(null);
    }
  }

  function downloadShippingLog(logText, status) {
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`
                  + `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fname = `ShippingTemplate_${status}_${stamp}.log`;
      const blob = new Blob([logText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Log download failed:", e);
    }
  }

  function downloadCsv(filename, contents) {
    const blob = new Blob([contents], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadDryRunSetting() {
    try {
      const result = await chrome.storage.sync.get(dryRunStorageKey);
      setDryRunStatus(result[dryRunStorageKey] === true);
    } catch (error) {
      setStatus(error.message || "Unable to load dry run setting.");
    }
  }

  function isPendingMarket(r) {
    return /pending/i.test(r?.label || "");
  }

  const DOMAIN_REGION_MAP = {
    // Standardní domény
    "sellercentral.amazon.de": "Europe",
    "sellercentral.amazon.fr": "Europe",
    "sellercentral.amazon.it": "Europe",
    "sellercentral.amazon.es": "Europe",
    "sellercentral.amazon.co.uk": "Europe",
    "sellercentral.amazon.nl": "Europe",
    "sellercentral.amazon.pl": "Europe",
    "sellercentral.amazon.se": "Europe",
    "sellercentral.amazon.com.be": "Europe",
    "sellercentral.amazon.com.tr": "Europe",
    "sellercentral.amazon.com": "North America",
    "sellercentral.amazon.ca": "North America",
    "sellercentral.amazon.com.mx": "North America",
    "sellercentral.amazon.co.jp": "Asia Pacific",
    "sellercentral.amazon.com.au": "Asia Pacific",
    "sellercentral.amazon.sg": "Asia Pacific",
    "sellercentral.amazon.in": "Asia Pacific",
    "sellercentral.amazon.ae": "Middle East & Africa",
    "sellercentral.amazon.com.sa": "Middle East & Africa",
    "sellercentral.amazon.eg": "Middle East & Africa",
    // Alternativní formáty domén (unified endpoint)
    "sellercentral-europe.amazon.com": "Europe",
    "sellercentral-japan.amazon.com": "Asia Pacific",
    "sellercentral-na.amazon.com": "North America",
    "sellercentral-fe.amazon.com": "Asia Pacific",
  };

  const MKID_REGION_MAP = {
    "amzn1.mp.o.A28R8C7NBKEWEA": "Europe",
    "amzn1.mp.o.AMEN7PMS3EDWL": "Europe",
  };

  // Fallback podle názvu země (když doména nesedí nebo chybí)
  const LABEL_REGION_MAP = {
    "germany": "Europe", "france": "Europe", "italy": "Europe", "spain": "Europe",
    "united kingdom": "Europe", "netherlands": "Europe", "poland": "Europe",
    "sweden": "Europe", "belgium": "Europe", "ireland": "Europe", "turkey": "Europe",
    "czechia": "Europe", "czech republic": "Europe", "austria": "Europe",
    "united states": "North America", "canada": "North America", "mexico": "North America",
    "japan": "Asia Pacific", "australia": "Asia Pacific", "singapore": "Asia Pacific", "india": "Asia Pacific",
    "uae": "Middle East & Africa", "united arab emirates": "Middle East & Africa",
    "saudi arabia": "Middle East & Africa", "egypt": "Middle East & Africa",
  };

  const REGION_ORDER = ["Europe", "North America", "Asia Pacific", "Middle East & Africa", "Other"];

  function getMarketRegion(r) {
    const domain = r?.domain || "";
    const mkid = r?.ids?.mons_sel_mkid || "";
    const label = (r?.label || "").toLowerCase().trim();
    return DOMAIN_REGION_MAP[domain] || MKID_REGION_MAP[mkid] || LABEL_REGION_MAP[label] || "Other";
  }

  function groupByRegion(markets) {
    const groups = {};
    markets.forEach((r) => {
      const region = getMarketRegion(r);
      if (!groups[region]) groups[region] = [];
      groups[region].push(r);
    });
    return REGION_ORDER.filter((region) => groups[region]?.length > 0).map((region) => ({ region, markets: groups[region] }));
  }

  function updateMarketSelectionCount(sel) {
    if (!marketSelectionCountBadge) return;
    const count = Object.values(sel).filter(Boolean).length;
    marketSelectionCountBadge.textContent = count;
    marketSelectionCountBadge.style.display = count > 0 ? "" : "none";
  }

  function updateGroupHighlight(groupEl, sel) {
    const nameSpan = groupEl.querySelector(".seller-group-name-label");
    if (!nameSpan) return;
    const hasChecked = [...groupEl.querySelectorAll("[data-market-key]")].some(
      (el) => sel[el.getAttribute("data-market-key")] === true
    );
    nameSpan.style.color = hasChecked ? "#1d4ed8" : "";
  }

  function updateAllGroupHighlights(sel) {
    marketList?.querySelectorAll("[data-seller-group]").forEach((groupEl) => updateGroupHighlight(groupEl, sel));
  }

  function renderRegionSubgroup(region, markets, activeRegional, tabId, selection) {
    const regionEl = document.createElement("div");
    regionEl.setAttribute("data-region-group", region.toLowerCase());

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 10px 3px;background:#f9fafb;border-top:1px solid #e5e7eb;cursor:pointer;user-select:none;";

    const allKeys = markets.map(marketKey);
    const allChecked = allKeys.every((k) => selection[k] === true);
    const someChecked = allKeys.some((k) => selection[k] === true);
    const hasActive = markets.some((r) => isMarketActive(r, activeRegional));

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = allChecked;
    cb.indeterminate = !allChecked && someChecked;
    cb.style.cssText = "cursor:pointer;flex-shrink:0;accent-color:#3b82f6;";

    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;flex:1;";
    lbl.textContent = region;

    const arrow = document.createElement("span");
    arrow.style.cssText = "font-size:10px;color:#9ca3af;transition:transform 0.15s ease;display:inline-block;";
    arrow.textContent = "▾";

    const body = document.createElement("div");
    // Expand the region that contains the active market; collapse others
    body.hidden = !hasActive;
    arrow.style.transform = hasActive ? "" : "rotate(-90deg)";

    cb.addEventListener("change", async () => {
      const checked = cb.checked;
      const sel = await loadMarketSelection();
      markets.forEach((r) => { sel[marketKey(r)] = checked; });
      await saveMarketSelection(sel);
      regionEl.querySelectorAll("[data-market-key] input[type=checkbox]").forEach((mcb) => { mcb.checked = checked; });
      updateMarketSelectionCount(sel);
      const groupEl = regionEl.closest("[data-seller-group]");
      if (groupEl) updateGroupHighlight(groupEl, sel);
    });

    header.addEventListener("click", (e) => {
      if (e.target === cb) return;
      const collapsed = body.hidden;
      body.hidden = !collapsed;
      arrow.style.transform = collapsed ? "" : "rotate(-90deg)";
    });

    header.append(cb, lbl, arrow);
    regionEl.appendChild(header);
    markets.forEach((r) => body.appendChild(renderMarketItem(r, activeRegional, tabId, selection)));
    regionEl.appendChild(body);
    return regionEl;
  }

  async function loadDraftCsvMode() {
    try {
      const result = await chrome.storage.local.get(draftCsvModeKey);
      return result[draftCsvModeKey] === true;
    } catch { return false; }
  }

  function updateDraftModeLabel(csvMode) {
    draftModeLabel.textContent = csvMode ? "Save to collection (export CSV)" : "Send to Retool (same tab)";
    draftCsvModeToggle.checked = csvMode;
  }

  async function loadAndShowDraftProgress() {
    try {
      const result = await chrome.storage.local.get(draftProgressKey);
      const progress = result[draftProgressKey];

      if (!progress || typeof progress !== "object" || progress.done >= progress.total) {
        draftProgressContainer.hidden = true;
        return;
      }

      draftProgressContainer.hidden = false;
      const pct = Math.round((progress.done / progress.total) * 100);
      draftProgressFill.style.width = `${pct}%`;

      const doneLabels = (progress.markets || []).filter((m) => m.done).map((m) => m.label).join(", ");
      const pendingLabels = (progress.markets || []).filter((m) => !m.done).map((m) => m.label).join(", ");
      draftProgressText.textContent = `${progress.done}/${progress.total} — Done: ${doneLabels || "—"} | Next: ${pendingLabels || "—"}`;
    } catch { /* ignore */ }
  }

  async function startDraftScraping() {
    const csvMode = draftCsvModeToggle.checked;
    const skipRetool = csvMode;

    setStatus(skipRetool ? "Starting (collection mode)..." : "Starting...");

    try {
      // Check if any markets are selected in Market Selector for multi-market run
      const cached = await loadMarketCache();
      const selection = await loadMarketSelection();
      const hasSelection = cached && Object.values(selection).some(Boolean);

      if (hasSelection) {
        const tab = await getActiveTab();
        if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
          setStatus("Open a Seller Central page first.");
          return;
        }

        const selectedMarkets = [];
        (cached.standaloneRegionalAccounts || []).forEach((r) => {
          if (selection[marketKey(r)]) selectedMarkets.push(r);
        });
        (cached.globalAccounts || []).forEach((g) => {
          (cached.regionalAccountsByGlobalId?.[g.id] || []).forEach((r) => {
            if (selection[marketKey(r)]) selectedMarkets.push(r);
          });
        });

        if (selectedMarkets.length === 0) {
          setStatus("No markets selected.");
          return;
        }

        const markets = selectedMarkets.map((r) => ({
          mcid: r.ids?.mons_sel_dir_mcid || "",
          mkid: r.ids?.mons_sel_mkid || "",
          globalAccountId: r.globalAccountId || "",
          domain: r.domain || "",
          label: r.label || ""
        }));

        const parsedLimit = Number.parseInt(String(draftSkuLimitInput.value || "").trim(), 10);
        const response = await chrome.runtime.sendMessage({
          type: "START_MULTI_MARKET_DRAFT",
          markets,
          skipRetool,
          selectedEmail: draftEmailSelect.value,
          maxSkuCount: Number.isNaN(parsedLimit) ? null : parsedLimit,
          tabId: tab.id
        });

        if (!response?.success) {
          setStatus(response?.error || "Unable to start.");
          return;
        }

        setStatus(`Running on ${markets.length} market(s): ${markets.map((m) => m.label).join(", ")}`);
        void loadAndShowDraftProgress();
        window.close();
      } else {
        // Single market (existing behavior)
        const parsedLimit = Number.parseInt(String(draftSkuLimitInput.value || "").trim(), 10);
        const response = await chrome.runtime.sendMessage({
          type: "START_DRAFT_SCRAPING",
          selectedEmail: draftEmailSelect.value,
          maxSkuCount: Number.isNaN(parsedLimit) ? null : parsedLimit,
          skipRetool
        });

        if (!response?.success) {
          setStatus(response?.error || "Unable to start.");
          return;
        }

        const limitText = draftSkuLimitInput.value ? ` / limit ${draftSkuLimitInput.value}` : "";
        setStatus(`Starting for ${draftEmailSelect.value}${limitText}.`);
        window.close();
      }
    } catch (error) {
      setStatus(error.message || "Unexpected error.");
    }
  }

  // Section group toggles (new grouped UI: Operativa, FBA, Financials, …)
  document.querySelectorAll(".section-group-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      const bodyId = btn.id.replace("Toggle", "Body");
      const body = document.getElementById(bodyId);
      if (body) body.classList.toggle("collapsed", expanded);
    });
  });

  draftScrapingNoRetoolButton.addEventListener("click", startDraftScraping);

  draftSectionToggle.addEventListener("click", () => {
    const expanded = draftSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(draftSectionToggle, draftSectionBody, !expanded);
  });

  const priceFixSectionToggle = document.getElementById("priceFixSectionToggle");
  const priceFixSectionBody = document.getElementById("priceFixSectionBody");
  priceFixSectionToggle.addEventListener("click", () => {
    const expanded = priceFixSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(priceFixSectionToggle, priceFixSectionBody, !expanded);
  });

  const IBA_CLIENT_LIST_KEY = "_ibaClientList";
  const IBA_MULTI_PROGRESS_KEY_POP = "_ibaMultiProgress";
  let ibaProgressInterval = null;

  ibaSectionToggle.addEventListener("click", () => {
    const expanded = ibaSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(ibaSectionToggle, ibaSectionBody, !expanded);
    if (!expanded) void ibaInitClientSection();
  });

  async function ibaInitClientSection() {
    await ibaRenderClientChips();
    await ibaPopulateAccountDropdown();
  }

  async function ibaLoadSavedClients() {
    const s = await chrome.storage.local.get(IBA_CLIENT_LIST_KEY);
    return Array.isArray(s[IBA_CLIENT_LIST_KEY]) ? s[IBA_CLIENT_LIST_KEY] : [];
  }

  async function ibaSaveClients(list) {
    await chrome.storage.local.set({ [IBA_CLIENT_LIST_KEY]: list });
  }

  async function ibaRenderClientChips() {
    const listEl = document.getElementById("ibaClientList");
    const hintEl = document.getElementById("ibaClientListHint");
    if (!listEl) return;

    const clients = await ibaLoadSavedClients();
    listEl.innerHTML = "";

    if (!clients.length) {
      if (hintEl) hintEl.textContent = "Žádní klienti. Přidej z dropdownu níže.";
      return;
    }
    if (hintEl) hintEl.textContent = "";

    clients.forEach((name, idx) => {
      const chip = document.createElement("div");
      chip.className = "iba-client-chip";
      chip.innerHTML = `<span>${name}</span><button class="iba-client-chip-remove" data-idx="${idx}" type="button" title="Odebrat">✕</button>`;
      chip.querySelector(".iba-client-chip-remove").addEventListener("click", async () => {
        const cur = await ibaLoadSavedClients();
        cur.splice(idx, 1);
        await ibaSaveClients(cur);
        await ibaRenderClientChips();
      });
      listEl.appendChild(chip);
    });
  }

  async function ibaPopulateAccountDropdown() {
    const sel = document.getElementById("ibaAddClientSelect");
    if (!sel) return;

    const s = await chrome.storage.local.get("_accountListAccounts");
    const accounts = s["_accountListAccounts"]?.accounts;
    if (!Array.isArray(accounts) || !accounts.length) {
      sel.innerHTML = '<option value="">— Nejdřív načti Account Selector —</option>';
      return;
    }

    const saved = await ibaLoadSavedClients();
    const allLabels = accounts.map(a => a.label).filter(Boolean).sort();
    const available = allLabels.filter(l => !saved.includes(l));

    sel.innerHTML = '<option value="">— vyberte klienta —</option>' +
      available.map(l => `<option value="${l}">${l}</option>`).join("");
  }

  document.getElementById("ibaAddClientButton")?.addEventListener("click", async () => {
    const sel = document.getElementById("ibaAddClientSelect");
    const name = sel?.value?.trim();
    if (!name) return;

    const clients = await ibaLoadSavedClients();
    if (!clients.includes(name)) {
      clients.push(name);
      await ibaSaveClients(clients);
    }
    await ibaRenderClientChips();
    await ibaPopulateAccountDropdown();
  });

  document.getElementById("ibaMultiRunButton")?.addEventListener("click", async () => {
    const clients = await ibaLoadSavedClients();
    if (!clients.length) {
      setStatus("Přidej alespoň jednoho klienta.");
      return;
    }

    const runBtn  = document.getElementById("ibaMultiRunButton");
    const stopBtn = document.getElementById("ibaMultiStopButton");

    const res = await chrome.runtime.sendMessage({ type: "IBA_MULTI_START", accounts: clients })
      .catch(e => ({ success: false, error: e.message }));

    if (!res?.success) { setStatus("Chyba: " + (res?.error || "Neznámá")); return; }

    if (runBtn)  runBtn.style.display  = "none";
    if (stopBtn) stopBtn.style.display = "";
    ibaStartProgressPolling();
  });

  document.getElementById("ibaMultiStopButton")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "IBA_MULTI_STOP" }).catch(() => {});
    ibaStopProgressPolling();
    const runBtn  = document.getElementById("ibaMultiRunButton");
    const stopBtn = document.getElementById("ibaMultiStopButton");
    if (runBtn)  runBtn.style.display  = "";
    if (stopBtn) stopBtn.style.display = "none";
  });

  function ibaStartProgressPolling() {
    const progEl = document.getElementById("ibaMultiProgress");
    if (progEl) progEl.style.display = "";

    ibaProgressInterval = setInterval(async () => {
      const s = await chrome.storage.local.get(IBA_MULTI_PROGRESS_KEY_POP);
      const p = s[IBA_MULTI_PROGRESS_KEY_POP];
      if (!p || !progEl) return;

      if (p.done) {
        const summary = (p.results || []).map(r =>
          `${r.account}: ${r.status}${r.error ? " — " + r.error : ""}`
        ).join("\n");
        progEl.textContent = `Hotovo (${p.total} klientů).\n${summary}`;
        ibaStopProgressPolling();
        const runBtn  = document.getElementById("ibaMultiRunButton");
        const stopBtn = document.getElementById("ibaMultiStopButton");
        if (runBtn)  runBtn.style.display  = "";
        if (stopBtn) stopBtn.style.display = "none";
        return;
      }

      const pct = p.total > 0 ? `${p.current}/${p.total}` : "…";
      progEl.textContent = `[${pct}] ${p.currentAccount || ""} — ${p.phase || ""}`;
    }, 800);
  }

  function ibaStopProgressPolling() {
    if (ibaProgressInterval) { clearInterval(ibaProgressInterval); ibaProgressInterval = null; }
  }

  marketSectionToggle.addEventListener("click", () => {
    const expanded = marketSectionToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    setSectionExpanded(marketSectionToggle, marketSectionBody, next);
    if (next) void loadMarketData(true);
  });

  marketRefreshButton.addEventListener("click", () => {
    void loadMarketData(true);
  });

  marketSwitchButton?.addEventListener("click", async () => {
    if (!marketPickerSelect?.value) { setStatus("Select a market first."); return; }
    let r;
    try { r = JSON.parse(marketPickerSelect.value); } catch { setStatus("Invalid market selection."); return; }
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus("No active tab."); return; }
    setStatus("Switching market…");

    // Store pending switch — content script picks it up if Amazon redirects to account-switcher
    const marketLabel = marketPickerSelect.options[marketPickerSelect.selectedIndex]?.textContent?.trim() || null;
    const cached = await loadMarketCache().catch(() => null);
    const sellerName = cached?.current?.globalAccount?.label || cached?.current?.parentGlobalAccount?.label || null;
    if (sellerName || marketLabel) {
      await chrome.storage.local.set({
        _pendingAccountSwitch: { sellerName, marketLabel, ts: Date.now() }
      });
    }

    const url = buildMarketSwitchUrl(r);
    await chrome.tabs.update(tab.id, { url }).catch((e) => { setStatus("Switch failed: " + e.message); return; });
    window.close();
  });

  accountSectionToggle?.addEventListener("click", () => {
    const expanded = accountSectionToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    setSectionExpanded(accountSectionToggle, accountSectionBody, next);
    if (next) void loadAccountData(false);
  });

  accountRefreshButton?.addEventListener("click", () => {
    void loadAccountData(true);
  });

  marketRunPricingButton?.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
      setStatus("Open a Seller Central page first.");
      return;
    }

    const cached = await loadMarketCache();
    if (!cached) {
      setStatus("Load markets first.");
      return;
    }

    const selection = await loadMarketSelection();
    const allMarkets = [];

    (cached.standaloneRegionalAccounts || []).forEach((r) => {
      if (selection[marketKey(r)]) allMarkets.push(r);
    });

    (cached.globalAccounts || []).forEach((g) => {
      (cached.regionalAccountsByGlobalId?.[g.id] || []).forEach((r) => {
        if (selection[marketKey(r)]) allMarkets.push(r);
      });
    });

    if (allMarkets.length === 0) {
      setStatus("Check at least one market first.");
      return;
    }

    const markets = allMarkets.map((r) => ({
      mcid: r.ids?.mons_sel_dir_mcid || "",
      mkid: r.ids?.mons_sel_mkid || "",
      globalAccountId: r.globalAccountId || "",
      domain: r.domain || "",
      label: r.label || ""
    }));

    setStatus(`Starting Pricing Fixer on ${markets.length} market(s)...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "START_MULTI_MARKET_RUN",
        markets,
        scriptType: "pricing_fixer",
        tabId: tab.id
      });

      if (!response?.success) {
        setStatus(response?.error || "Failed to start.");
        return;
      }

      setStatus(`Running on: ${markets.map((m) => m.label).join(" → ")}`);
      window.close();
    } catch (error) {
      setStatus(error.message || "Error starting multi-market run.");
    }
  });

  shippingTemplateSectionToggle.addEventListener("click", () => {
    const expanded = shippingTemplateSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(shippingTemplateSectionToggle, shippingTemplateSectionBody, !expanded);
  });

  // ── Shipping Template UI ────────────────────────────────────────────────────

  const ST_CSV_TEMPLATE =
    "countries,standard_transit_time,base_price\n" +
    "DE,2-3D,3.99\n" +
    "AT;FR;CZ,3-5D,8.99\n" +
    "PL;SK;HU,4-7D,9.99\n";

  stDownloadCsvTemplate.addEventListener("click", () => {
    const blob = new Blob([ST_CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shipping_template_example.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  stUploadCsvBtn.addEventListener("click", () => stCsvUpload.click());

  let stParsedRows = null;

  stCsvUpload.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = stParseCsv(ev.target.result);
      if (result.error) {
        stShowCsvStatus(result.error, true);
        stParsedRows = null;
      } else {
        stParsedRows = result.rows;
        stShowCsvStatus(`✓ ${result.rows.length} row(s) loaded.`, false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  function stShowCsvStatus(msg, isError) {
    stCsvStatus.style.display = "block";
    stCsvStatus.style.background = isError ? "#fee2e2" : "#dcfce7";
    stCsvStatus.style.color = isError ? "#dc2626" : "#16a34a";
    stCsvStatus.textContent = msg;
  }

  function stParseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { error: "CSV must have a header and at least one row." };
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    for (const col of ["countries", "standard_transit_time", "base_price"]) {
      if (!header.includes(col)) return { error: `Missing column: "${col}"` };
    }
    const ci = (col) => header.indexOf(col);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const countries = cols[ci("countries")]?.split(";").map((c) => c.trim().toUpperCase()).filter(Boolean);
      const transitTime = cols[ci("standard_transit_time")]?.trim();
      const basePrice = parseFloat(cols[ci("base_price")]);
      if (!countries?.length) return { error: `Row ${i}: empty countries.` };
      if (!transitTime) return { error: `Row ${i}: missing transit_time.` };
      if (isNaN(basePrice) || basePrice < 0) return { error: `Row ${i}: invalid base_price.` };
      rows.push({ countries, transitTime, basePrice });
    }
    return { rows };
  }

  function stDetectMarketplace(url) {
    if (!url) return null;
    const tldMap = { de: "DE", it: "IT", fr: "FR", es: "ES", nl: "NL", pl: "PL", se: "SE", "co.uk": "GB" };
    const m = url.match(/sellercentral\.amazon\.([a-z.]+)/);
    return m ? (tldMap[m[1]] || null) : null;
  }

  function stBuildConfig(rows, marketplace, pricingMode, expedited, twoDay, oneDay, templateName) {
    const applyPricing = (price) => ({
      model: "shipment_based",
      pricePerOrder: pricingMode === "per_order" ? price : 0,
      unitPrice: pricingMode === "per_item" ? price : 0,
      unitMeasure: "Per Item",
    });

    const needsInherit = expedited.enabled || twoDay.enabled || oneDay.enabled;
    const domesticRow = rows.find((r) => r.countries.includes(marketplace));
    const intlRows = rows.filter((r) => !r.countries.includes(marketplace));

    const domesticShipping = {};
    const internationalShipping = {};

    if (domesticRow) {
      domesticShipping["EU_STANDARD.DOMESTIC"] = {
        enabled: true,
        clearExisting: true,
        publishCodes: needsInherit,
        regions: [{ countries: [marketplace + "0"], transitTime: domesticRow.transitTime, pricing: applyPricing(domesticRow.basePrice) }],
      };
    }

    if (intlRows.length > 0) {
      internationalShipping["EU_STANDARD.INTERNATIONAL"] = {
        enabled: true,
        clearExisting: true,
        regions: intlRows.map((row) => ({
          countries: row.countries.map((c) => c + "0"),
          transitTime: row.transitTime,
          pricing: applyPricing(row.basePrice),
        })),
      };
    }

    if (expedited.enabled && domesticRow) {
      const p = Math.round(domesticRow.basePrice * (1 + expedited.markup / 100) * 100) / 100;
      domesticShipping["EU_EXPEDITED.DOMESTIC"] = {
        enabled: true, clearExisting: true, inheritRegions: true,
        regions: [{ countries: [], transitTime: expedited.domTransit, pricing: applyPricing(p) }],
      };
    }

    if (expedited.enabled && intlRows.length > 0) {
      internationalShipping["EU_EXPEDITED.INTERNATIONAL"] = {
        enabled: true, clearExisting: true,
        regions: intlRows.map((row) => {
          const p = Math.round(row.basePrice * (1 + expedited.markup / 100) * 100) / 100;
          return { countries: row.countries.map((c) => c + "0"), transitTime: expedited.intlTransit, pricing: applyPricing(p) };
        }),
      };
    }

    if (twoDay.enabled) {
      domesticShipping["EU_PREMIUM.DOMESTIC"] = {
        enabled: true, clearExisting: true, inheritRegions: true,
        regions: [{ countries: [], transitTime: 2, pricing: applyPricing(twoDay.price) }],
      };
    }

    if (oneDay.enabled) {
      domesticShipping["EU_NEXT_DAY.DOMESTIC"] = {
        enabled: true, clearExisting: true, inheritRegions: true,
        regions: [{ countries: [], transitTime: 1, pricing: applyPricing(oneDay.price) }],
      };
    }

    return { templateName: templateName || "My Shipping Template", rateModel: "shipment_based", ssaEnabled: false, domesticShipping, internationalShipping };
  }

  function stGetFormValues() {
    return {
      pricingMode: document.querySelector("input[name='stPricingMode']:checked")?.value || "per_order",
      templateName: stTemplateName.value.trim() || "My Shipping Template",
      expedited: {
        enabled: stExpeditedEnabled.checked,
        markup: parseFloat(stExpeditedMarkup.value) || 0,
        domTransit: stExpeditedDomTransit.value.trim() || "1-2D",
        intlTransit: stExpeditedIntlTransit.value.trim() || "2-3D",
      },
      twoDay: { enabled: stTwoDayEnabled.checked, price: parseFloat(stTwoDayPrice.value) || 0 },
      oneDay: { enabled: stOneDayEnabled.checked, price: parseFloat(stOneDayPrice.value) || 0 },
    };
  }

  stExpeditedEnabled.addEventListener("change", () => { stExpeditedOptions.style.display = stExpeditedEnabled.checked ? "block" : "none"; });
  stTwoDayEnabled.addEventListener("change",    () => { stTwoDayOptions.style.display    = stTwoDayEnabled.checked    ? "block" : "none"; });
  stOneDayEnabled.addEventListener("change",    () => { stOneDayOptions.style.display    = stOneDayEnabled.checked    ? "block" : "none"; });

  const setST = (msg, isError = false) => {
    shippingTemplateStatus.style.display = "";
    shippingTemplateStatus.style.background = isError ? "#fee2e2" : "#f3f4f6";
    shippingTemplateStatus.style.color = isError ? "#dc2626" : "";
    shippingTemplateStatus.textContent = msg;
  };

  stGenerateButton.addEventListener("click", async () => {
    if (!stParsedRows) { setST("Upload a CSV first.", true); return; }
    const tab = await getActiveTab();
    const marketplace = stDetectMarketplace(tab?.url || "");
    const { pricingMode, expedited, twoDay, oneDay, templateName } = stGetFormValues();
    console.log("[ShippingTemplate] CSV rows:", stParsedRows.length);
    console.log("[ShippingTemplate] Marketplace:", marketplace);
    console.log("[ShippingTemplate] Domestic row:", stParsedRows.find((r) => r.countries.includes(marketplace)));
    console.log("[ShippingTemplate] International rows:", stParsedRows.filter((r) => !r.countries.includes(marketplace)).length);
    console.log("[ShippingTemplate] Pricing mode:", pricingMode);
    console.log("[ShippingTemplate] Expedited:", expedited.enabled, "markup:", expedited.markup);
    console.log("[ShippingTemplate] Two-day:", twoDay.enabled, "One-day:", oneDay.enabled);
    if (!marketplace) { setST("Could not detect marketplace — open a Seller Central page.", true); return; }
    if (!stParsedRows.find((r) => r.countries.includes(marketplace))) { setST(`No CSV row for domestic country (${marketplace}).`, true); return; }
    const config = stBuildConfig(stParsedRows, marketplace, pricingMode, expedited, twoDay, oneDay, templateName);
    console.log("[ShippingTemplate] Generated config:", JSON.stringify(config, null, 2));
    setST("Config generated — see DevTools console for details.");
  });

  stCreateButton.addEventListener("click", async () => {
    if (!stParsedRows) { setST("Upload a CSV first.", true); return; }
    const tab = await getActiveTab();
    if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
      setST("Open a Seller Central shipping template page first.", true); return;
    }
    const marketplace = stDetectMarketplace(tab.url);
    if (!marketplace) { setST("Could not detect marketplace from URL.", true); return; }
    if (!stParsedRows.find((r) => r.countries.includes(marketplace))) { setST(`No CSV row for domestic country (${marketplace}).`, true); return; }
    const { pricingMode, expedited, twoDay, oneDay, templateName } = stGetFormValues();
    const config = stBuildConfig(stParsedRows, marketplace, pricingMode, expedited, twoDay, oneDay, templateName);
    console.log("[ShippingTemplate] Starting automation:", JSON.stringify(config, null, 2));
    stCreateButton.disabled = true;
    setST("Injecting automator...");
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shipping_template_automator.js"] });
      setST("Running automation...");
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (cfg) => window.__runShippingTemplateAutomation(cfg),
        args: [config],
      });
      const r = result?.result;
      if (r?.log) downloadShippingLog(r.log, r.status || (r.success ? "SUCCESS" : "ERROR"));
      if (r?.success === false) { setST(`Error: ${r.error}`, true); }
      else { setST("✓ Shipping template created — log downloaded."); }
    } catch (err) {
      setST(`Failed: ${err.message || String(err)}`, true);
    } finally {
      stCreateButton.disabled = false;
    }
  });

  // ── Shipping Price Change ────────────────────────────────────────────────

  let spcLoadedTemplates = []; // { name, editUrl }[]

  function setSpcStatus(text, isError = false) {
    if (!text) {
      spcStatusDiv.style.display = "none";
      spcStatusLabel.textContent = "";
      return;
    }
    spcStatusDiv.style.display = "flex";
    spcStatusLabel.textContent = text;
    spcStatusLabel.style.color = isError ? "#EF4444" : "#6B7280";
  }

  function renderSpcTemplateList(templates) {
    spcLoadedTemplates = templates;
    if (!templates.length) {
      spcTemplateListEl.style.display = "none";
      setSpcStatus("No templates found on this page.", true);
      spcApplyButton.disabled = true;
      return;
    }
    spcTemplateListEl.innerHTML = templates
      .map(
        (t, i) =>
          `<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;">` +
          `<input type="checkbox" class="spc-template-cb" data-idx="${i}" checked style="accent-color:#3B82F6;">` +
          `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.name.replace(/</g, "&lt;")}</span>` +
          `</label>`
      )
      .join("");
    spcTemplateListEl.style.display = "block";
    setSpcStatus(`${templates.length} template(s) loaded.`);
    spcApplyButton.disabled = false;
  }

  shippingPriceChangeSectionToggle.addEventListener("click", () => {
    const expanded = shippingPriceChangeSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(shippingPriceChangeSectionToggle, shippingPriceChangeSectionBody, !expanded);
  });

  const SHIPPING_TEMPLATE_LIST_KEY = "_shippingTemplateList";

  spcLoadTemplatesBtn.addEventListener("click", async () => {
    setSpcStatus("Navigating to template list…");
    spcLoadTemplatesBtn.disabled = true;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "LIST_SHIPPING_TEMPLATES" });
      if (!resp?.success) {
        setSpcStatus(`Error: ${resp?.error || "Unknown error"}`, true);
        spcLoadTemplatesBtn.disabled = false;
      }
      // Result arrives via storage change listener below
    } catch (err) {
      setSpcStatus(`Failed: ${err.message || String(err)}`, true);
      spcLoadTemplatesBtn.disabled = false;
    }
  });

  spcApplyButton.addEventListener("click", async () => {
    const checked = [...spcTemplateListEl.querySelectorAll(".spc-template-cb:checked")];
    if (!checked.length) { setSpcStatus("Select at least one template.", true); return; }

    const templates = checked.map((cb) => spcLoadedTemplates[Number(cb.dataset.idx)]).filter(Boolean);
    const direction  = document.querySelector("input[name='spcDirection']:checked")?.value || "increase";
    const changeType = document.querySelector("input[name='spcChangeType']:checked")?.value || "fixed";
    const amount     = parseFloat(document.getElementById("spcAmount").value) || 0;

    if (amount <= 0) { setSpcStatus("Enter a positive amount.", true); return; }

    setSpcStatus("Processing...");
    spcApplyButton.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "PRICE_CHANGE_START",
        templates,
        config: { direction, changeType, amount },
      });
      if (!resp?.success) {
        setSpcStatus(`Error: ${resp?.error || "Unknown error"}`, true);
        spcApplyButton.disabled = false;
      }
      // Status will be updated via storage polling below
    } catch (err) {
      setSpcStatus(`Failed: ${err.message || String(err)}`, true);
      spcApplyButton.disabled = false;
    }
  });

  // Poll price change progress from storage
  const PRICE_CHANGE_PROGRESS_KEY = "_priceChangeProgress";

  function renderSpcProgress(progress) {
    if (!progress) return;
    if (!progress.active) {
      spcApplyButton.disabled = false;
      if (progress.error) {
        setSpcStatus(`Done with errors: ${progress.error}`, true);
      } else {
        setSpcStatus(`Done — ${progress.totalChanged || 0} price(s) changed in ${progress.total || 0} template(s).`);
      }
      return;
    }
    const pct = progress.total > 0 ? `${progress.current}/${progress.total}` : "";
    setSpcStatus(`Applying ${pct}${progress.label ? ` — ${progress.label}` : ""}…`);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PRICE_CHANGE_PROGRESS_KEY]) {
      renderSpcProgress(changes[PRICE_CHANGE_PROGRESS_KEY].newValue);
    }
    if (changes[SHIPPING_TEMPLATE_LIST_KEY]) {
      const templates = changes[SHIPPING_TEMPLATE_LIST_KEY].newValue;
      if (Array.isArray(templates)) {
        renderSpcTemplateList(templates);
        spcLoadTemplatesBtn.disabled = false;
        if (templates.length === 0) {
          setSpcStatus("No template edit links found on that page.", true);
        }
      }
    }
  });

  (async () => {
    const r = await chrome.storage.local.get([PRICE_CHANGE_PROGRESS_KEY, SHIPPING_TEMPLATE_LIST_KEY]);
    renderSpcProgress(r[PRICE_CHANGE_PROGRESS_KEY]);
    if (Array.isArray(r[SHIPPING_TEMPLATE_LIST_KEY]) && r[SHIPPING_TEMPLATE_LIST_KEY].length > 0) {
      renderSpcTemplateList(r[SHIPPING_TEMPLATE_LIST_KEY]);
    }
  })();

  // ── end Shipping Price Change ─────────────────────────────────────────────

  violationsSectionToggle.addEventListener("click", () => {
    const expanded = violationsSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(violationsSectionToggle, violationsSectionBody, !expanded);
  });

  ibaAutomationButton.addEventListener("click", async () => {
    setStatus("Starting...");

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        setStatus("No active tab found.");
        return;
      }

      try {
        await ensureContentScriptAndSend(tab, { action: "IBA_START" });
      } catch (error) {
        if (!String(error?.message || "").includes("Receiving end does not exist")) {
          throw error;
        }

        await chrome.tabs.create({
          url: ibaStartUrl
        });
      }

      setStatus("Opening IBA orders...");
      window.close();
    } catch (error) {
      setStatus(error.message || "Unable to start.");
    }
  });

  draftScheduleSaveButton.addEventListener("click", async () => {
    setDraftScheduleStatus("Saving schedule...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_DRAFT_SCHEDULE",
        intervalMinutes: draftScheduleIntervalInput.value,
        selectedEmail: draftEmailSelect.value
      });

      if (!response?.success) {
        setDraftScheduleStatus(response?.error || "Unable to save schedule.");
        return;
      }

      setDraftScheduleStatus(formatDraftScheduleMessage(response.config));
      setStatus("Draft interval schedule saved.");
    } catch (error) {
      setDraftScheduleStatus(error.message || "Unable to save schedule.");
    }
  });

  draftScheduleDisableButton.addEventListener("click", async () => {
    setDraftScheduleStatus("Disabling schedule...");

    try {
      const response = await chrome.runtime.sendMessage({ type: "DISABLE_DRAFT_SCHEDULE" });

      if (!response?.success) {
        setDraftScheduleStatus(response?.error || "Unable to disable schedule.");
        return;
      }

      setDraftScheduleStatus(formatDraftScheduleMessage(response.config));
      setStatus("Draft interval schedule disabled.");
    } catch (error) {
      setDraftScheduleStatus(error.message || "Unable to disable schedule.");
    }
  });

  draftCollectionExportButton.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_DRAFT_COLLECTION_STATE" });

      if (!response?.success) {
        setStatus(response?.error || "Unable to export collection.");
        return;
      }

      const pairs = Array.isArray(response.state?.skuMarketPairs) ? response.state.skuMarketPairs : [];
      // Fallback: if skuMarketPairs not yet available, use uniqueSkus
      const rows = pairs.length > 0
        ? pairs
        : (Array.isArray(response.state?.uniqueSkus) ? response.state.uniqueSkus.map((sku) => ({ sku, market: "" })) : []);

      if (rows.length === 0) {
        setStatus("No collected SKUs to export.");
        return;
      }

      const csvLines = ["sku,market", ...rows.map((p) => `${p.sku},${p.market || ""}`)];
      const datePart = new Date().toISOString().slice(0, 10);
      downloadCsv(`draft-collected-skus-${datePart}.csv`, csvLines.join("\n"));
      setStatus(`Exported ${rows.length} unique SKUs.`);
    } catch (error) {
      setStatus(error.message || "Unable to export collection.");
    }
  });

  draftCollectionResetButton.addEventListener("click", async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "RESET_DRAFT_COLLECTION_STATE" });

      if (!response?.success) {
        setStatus(response?.error || "Unable to reset collection.");
        return;
      }

      setDraftCollectionState(response.state);
      setStatus("Draft collection reset.");
    } catch (error) {
      setStatus(error.message || "Unable to reset collection.");
    }
  });

  draftCollectionToggle.addEventListener("change", async (event) => {
    const active = event.target.checked;
    try {
      const response = await chrome.runtime.sendMessage({
        type: active ? "START_DRAFT_COLLECTION_SESSION" : "STOP_DRAFT_COLLECTION_SESSION",
        selectedEmail: draftEmailSelect.value
      });
      if (!response?.success) {
        setStatus(response?.error || "Unable to toggle collection.");
        draftCollectionToggle.checked = !active;
        return;
      }
      setDraftCollectionState(response.state);
      setStatus(active ? "Collection session started." : "Collection session stopped.");
    } catch (error) {
      setStatus(error.message || "Unable to toggle collection.");
      draftCollectionToggle.checked = !active;
    }
  });

  draftCsvModeToggle.addEventListener("change", async (event) => {
    const csvMode = event.target.checked;
    try {
      await chrome.storage.local.set({ [draftCsvModeKey]: csvMode });
      updateDraftModeLabel(csvMode);
    } catch (error) {
      setStatus(error.message || "Unable to save mode.");
    }
  });

  violationsScheduleSaveButton?.addEventListener("click", () => {
    if (violationsScheduleStatus) violationsScheduleStatus.textContent = "Scheduling not available yet";
    setStatus("Violations daily schedule is not implemented yet.");
  });

  dryRunToggle.addEventListener("change", async (event) => {
    const enabled = event.target.checked;

    try {
      await chrome.storage.sync.set({
        [dryRunStorageKey]: enabled
      });
      setDryRunStatus(enabled);
      setStatus(enabled ? "Dry run enabled." : "Dry run disabled.");
    } catch (error) {
      setStatus(error.message || "Unable to save dry run setting.");
      await loadDryRunSetting();
    }
  });

  // ── Market cache & selection helpers ──────────────────────────────────────

  async function loadMarketCache() {
    try {
      const result = await chrome.storage.local.get(marketCacheKey);
      const entry = result[marketCacheKey];
      if (entry && typeof entry === "object" && entry.cachedAt && Date.now() - entry.cachedAt < marketCacheTtlMs) {
        return entry.data;
      }
    } catch { /* ignore */ }
    return null;
  }

  async function saveMarketCache(data) {
    try {
      await chrome.storage.local.set({ [marketCacheKey]: { data, cachedAt: Date.now() } });
    } catch { /* ignore */ }
  }

  async function loadMarketSelection() {
    try {
      const result = await chrome.storage.local.get(marketSelectionKey);
      return result[marketSelectionKey] || {};
    } catch { return {}; }
  }

  async function saveMarketSelection(selection) {
    try {
      await chrome.storage.local.set({ [marketSelectionKey]: selection });
    } catch { /* ignore */ }
  }

  function marketKey(r) {
    return `${r?.ids?.mons_sel_dir_mcid || ""}::${r?.ids?.mons_sel_mkid || ""}`;
  }

  function buildMarketSwitchUrl(regionalAccount) {
    const domain = regionalAccount?.domain || "sellercentral.amazon.de";
    const mkid = regionalAccount?.ids?.mons_sel_mkid || "";
    const mcid = regionalAccount?.ids?.mons_sel_dir_mcid || "";
    const globalAccountId = regionalAccount?.globalAccountId || "";
    const url = new URL(`https://${domain}/home`);
    url.searchParams.set("mons_sel_mkid", mkid);
    url.searchParams.set("mons_sel_dir_mcid", mcid);
    if (globalAccountId) url.searchParams.set("mons_sel_dir_paid", globalAccountId);
    url.searchParams.set("ignore_selection_changed", "true");
    return url.toString();
  }

  function isMarketActive(r, activeRegional) {
    return r?.ids?.mons_sel_mkid === activeRegional?.ids?.mons_sel_mkid &&
      r?.ids?.mons_sel_dir_mcid === activeRegional?.ids?.mons_sel_dir_mcid;
  }

  function renderMarketItem(r, activeRegional, tabId, selection) {
    const active = isMarketActive(r, activeRegional);
    const key = marketKey(r);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-market-label", `${r.label || ""} ${r.domain || ""}`.toLowerCase());
    wrapper.setAttribute("data-market-key", key);
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "8px";
    wrapper.style.padding = "8px 10px";
    wrapper.style.borderTop = "1px solid #e5e7eb";
    wrapper.style.background = active ? "#eff6ff" : "#fff";

    // Checkbox for multi-market selection
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selection[key] === true;
    checkbox.style.cursor = "pointer";
    checkbox.style.flexShrink = "0";
    checkbox.addEventListener("change", async () => {
      const sel = await loadMarketSelection();
      sel[key] = checkbox.checked;
      await saveMarketSelection(sel);
      updateMarketSelectionCount(sel);
      const groupEl = wrapper.closest("[data-seller-group]");
      if (groupEl) updateGroupHighlight(groupEl, sel);
    });

    // Label (click switches market)
    const label = document.createElement("button");
    label.type = "button";
    label.style.flex = "1";
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.justifyContent = "space-between";
    label.style.gap = "8px";
    label.style.background = "transparent";
    label.style.border = "0";
    label.style.padding = "0";
    label.style.cursor = active ? "default" : "pointer";
    label.style.color = active ? "#1d4ed8" : "#111827";
    label.style.fontWeight = active ? "600" : "normal";
    label.style.fontSize = "13px";
    label.style.textAlign = "left";

    const nameSpan = document.createElement("span");
    nameSpan.style.overflow = "hidden";
    nameSpan.style.textOverflow = "ellipsis";
    nameSpan.style.whiteSpace = "nowrap";
    nameSpan.textContent = r.label || "Unnamed";

    const domainBadge = document.createElement("span");
    domainBadge.style.fontSize = "11px";
    domainBadge.style.color = active ? "#1d4ed8" : "#6b7280";
    domainBadge.style.flexShrink = "0";
    domainBadge.textContent = r.domain || "";

    label.append(nameSpan, domainBadge);

    if (!active) {
      label.addEventListener("click", async () => {
        await chrome.tabs.update(tabId, { url: buildMarketSwitchUrl(r) });
        window.close();
      });
    }

    wrapper.append(checkbox, label);
    return wrapper;
  }

  function applyMarketSearch() {
    const q = (marketSearchInput?.value || "").toLowerCase().trim();

    // Seller groups
    marketList?.querySelectorAll("[data-seller-group]").forEach((groupEl) => {
      const sellerName = groupEl.getAttribute("data-seller-group") || "";
      const sellerMatches = !q || sellerName.includes(q);

      if (sellerMatches) {
        groupEl.style.display = "";
        groupEl.querySelectorAll("[data-region-group]").forEach((rg) => { rg.style.display = ""; });
        groupEl.querySelectorAll("[data-market-label]").forEach((el) => { el.style.display = ""; });
      } else {
        let groupHasVisible = false;
        groupEl.querySelectorAll("[data-region-group]").forEach((rg) => {
          let regionHasVisible = false;
          rg.querySelectorAll("[data-market-label]").forEach((el) => {
            const label = el.getAttribute("data-market-label") || "";
            const visible = label.includes(q);
            el.style.display = visible ? "" : "none";
            if (visible) regionHasVisible = true;
          });
          rg.style.display = regionHasVisible ? "" : "none";
          if (regionHasVisible) groupHasVisible = true;
        });
        groupEl.style.display = groupHasVisible ? "" : "none";
      }
    });

    // Standalone markets (direct children, not inside a seller group)
    marketList?.querySelectorAll(":scope > [data-market-label]").forEach((el) => {
      const label = el.getAttribute("data-market-label") || "";
      el.style.display = !q || label.includes(q) ? "" : "none";
    });
  }

  marketSearchInput?.addEventListener("input", applyMarketSearch);

  function renderMarketList(data, tabId, selection) {
    if (!marketList) return;
    const activeRegional = data.current?.regionalAccount || null;
    const standalone = (data.standaloneRegionalAccounts || []).filter((r) => !isPendingMarket(r));
    const globals = data.globalAccounts || [];

    standalone.forEach((r) => {
      marketList.appendChild(renderMarketItem(r, activeRegional, tabId, selection));
    });

    globals.forEach((globalAccount) => {
      const group = document.createElement("div");
      group.style.border = "1px solid #e5e7eb";
      group.style.borderRadius = "8px";
      group.style.overflow = "hidden";
      group.style.marginBottom = "6px";
      group.style.background = "#fff";

      const markets = (data.regionalAccountsByGlobalId?.[globalAccount.id] || []).filter((r) => !isPendingMarket(r));
      if (markets.length === 0) return;
      const hasActive = markets.some((r) => isMarketActive(r, activeRegional));

      group.setAttribute("data-seller-group", (globalAccount.label || "").toLowerCase());

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.style.cssText = "display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 10px;background:#f9fafb;border:0;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:600;cursor:pointer;";
      toggle.setAttribute("aria-expanded", String(hasActive));
      toggle.innerHTML = `<span class="seller-group-name-label">${globalAccount.label || "Unnamed seller"}</span><span style="font-size:11px;color:#6b7280;">&#9662;</span>`;

      const body = document.createElement("div");
      body.hidden = !hasActive;
      const regionGroups = groupByRegion(markets);
      regionGroups.forEach(({ region, markets: rMarkets }) => {
        body.appendChild(renderRegionSubgroup(region, rMarkets, activeRegional, tabId, selection));
      });

      toggle.addEventListener("click", () => {
        const next = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(next));
        body.hidden = !next;
      });

      group.append(toggle, body);
      marketList.appendChild(group);
    });

    updateMarketSelectionCount(selection);
    updateAllGroupHighlights(selection);
  }

  async function loadMarketData(forceRefresh = false) {
    if (marketCurrentLabel) marketCurrentLabel.textContent = "Loading...";
    if (marketPickerSelect) { marketPickerSelect.innerHTML = ""; marketPickerSelect.disabled = true; }

    const tab = await getActiveTab();

    if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
      if (marketCurrentLabel) marketCurrentLabel.textContent = "—";
      setStatus("Open a Seller Central page first.");
      return;
    }

    let data = forceRefresh ? null : await loadMarketCache();

    if (!data) {
      try {
        const response = await ensureContentScriptAndSend(tab, { action: "GET_MARKET_DATA" });
        if (!response?.success) {
          if (marketCurrentLabel) marketCurrentLabel.textContent = "—";
          setStatus(response?.error || "Failed to load markets.");
          return;
        }
        data = response.data;
        await saveMarketCache(data);
      } catch (error) {
        if (marketCurrentLabel) marketCurrentLabel.textContent = "—";
        setStatus(error.message || "Error loading markets.");
        return;
      }
    }

    const currentLabel = data.current?.regionalAccount?.label || "—";
    const currentMkid = data.current?.regionalAccount?.ids?.mons_sel_mkid || "";
    const currentMcid = data.current?.regionalAccount?.ids?.mons_sel_dir_mcid || "";
    const accountLabel = data.current?.globalAccount?.label || data.current?.parentGlobalAccount?.label || "";
    const displayLabel = accountLabel ? `${accountLabel} → ${currentLabel}` : currentLabel;
    if (marketCurrentLabel) marketCurrentLabel.textContent = `Current: ${displayLabel}`;

    const markets = data.standaloneRegionalAccounts || [];

    // Populate <select> picker if present
    if (marketPickerSelect) {
      marketPickerSelect.innerHTML = "";
      markets.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = JSON.stringify({ ids: r.ids, domain: r.domain, globalAccountId: r.globalAccountId });
        opt.textContent = r.label || r.domain || "—";
        const mkidMatch = r.ids?.mons_sel_mkid === currentMkid;
        const mcidMatch = !currentMcid || r.ids?.mons_sel_dir_mcid === currentMcid;
        if (mkidMatch && mcidMatch) opt.selected = true;
        marketPickerSelect.appendChild(opt);
      });
      marketPickerSelect.disabled = markets.length === 0;
      if (markets.length === 0) {
        const placeholder = document.createElement("option");
        placeholder.textContent = "— no markets found —";
        marketPickerSelect.appendChild(placeholder);
      }
    }

    // Legacy list rendering (if marketList exists in older UI)
    if (marketList) {
      marketList.innerHTML = "";
      const selection = await loadMarketSelection();
      renderMarketList(data, tab.id, selection);
      applyMarketSearch();
    }
  }

  // ─── Account Selector ──────────────────────────────────────────────────────

  const ACCOUNT_LIST_ACCOUNTS_KEY = "_accountListAccounts";
  const ACCOUNT_LIST_LOADING_KEY = "_accountListLoading";
  const ACCOUNT_LIST_CACHE_TTL = 30 * 60 * 1000;

  async function loadAccountData(forceRefresh = false) {
    if (accountCurrentLabel) accountCurrentLabel.textContent = "Loading…";
    if (accountSelectorTree) accountSelectorTree.innerHTML = "";
    if (accountSwitchingIndicator) accountSwitchingIndicator.style.display = "none";

    if (!forceRefresh) {
      const stored = await chrome.storage.local.get(ACCOUNT_LIST_ACCOUNTS_KEY);
      const cached = stored[ACCOUNT_LIST_ACCOUNTS_KEY];
      if (cached?.accounts && Date.now() - (cached.cachedAt || 0) < ACCOUNT_LIST_CACHE_TTL) {
        renderAccountTree(cached.accounts);
        return;
      }
    }

    const tab = await getActiveTab();
    if (!tab?.id || !/amazon\./.test(tab.url || "")) {
      if (accountCurrentLabel) accountCurrentLabel.textContent = "—";
      setStatus("Open a Seller Central page first.");
      return;
    }

    if (accountSelectorTree) {
      accountSelectorTree.innerHTML = '<div style="padding:8px;color:#6b7280;font-size:12px;">Opening account switcher in background…</div>';
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(onMsg);
        if (accountCurrentLabel) accountCurrentLabel.textContent = "Timeout — try refresh";
        if (accountSelectorTree) accountSelectorTree.innerHTML = '<div style="color:#ef4444;font-size:12px;">Timeout loading accounts</div>';
        resolve();
      }, 90000);

      function onMsg(msg) {
        if (msg?.type !== "ACCOUNT_LIST_READY") return;
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(onMsg);
        if (msg.error) {
          if (accountCurrentLabel) accountCurrentLabel.textContent = "Error";
          if (accountSelectorTree) accountSelectorTree.innerHTML = `<div style="color:#ef4444;font-size:12px;">${msg.error}</div>`;
        } else if (msg.accounts) {
          renderAccountTree(msg.accounts);
        }
        resolve();
      }

      chrome.runtime.onMessage.addListener(onMsg);

      chrome.storage.local.get(ACCOUNT_LIST_LOADING_KEY).then((loading) => {
        if (!loading[ACCOUNT_LIST_LOADING_KEY]) {
          chrome.runtime.sendMessage({ type: "GET_ACCOUNT_LIST" }).catch(() => {});
        }
      }).catch(() => {
        chrome.runtime.sendMessage({ type: "GET_ACCOUNT_LIST" }).catch(() => {});
      });
    });
  }

  // Market label → country code mapping for account selector chips
  const MARKET_CHIPS = [
    { code: "DE", label: "Germany" },
    { code: "GB", label: "United Kingdom" },
    { code: "FR", label: "France" },
    { code: "IT", label: "Italy" },
    { code: "ES", label: "Spain" },
    { code: "PL", label: "Poland" },
    { code: "NL", label: "Netherlands" },
    { code: "BE", label: "Belgium" },
    { code: "SE", label: "Sweden" },
    { code: "CZ", label: "Czech Republic" },
    { code: "TR", label: "Turkey" },
    { code: "EG", label: "Egypt" },
    { code: "SA", label: "Saudi Arabia" },
    { code: "AE", label: "UAE" },
  ];

  function renderAccountTree(accounts) {
    if (!accountSelectorTree) return;
    accountSelectorTree.innerHTML = "";

    if (!accounts?.length) {
      accountSelectorTree.innerHTML = '<div style="color:#6b7280;font-size:12px;">No accounts found</div>';
      if (accountCurrentLabel) accountCurrentLabel.textContent = "—";
      return;
    }

    const currentAccount = accounts.find((a) => a.isCurrent);
    if (accountCurrentLabel) {
      accountCurrentLabel.textContent = currentAccount ? `Current: ${currentAccount.label}` : "Current: —";
    }

    const childAccounts = accounts.filter((a) => !!a.parent);
    const rootAccounts = accounts.filter((a) => !a.parent).sort((a, b) => {
      const aSpn = a.hasChildren || childAccounts.some((c) => c.parent === a.label);
      const bSpn = b.hasChildren || childAccounts.some((c) => c.parent === b.label);
      return (bSpn ? 1 : 0) - (aSpn ? 1 : 0);
    });

    for (const root of rootAccounts) {
      const children = childAccounts.filter((c) => c.parent === root.label);
      const isAgency = root.hasChildren || children.length > 0;

      const item = document.createElement("div");
      item.style.cssText = "margin-bottom:4px;";

      if (isAgency) {
        const header = document.createElement("button");
        header.type = "button";
        header.style.cssText = "display:flex;align-items:center;gap:4px;width:100%;text-align:left;padding:5px 6px;background:#f3f4f6;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;color:#374151;";
        const arrow = document.createElement("span");
        arrow.className = "acct-arrow";
        arrow.textContent = "▶";
        header.appendChild(arrow);
        header.appendChild(document.createTextNode(" " + root.label));
        item.appendChild(header);

        const childWrap = document.createElement("div");
        childWrap.style.cssText = "display:none;margin-left:12px;border-left:2px solid #e5e7eb;padding-left:8px;";

        header.addEventListener("click", () => {
          const open = childWrap.style.display !== "none";
          childWrap.style.display = open ? "none" : "block";
          header.querySelector(".acct-arrow").textContent = open ? "▶" : "▼";
        });

        for (const child of children) {
          childWrap.appendChild(buildAccountRow(child, child.label));
        }

        if (children.length === 0) {
          const hint = document.createElement("div");
          hint.textContent = "No sub-accounts found";
          hint.style.cssText = "font-size:11px;color:#9ca3af;padding:4px 0;";
          childWrap.appendChild(hint);
        }

        item.appendChild(childWrap);
      } else {
        item.appendChild(buildAccountRow(root, root.label));
      }

      accountSelectorTree.appendChild(item);
    }
  }

  // Build one account row: [Client name] [▾] with country chip dropdown
  function buildAccountRow(account, sellerName) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin:2px 0;";

    const isCurrent = account.isCurrent;

    // Top row: name button + arrow button
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:2px;";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = `flex:1;min-width:0;text-align:left;padding:5px 6px;border:none;border-radius:4px;cursor:pointer;font-size:12px;background:${isCurrent ? "#dbeafe" : "#fff"};color:${isCurrent ? "#1d4ed8" : "#374151"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    btn.textContent = (isCurrent ? "✓ " : "") + account.label;
    btn.addEventListener("click", () => switchToAccount(sellerName, null));

    const arrowBtn = document.createElement("button");
    arrowBtn.type = "button";
    arrowBtn.textContent = "▾";
    arrowBtn.style.cssText = "flex-shrink:0;padding:4px 6px;border:none;border-radius:4px;cursor:pointer;font-size:11px;background:#f3f4f6;color:#6b7280;";

    row.appendChild(btn);
    row.appendChild(arrowBtn);

    // Country chip strip — hidden until arrow clicked
    const chips = document.createElement("div");
    chips.style.cssText = "display:none;flex-wrap:wrap;gap:3px;padding:4px 2px 2px;";

    MARKET_CHIPS.forEach(({ code, label }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = code;
      chip.title = label;
      chip.style.cssText = "padding:2px 6px;font-size:11px;border:1px solid #d1d5db;border-radius:3px;cursor:pointer;background:#fff;color:#374151;";
      chip.addEventListener("mouseover", () => { chip.style.background = "#2563eb"; chip.style.color = "#fff"; chip.style.borderColor = "#2563eb"; });
      chip.addEventListener("mouseout", () => { chip.style.background = "#fff"; chip.style.color = "#374151"; chip.style.borderColor = "#d1d5db"; });
      chip.addEventListener("click", () => switchToAccount(sellerName, label));
      chips.appendChild(chip);
    });

    arrowBtn.addEventListener("click", () => {
      const open = chips.style.display !== "none";
      chips.style.display = open ? "none" : "flex";
      arrowBtn.textContent = open ? "▾" : "▴";
    });

    wrap.appendChild(row);
    wrap.appendChild(chips);
    return wrap;
  }

  async function switchToAccount(sellerLabel, marketLabel) {
    console.log("[SellerTools popup] switchToAccount called: seller=%s market=%s", sellerLabel, marketLabel);
    const tab = await getActiveTab();
    if (!tab?.id) { setStatus("No active tab."); return; }

    if (accountSwitchingIndicator) accountSwitchingIndicator.style.display = "flex";
    if (accountSwitchingText) accountSwitchingText.textContent = `Přepínám na ${sellerLabel}${marketLabel ? " → " + marketLabel : ""}…`;

    const payload = { sellerName: sellerLabel, marketLabel: marketLabel || null, ts: Date.now() };
    console.log("[SellerTools popup] writing _pendingAccountSwitch:", JSON.stringify(payload));
    await chrome.storage.local.set({ _pendingAccountSwitch: payload });
    console.log("[SellerTools popup] storage written, navigating tab", tab.id, "to account-switcher");

    const rawDomain = new URL(tab.url).hostname;
    const domain = /sellercentral\.amazon/.test(rawDomain) ? rawDomain : "sellercentral.amazon.de";
    await chrome.tabs.update(tab.id, { url: `https://${domain}/account-switcher/default/merchantMarketplace` });
    window.close();
  }

  // ─── End Account Selector ──────────────────────────────────────────────────

  // ─── Violations market dropdown ────────────────────────────────────────────

  let _violationsSessionMarkets = null;

  const refreshViolationsDropdown = setupMarketDropdown(
    "violationsMarketBtn", "violationsMarketPanel", "violations-market-cb",
    "violationsMarketLabel", "violationsMarketSelectAll",
    () => void violationsOpenMarketDropdown()
  );

  function violationsRenderMarkets(markets, panel) {
    panel.querySelectorAll("label:not(.inv-select-all-row), .violations-market-status").forEach((el) => el.remove());
    markets.filter((r) => !isPendingMarket(r)).forEach((r) => {
      const mkid = r.ids?.mons_sel_mkid || "";
      if (!mkid) return;
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "violations-market-cb";
      cb.dataset.mkid = mkid;
      cb.dataset.label = r.label || mkid;
      cb.dataset.code = r.label || mkid;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(` ${r.label || mkid}`));
      panel.appendChild(lbl);
    });
    refreshViolationsDropdown();
  }

  async function violationsOpenMarketDropdown() {
    const panel = document.getElementById("violationsMarketPanel");
    if (!panel) return;
    if (_violationsSessionMarkets) { violationsRenderMarkets(_violationsSessionMarkets, panel); return; }
    let statusEl = panel.querySelector(".violations-market-status");
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "violations-market-status";
      statusEl.style.cssText = "padding:8px 10px;color:#6b7280;font-size:12px;";
      panel.appendChild(statusEl);
    }
    statusEl.textContent = "Loading markets…";
    try {
      const tab = await getActiveTab();
      if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
        statusEl.textContent = "Open Seller Central first."; return;
      }
      let cached = await loadMarketCache();
      if (!cached) {
        const response = await ensureContentScriptAndSend(tab, { action: "GET_MARKET_DATA" });
        if (response?.success && response.data) { await saveMarketCache(response.data); cached = response.data; }
      }
      if (!cached) { statusEl.textContent = "Could not load markets."; return; }
      const markets = cached.standaloneRegionalAccounts || [];
      if (!markets.length) { statusEl.textContent = "No markets found."; return; }
      _violationsSessionMarkets = markets;
      violationsRenderMarkets(markets, panel);
    } catch (err) { statusEl.textContent = `Error: ${err.message}`; }
  }

  function violationsGetSelectedMarkets() {
    return [...document.querySelectorAll("#violationsMarketPanel .violations-market-cb:checked")]
      .map((cb) => ({ label: cb.dataset.label || "", code: cb.dataset.code || "" }))
      .filter((m) => m.label);
  }

  function violationsSetRunning(running) {
    const exportBtn = document.getElementById("violationsButton");
    const stopBtn = document.getElementById("violationsStopButton");
    if (!exportBtn || !stopBtn) return;
    exportBtn.style.display = running ? "none" : "";
    stopBtn.style.display = running ? "" : "none";
  }

  document.getElementById("violationsButton").addEventListener("click", async () => {
    const markets = violationsGetSelectedMarkets();
    setStatus("Starting...");
    let sellerName = null;
    try {
      const cached = await loadMarketCache();
      sellerName = cached?.current?.globalAccount?.label || null;
    } catch { /* ignore */ }
    try {
      const response = await chrome.runtime.sendMessage({ type: "START_VIOLATIONS_EXPORT", markets, sellerName });
      if (!response?.success) { setStatus(response?.error || "Unable to start."); return; }
      violationsSetRunning(true);
      setStatus("Opening violations tab...");
      window.close();
    } catch (error) {
      setStatus(error.message || "Unexpected error.");
    }
  });

  // ── Notification Preferences Email ──────────────────────────────────────────

  function setupMarketDropdown(btnId, panelId, cbClass, labelId, selectAllId, onOpen) {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const label = document.getElementById(labelId);
    if (!btn || !panel || !label) return () => {};
    const refresh = () => {
      const checked = [...panel.querySelectorAll(`.${cbClass}:checked`)];
      label.textContent = checked.length === 0
        ? "Select markets"
        : checked.map((cb) => cb.dataset.code).join(", ");
      const selectAll = document.getElementById(selectAllId);
      if (selectAll) {
        const total = panel.querySelectorAll(`.${cbClass}`).length;
        selectAll.checked = checked.length === total && total > 0;
        selectAll.indeterminate = checked.length > 0 && checked.length < total;
      }
    };
    refresh();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains("open");
      document.querySelectorAll(".inv-dropdown-panel").forEach((p) => p.classList.remove("open"));
      document.querySelectorAll(".inv-dropdown-btn").forEach((b) => b.classList.remove("open"));
      if (!isOpen) { panel.classList.add("open"); btn.classList.add("open"); if (onOpen) onOpen(); }
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    panel.addEventListener("change", (e) => {
      const selectAll = document.getElementById(selectAllId);
      if (selectAll && e.target === selectAll) {
        panel.querySelectorAll(`.${cbClass}`).forEach((cb) => { cb.checked = selectAll.checked; });
      }
      refresh();
    });
    return refresh;
  }

  const refreshNotifPrefsDropdown = setupMarketDropdown(
    "notifPrefsMarketBtn", "notifPrefsMarketPanel", "notif-prefs-market-cb",
    "notifPrefsMarketLabel", "notifPrefsMarketSelectAll",
    () => void notifPrefsOpenMarketDropdown()
  );

  let _notifPrefsSessionMarkets = null;

  function notifPrefsRenderMarkets(markets, panel) {
    panel.querySelectorAll("label:not(.inv-select-all-row), .notif-prefs-status").forEach((el) => el.remove());
    markets.filter((r) => !isPendingMarket(r)).forEach((r) => {
      const mkid = r.ids?.mons_sel_mkid || "";
      if (!mkid) return;
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "notif-prefs-market-cb";
      cb.dataset.mkid = mkid;
      cb.dataset.label = r.label || mkid;
      cb.dataset.code = r.label || mkid;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(` ${r.label || mkid}`));
      panel.appendChild(lbl);
    });
    refreshNotifPrefsDropdown();
  }

  async function notifPrefsOpenMarketDropdown() {
    const panel = document.getElementById("notifPrefsMarketPanel");
    if (!panel) return;
    if (_notifPrefsSessionMarkets) { notifPrefsRenderMarkets(_notifPrefsSessionMarkets, panel); return; }
    let statusEl = panel.querySelector(".notif-prefs-status");
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "notif-prefs-status";
      statusEl.style.cssText = "padding:8px 10px;color:#6b7280;font-size:12px;";
      panel.appendChild(statusEl);
    }
    statusEl.textContent = "Loading markets…";
    try {
      const tab = await getActiveTab();
      if (!tab?.id || !/^https:\/\/sellercentral\.amazon\./.test(tab.url || "")) {
        statusEl.textContent = "Open Seller Central first."; return;
      }
      let cached = await loadMarketCache();
      if (!cached) {
        const response = await ensureContentScriptAndSend(tab, { action: "GET_MARKET_DATA" });
        if (response?.success && response.data) { await saveMarketCache(response.data); cached = response.data; }
      }
      if (!cached) { statusEl.textContent = "Could not load markets."; return; }
      const markets = cached.standaloneRegionalAccounts || [];
      if (!markets.length) { statusEl.textContent = "No markets found."; return; }
      _notifPrefsSessionMarkets = markets;
      notifPrefsRenderMarkets(markets, panel);
    } catch (err) { statusEl.textContent = `Error: ${err.message}`; }
  }

  function notifPrefsGetSelectedMarkets() {
    return [...document.querySelectorAll("#notifPrefsMarketPanel .notif-prefs-market-cb:checked")]
      .map((cb) => ({ label: cb.dataset.label || "", code: cb.dataset.code || "" }))
      .filter((m) => m.label);
  }

  notifPrefsSectionToggle.addEventListener("click", () => {
    const expanded = notifPrefsSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(notifPrefsSectionToggle, notifPrefsSectionBody, !expanded);
  });

  document.getElementById("notifPrefsButton").addEventListener("click", async () => {
    const email = document.getElementById("notifPrefsEmailInput").value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Enter a valid email address."); return;
    }
    const markets = notifPrefsGetSelectedMarkets();
    if (!markets.length) { setStatus("Select at least one market."); return; }
    setStatus("Starting...");
    let sellerName = null;
    try {
      const cached = await loadMarketCache();
      sellerName = cached?.current?.globalAccount?.label || null;
    } catch { /* ignore */ }
    try {
      const response = await chrome.runtime.sendMessage({ type: "START_NOTIF_PREFS", email, markets, sellerName });
      if (!response?.success) { setStatus(response?.error || "Unable to start."); return; }
      setStatus("Opening preferences tab...");
      window.close();
    } catch (error) { setStatus(error.message || "Unexpected error."); }
  });

  // ── Pricing Fix ──────────────────────────────────────────────────────────────

  pricingFixRunButton.addEventListener("click", async () => {
    const fixMinMax = pricingFixMinMaxCheck.checked;
    const fixB2B = pricingFixB2BCheck.checked;

    if (!fixMinMax && !fixB2B) {
      setStatus("Select at least one option.");
      return;
    }

    setStatus("Starting Price Fix...");

    try {
      const tab = await getActiveTab();
      const isOnSC = tab?.id && /^https:\/\/sellercentral\.amazon\./.test(tab.url || "");

      if (fixMinMax) {
        if (isOnSC) {
          await ensureContentScriptAndSend(tab, { action: "PRICING_FIXER_START" });
        } else {
          await chrome.tabs.create({ url: pricingFixerUrl });
        }
      }

      if (fixB2B) {
        if (isOnSC) {
          await ensureContentScriptAndSend(tab, { action: "B2B_FIXER_START" });
        } else {
          await chrome.tabs.create({ url: b2bFixerUrl });
        }
      }

      setStatus("Price Fix started.");
      window.close();
    } catch (error) {
      setStatus(error.message || "Unable to start Price Fix.");
    }
  });

  draftStopButton.addEventListener("click", async () => {
    setStatus("Stopping...");

    try {
      const response = await chrome.runtime.sendMessage({ type: "STOP_DRAFT_SCRAPING" });

      if (!response?.success) {
        setStatus(response?.error || "Unable to stop.");
        return;
      }

      setStatus("Stopped.");
      window.close();
    } catch (error) {
      setStatus(error.message || "Unexpected error.");
    }
  });


  violationsStopButton.addEventListener("click", async () => {
    try {
      await chrome.runtime.sendMessage({ type: "STOP_VIOLATIONS_EXPORT" });
      violationsSetRunning(false);
      setStatus("Violations export stopped.");
    } catch { /* ignore */ }
  });

  // Check if violations export is already running when popup opens
  chrome.runtime.sendMessage({ type: "GET_VIOLATIONS_STATE" }).then((resp) => {
    if (resp?.success) violationsSetRunning(true);
  }).catch(() => {});

  vatReportSectionToggle.addEventListener("click", () => {
    const expanded = vatReportSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(vatReportSectionToggle, vatReportSectionBody, !expanded);
  });

  vatReportDownloadButton.addEventListener("click", async () => {
    const checkedMonths = [...vatReportSectionBody.querySelectorAll(".vat-month-cb:checked")]
      .map((cb) => parseInt(cb.value, 10));
    const checkedYears = [...vatReportSectionBody.querySelectorAll(".vat-year-cb:checked")]
      .map((cb) => parseInt(cb.value, 10));

    if (checkedMonths.length === 0) {
      renderVatReportStatus({ active: true, phase: "error" });
      document.getElementById("vatReportStatusLabel").textContent = "Vyberte měsíc";
      return;
    }
    if (checkedYears.length === 0) {
      renderVatReportStatus({ active: true, phase: "error" });
      document.getElementById("vatReportStatusLabel").textContent = "Vyberte rok";
      return;
    }

    // Build all month-year combinations
    const combinations = [];
    for (const year of checkedYears) {
      for (const month of checkedMonths) {
        combinations.push({ year, month });
      }
    }
    combinations.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

    const downloadMode = vatReportSectionBody.querySelector(".vat-download-mode:checked")?.value || "zip";

    // Show spinner immediately
    renderVatReportStatus({ active: true, phase: "submitting", submittedCount: 0, totalMonths: combinations.length });

    vatReportDownloadButton.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "VAT_REPORT_START_NEW",
        months: combinations,
        downloadMode
      });

      if (!response?.success) {
        renderVatReportStatus({ active: true, phase: "error" });
        document.getElementById("vatReportStatusLabel").textContent = response?.error || "Chyba";
      } else {
        await loadVatReportProgress();
      }
    } catch (error) {
      renderVatReportStatus({ active: true, phase: "error" });
      document.getElementById("vatReportStatusLabel").textContent = error.message || "Chyba";
    } finally {
      vatReportDownloadButton.disabled = false;
    }
  });

  invoiceSectionToggle.addEventListener("click", () => {
    const expanded = invoiceSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(invoiceSectionToggle, invoiceSectionBody, !expanded);
  });

  invoiceDownloadButton.addEventListener("click", async () => {
    const checkedMonths = [...invoiceSectionBody.querySelectorAll(".invoice-month-cb:checked")]
      .map((cb) => parseInt(cb.value, 10));
    const months = checkedMonths.length > 0 ? checkedMonths : [1,2,3,4,5,6,7,8,9,10,11,12];
    const years  = [...invoiceSectionBody.querySelectorAll(".invoice-year-cb:checked")]
      .map((cb) => parseInt(cb.value, 10));

    if (years.length === 0) {
      invoiceStatusEl.style.display = "flex";
      document.getElementById("invoiceStatusLabel").textContent = "Vyber rok";
      document.getElementById("invoiceStatusLabel").style.color = "#EF4444";
      return;
    }

    const MONTH_NAMES_CZ = ["leden","únor","březen","duben","květen","červen",
                            "červenec","srpen","září","říjen","listopad","prosinec"];
    const now       = new Date();
    const nowYear   = now.getFullYear();
    const nowMonth  = now.getMonth() + 1;

    const validCombos = [];
    for (const y of years) {
      for (const m of months) {
        if (y > nowYear || (y === nowYear && m >= nowMonth)) continue;
        validCombos.push({ month: m, year: y });
      }
    }

    if (validCombos.length === 0) {
      invoiceStatusEl.style.display = "flex";
      document.getElementById("invoiceStatusLabel").textContent = "Žádná platná kombinace";
      document.getElementById("invoiceStatusLabel").style.color = "#EF4444";
      return;
    }

    const docType      = invoiceSectionBody.querySelector(".invoice-doc-type:checked")?.value ?? "all";
    const downloadMode = invoiceSectionBody.querySelector(".invoice-download-mode:checked")?.value ?? "zip";
    const includeCsv   = document.getElementById("invoiceIncludeCsv")?.checked ?? false;

    // Show spinner immediately
    invoiceStatusEl.style.display = "flex";
    const invoiceLbl = document.getElementById("invoiceStatusLabel");
    invoiceLbl.textContent = "Processing";
    invoiceLbl.style.color = "#6B7280";

    invoiceDownloadButton.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type:    "INVOICE_DOWNLOADER_START",
        months:  validCombos.map((c) => c.month),
        years:   validCombos.map((c) => c.year),
        docType,
        downloadMode,
        includeCsv,
      });
      if (!response?.success) {
        invoiceLbl.textContent = response?.error || "Chyba";
        invoiceLbl.style.color = "#EF4444";
      }
    } catch (error) {
      invoiceLbl.textContent = error.message || "Chyba";
      invoiceLbl.style.color = "#EF4444";
    } finally {
      invoiceDownloadButton.disabled = false;
    }
  });

  toolsViewButton.addEventListener("click", () => {
    setActiveView("tools");
  });

  bookmarksViewButton.addEventListener("click", () => {
    setActiveView("bookmarks");
  });

  document.getElementById("openOptionsBtn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById("openOptionsBtn2")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const SCBookmarks = (() => {
    const STORAGE_KEY = "sc_bookmarks_v1";
    const COLORS = ["#FF9900", "#232f3e", "#0f766e", "#2563eb", "#7c3aed", "#dc2626"];

    const state = {
      bookmarks: [],
      searchTerm: "",
      categoryFilter: "all",
      collapsedGroups: new Set(),
      editingId: null,
      selectedColor: COLORS[0]
    };

    const elements = {
      list: document.getElementById("bookmarksList"),
      addButton: document.getElementById("bookmarkCurrentPageButton"),
      searchInput: document.getElementById("bookmarkSearchInput"),
      categoryFilter: document.getElementById("bookmarkCategoryFilter"),
      categoryOptions: document.getElementById("bookmarkCategoryOptions"),
      modal: document.getElementById("bookmarkModal"),
      modalTitle: document.getElementById("bookmarkModalTitle"),
      modalCloseButton: document.getElementById("bookmarkModalCloseButton"),
      cancelButton: document.getElementById("bookmarkCancelButton"),
      form: document.getElementById("bookmarkForm"),
      nameInput: document.getElementById("bookmarkNameInput"),
      urlInput: document.getElementById("bookmarkUrlInput"),
      categoryInput: document.getElementById("bookmarkCategoryInput"),
      noteInput: document.getElementById("bookmarkNoteInput"),
      colorPicker: document.getElementById("bookmarkColorPicker"),
      toastStack: document.getElementById("bookmarkToastStack")
    };

    function generateId() {
      return `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    function sanitizeBookmark(rawBookmark) {
      return {
        id: rawBookmark.id || generateId(),
        name: (rawBookmark.name || "Untitled bookmark").trim(),
        url: (rawBookmark.url || "").trim(),
        category: (rawBookmark.category || "Uncategorized").trim() || "Uncategorized",
        note: (rawBookmark.note || "").trim(),
        color: COLORS.includes(rawBookmark.color) ? rawBookmark.color : COLORS[0],
        createdAt: rawBookmark.createdAt || new Date().toISOString(),
        updatedAt: rawBookmark.updatedAt || new Date().toISOString()
      };
    }

    async function loadBookmarks() {
      const result = await chrome.storage.sync.get(STORAGE_KEY);
      const bookmarks = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
      state.bookmarks = bookmarks.map(sanitizeBookmark);
      render();
    }

    async function persistBookmarks() {
      await chrome.storage.sync.set({ [STORAGE_KEY]: state.bookmarks });
    }

    function getSortedCategories() {
      return [...new Set(state.bookmarks.map((bookmark) => bookmark.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    }

    function showToast(message) {
      const toast = document.createElement("div");
      toast.className = "sc-bookmarks-toast";
      toast.textContent = message;
      elements.toastStack.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 2400);
    }

    async function getCurrentTabBookmarkDefaults() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.url || !/^https:\/\/sellercentral\.amazon\./.test(tab.url)) {
        throw new Error("Open a Seller Central page before saving a bookmark.");
      }

      return {
        name: tab.title || "Seller Central Page",
        url: tab.url,
        category: "Quick Saves",
        note: "",
        color: COLORS[0]
      };
    }

    function openModal(bookmark) {
      state.editingId = bookmark?.id || null;
      state.selectedColor = bookmark?.color || COLORS[0];

      elements.modalTitle.textContent = bookmark ? "Edit Bookmark" : "Add Bookmark";
      elements.nameInput.value = bookmark?.name || "";
      elements.urlInput.value = bookmark?.url || "";
      elements.categoryInput.value = bookmark?.category || "";
      elements.noteInput.value = bookmark?.note || "";
      renderColorPicker();
      elements.modal.hidden = false;
      elements.nameInput.focus();
      elements.nameInput.select();
    }

    function closeModal() {
      elements.modal.hidden = true;
      state.editingId = null;
      elements.form.reset();
      state.selectedColor = COLORS[0];
      renderColorPicker();
    }

    function updateCategoryControls() {
      const categories = getSortedCategories();
      elements.categoryFilter.innerHTML = '<option value="all">All categories</option>';
      elements.categoryOptions.innerHTML = "";

      categories.forEach((category) => {
        const selectOption = document.createElement("option");
        selectOption.value = category;
        selectOption.textContent = category;
        elements.categoryFilter.appendChild(selectOption);

        const dataOption = document.createElement("option");
        dataOption.value = category;
        elements.categoryOptions.appendChild(dataOption);
      });

      if (!categories.includes(state.categoryFilter)) {
        state.categoryFilter = "all";
      }

      elements.categoryFilter.value = state.categoryFilter;
    }

    function matchesFilters(bookmark) {
      const searchTarget = `${bookmark.name} ${bookmark.url} ${bookmark.note}`.toLowerCase();
      const matchesSearch = !state.searchTerm || searchTarget.includes(state.searchTerm);
      const matchesCategory = state.categoryFilter === "all" || bookmark.category === state.categoryFilter;
      return matchesSearch && matchesCategory;
    }

    function getFilteredBookmarks() {
      return state.bookmarks
        .filter(matchesFilters)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    function groupBookmarks(bookmarks) {
      const grouped = new Map();

      bookmarks.forEach((bookmark) => {
        const category = bookmark.category || "Uncategorized";

        if (!grouped.has(category)) {
          grouped.set(category, []);
        }

        grouped.get(category).push(bookmark);
      });

      return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }

    function renderColorPicker() {
      elements.colorPicker.innerHTML = "";

      COLORS.forEach((color) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sc-bookmarks-color-option";
        button.style.background = color;
        button.dataset.color = color;
        button.setAttribute("aria-label", `Select color ${color}`);

        if (color === state.selectedColor) {
          button.classList.add("is-selected");
        }

        button.addEventListener("click", () => {
          state.selectedColor = color;
          renderColorPicker();
        });

        elements.colorPicker.appendChild(button);
      });
    }

    function createBookmarkCard(bookmark) {
      const card = document.createElement("article");
      card.className = "sc-bookmarks-card";
      card.style.borderLeftColor = bookmark.color;

      const favicon = document.createElement("img");
      favicon.className = "sc-bookmarks-favicon";
      favicon.alt = "";
      favicon.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(bookmark.url)}&sz=64`;

      const main = document.createElement("div");
      main.className = "sc-bookmarks-card-main";

      const link = document.createElement("a");
      link.className = "sc-bookmarks-card-link";
      link.href = "#";
      link.textContent = bookmark.name;
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        await chrome.tabs.create({ url: bookmark.url });
      });

      const url = document.createElement("div");
      url.className = "sc-bookmarks-card-url";
      url.textContent = bookmark.url;

      main.append(link, url);

      if (bookmark.note) {
        const note = document.createElement("div");
        note.className = "sc-bookmarks-card-note";
        note.textContent = bookmark.note;
        main.appendChild(note);
      }

      const actions = document.createElement("div");
      actions.className = "sc-bookmarks-card-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "sc-bookmarks-action";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => {
        openModal(bookmark);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "sc-bookmarks-action is-danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", async () => {
        const confirmed = window.confirm(`Delete bookmark "${bookmark.name}"?`);

        if (!confirmed) {
          return;
        }

        state.bookmarks = state.bookmarks.filter((item) => item.id !== bookmark.id);
        await persistBookmarks();
        render();
        showToast("Bookmark deleted");
      });

      actions.append(editButton, deleteButton);
      card.append(favicon, main, actions);
      return card;
    }

    function renderEmptyState() {
      elements.list.innerHTML = `
        <div class="sc-bookmarks-empty">
          <div class="sc-bookmarks-empty-illustration">&#128278;</div>
          <div>No bookmarks yet.<br>Save your current Seller Central page to start.</div>
        </div>
      `;
    }

    function render() {
      updateCategoryControls();
      const filteredBookmarks = getFilteredBookmarks();

      if (filteredBookmarks.length === 0) {
        renderEmptyState();
        return;
      }

      elements.list.innerHTML = "";

      groupBookmarks(filteredBookmarks).forEach(([category, bookmarks]) => {
        const group = document.createElement("section");
        group.className = "sc-bookmarks-group";

        const header = document.createElement("button");
        header.type = "button";
        header.className = "sc-bookmarks-group-header";
        const expanded = !state.collapsedGroups.has(category);
        header.setAttribute("aria-expanded", String(expanded));
        header.innerHTML = `
          <span class="sc-bookmarks-group-title">
            <span class="sc-bookmarks-group-arrow">&#9654;</span>
            <span>${category}</span>
          </span>
          <span class="sc-bookmarks-group-badge">${bookmarks.length}</span>
        `;
        header.addEventListener("click", () => {
          if (state.collapsedGroups.has(category)) {
            state.collapsedGroups.delete(category);
          } else {
            state.collapsedGroups.add(category);
          }

          render();
        });

        group.appendChild(header);

        if (expanded) {
          const items = document.createElement("div");
          items.className = "sc-bookmarks-group-items";
          bookmarks.forEach((bookmark) => {
            items.appendChild(createBookmarkCard(bookmark));
          });
          group.appendChild(items);
        }

        elements.list.appendChild(group);
      });
    }

    async function saveFromForm() {
      const bookmark = sanitizeBookmark({
        id: state.editingId || generateId(),
        name: elements.nameInput.value,
        url: elements.urlInput.value,
        category: elements.categoryInput.value,
        note: elements.noteInput.value,
        color: state.selectedColor,
        createdAt: state.bookmarks.find((item) => item.id === state.editingId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (!bookmark.url) {
        throw new Error("URL is required.");
      }

      try {
        new URL(bookmark.url);
      } catch {
        throw new Error("Enter a valid URL.");
      }

      const existingIndex = state.bookmarks.findIndex((item) => item.id === bookmark.id);

      if (existingIndex >= 0) {
        state.bookmarks.splice(existingIndex, 1, bookmark);
      } else {
        state.bookmarks.unshift(bookmark);
      }

      await persistBookmarks();
      render();
      closeModal();
      showToast(existingIndex >= 0 ? "Bookmark updated" : "Bookmark saved");
    }

    function bindEvents() {
      elements.addButton.addEventListener("click", async () => {
        try {
          const defaults = await getCurrentTabBookmarkDefaults();
          openModal(defaults);
        } catch (error) {
          showToast(error.message || "Unable to use the current page.");
        }
      });

      elements.searchInput.addEventListener("input", (event) => {
        state.searchTerm = event.target.value.trim().toLowerCase();
        render();
      });

      elements.categoryFilter.addEventListener("change", (event) => {
        state.categoryFilter = event.target.value;
        render();
      });

      elements.modalCloseButton.addEventListener("click", closeModal);
      elements.cancelButton.addEventListener("click", closeModal);

      elements.modal.addEventListener("click", (event) => {
        if (event.target === elements.modal) {
          closeModal();
        }
      });

      elements.form.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
          await saveFromForm();
        } catch (error) {
          showToast(error.message || "Unable to save bookmark.");
        }
      });

      document.addEventListener("keydown", async (event) => {
        if (elements.modal.hidden) {
          return;
        }

        if (event.key === "Escape") {
          closeModal();
          return;
        }

        if (event.key === "Enter" && event.target !== elements.noteInput) {
          event.preventDefault();

          try {
            await saveFromForm();
          } catch (error) {
            showToast(error.message || "Unable to save bookmark.");
          }
        }
      });
    }

    async function init() {
      bindEvents();
      renderColorPicker();
      await loadBookmarks();
    }

    return { init };
  })();

  void SCBookmarks.init();

  (async () => {
    const tab = await getActiveTab();
    const onSC = typeof tab?.url === "string" && (/sellercentral(?:-europe)?\.amazon/.test(tab.url) || /solutionproviderportal\.amazon\.com/.test(tab.url));
    if (!onSC) {
      notScPanel.removeAttribute("hidden");
      notScPanel.style.display = "flex";
      toolsPanel.style.display = "none";
      return;
    }

    setSectionExpanded(draftSectionToggle, draftSectionBody, false);
    setSectionExpanded(ibaSectionToggle, ibaSectionBody, false);
    setSectionExpanded(marketSectionToggle, marketSectionBody, false);
    setSectionExpanded(violationsSectionToggle, violationsSectionBody, false);
    setSectionExpanded(shippingTemplateSectionToggle, shippingTemplateSectionBody, false);
    setSectionExpanded(vatReportSectionToggle, vatReportSectionBody, false);
    setSectionExpanded(invoiceSectionToggle, invoiceSectionBody, false);
    setSectionExpanded(shippingPriceChangeSectionToggle, shippingPriceChangeSectionBody, false);
    void loadVatReportProgress();
    window.setInterval(() => {
      void loadVatReportProgress();
    }, 1000);
    // Pre-check current year
    const currentYear = String(Math.min(new Date().getFullYear(), 2026));
    const yearCb = invoiceSectionBody.querySelector(`.invoice-year-cb[value="${currentYear}"]`);
    if (yearCb) yearCb.checked = true;

    // ── Invoice dropdown logic ─────────────────────────────────────────────────
    const MONTH_NAMES = ["January","February","March","April","May","June",
                         "July","August","September","October","November","December"];

    function updateDropdownLabel(btnId, labelId, checkboxClass, emptyText, namesFn) {
      const checked = [...invoiceSectionBody.querySelectorAll(`.${checkboxClass}:checked`)];
      const label   = document.getElementById(labelId);
      if (!label) return;
      if (checked.length === 0) {
        label.textContent = emptyText;
      } else {
        label.textContent = `${checked.length} vybráno`;
      }
    }

    function scrollInvoiceSectionToBottom() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const scrollRoot = document.scrollingElement || document.documentElement || document.body;
          if (scrollRoot) {
            scrollRoot.scrollTo({
              top: scrollRoot.scrollHeight,
              behavior: "smooth"
            });
          }

          invoiceSectionBody.scrollIntoView({
            block: "end",
            behavior: "smooth"
          });
        });
      });
    }

    function setupInvDropdown(btnId, panelId, checkboxClass, emptyText, namesFn) {
      const btn   = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      if (!btn || !panel) return;

      const refresh = () => updateDropdownLabel(btnId, btnId.replace("Btn", "Label"), checkboxClass, emptyText, namesFn);
      refresh();

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains("open");
        // close all other dropdowns first
        document.querySelectorAll(".inv-dropdown-panel").forEach((p) => { p.classList.remove("open"); });
        document.querySelectorAll(".inv-dropdown-btn").forEach((b) => b.classList.remove("open"));
        if (!isOpen) {
          panel.classList.add("open");
          btn.classList.add("open");
          scrollInvoiceSectionToBottom();
        }
      });

      // prevent clicks inside the panel from bubbling to the document close handler
      panel.addEventListener("click", (e) => e.stopPropagation());
      panel.addEventListener("change", refresh);
    }

    setupInvDropdown(
      "invoiceMonthBtn", "invoiceMonthPanel", "invoice-month-cb",
      "Všechny měsíce",
      (v) => MONTH_NAMES[parseInt(v, 10) - 1]
    );
    setupInvDropdown(
      "invoiceYearBtn", "invoiceYearPanel", "invoice-year-cb",
      "Vyberte rok",
      (v) => v
    );
    // Update year label after pre-checking current year
    updateDropdownLabel("invoiceYearBtn", "invoiceYearLabel", "invoice-year-cb", "Vyberte rok", (v) => v);

    // ── VAT dropdown logic ────────────────────────────────────────────────────
    function setupVatDropdown(btnId, panelId, checkboxClass, emptyText) {
      const btn   = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      if (!btn || !panel) return null;

      const refresh = () => {
        const checked = [...vatReportSectionBody.querySelectorAll(`.${checkboxClass}:checked`)];
        const label   = document.getElementById(btnId.replace("Btn", "Label"));
        if (!label) return;
        label.textContent = checked.length === 0 ? emptyText : `${checked.length} vybráno`;
      };
      refresh();

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = panel.classList.contains("open");
        document.querySelectorAll(".inv-dropdown-panel").forEach((p) => { p.classList.remove("open"); });
        document.querySelectorAll(".inv-dropdown-btn").forEach((b) => b.classList.remove("open"));
        if (!isOpen) {
          panel.classList.add("open");
          btn.classList.add("open");
          requestAnimationFrame(() => {
            document.getElementById("vatReportDownloadButton")?.scrollIntoView({ block: "end", behavior: "smooth" });
          });
        }
      });

      panel.addEventListener("click", (e) => e.stopPropagation());
      panel.addEventListener("change", refresh);
      return refresh;
    }

    const vatMonthRefresh = setupVatDropdown("vatMonthBtn", "vatMonthPanel", "vat-month-cb", "Vyberte měsíce");
    const vatYearRefresh  = setupVatDropdown("vatYearBtn",  "vatYearPanel",  "vat-year-cb",  "Vyberte rok");

    // ── VAT "Vše" (Select All) logic ─────────────────────────────────────────
    function setupVatSelectAll(selectAllId, checkboxClass, panelId, refreshFn) {
      const selectAllCb = document.getElementById(selectAllId);
      const panel       = document.getElementById(panelId);
      if (!selectAllCb || !panel || !refreshFn) return;

      // When "Vše" is toggled: set all checkboxes and refresh the label directly
      selectAllCb.addEventListener("change", () => {
        panel.querySelectorAll(`.${checkboxClass}`).forEach((cb) => {
          cb.checked = selectAllCb.checked;
        });
        refreshFn();
      });

      // When individual checkboxes change: update "Vše" indeterminate state
      panel.addEventListener("change", (e) => {
        if (e.target === selectAllCb) return;
        const all = [...panel.querySelectorAll(`.${checkboxClass}`)];
        const checkedCount = all.filter((cb) => cb.checked).length;
        selectAllCb.checked       = checkedCount === all.length;
        selectAllCb.indeterminate = checkedCount > 0 && checkedCount < all.length;
      });
    }

    setupVatSelectAll("vatMonthSelectAll", "vat-month-cb", "vatMonthPanel", vatMonthRefresh);
    setupVatSelectAll("vatYearSelectAll",  "vat-year-cb",  "vatYearPanel",  vatYearRefresh);

    // Close dropdowns when clicking outside
    document.addEventListener("click", () => {
      document.querySelectorAll(".inv-dropdown-panel").forEach((p) => { p.classList.remove("open"); });
      document.querySelectorAll(".inv-dropdown-btn").forEach((b) => { b.classList.remove("open"); });
    });

    void loadDryRunSetting();
    void loadDraftSchedule();
    void loadDraftCollectionState();
    void loadAndShowDraftProgress();
    void loadDraftCsvMode().then(updateDraftModeLabel);
  })();

  // ── SPP Management ─────────────────────────────────────────────────────────

  const SPP_ROLES_KEY = "_sppRoles";
  const SPP_ASSIGN_PROGRESS_KEY = "_sppAssignProgress";
  const SPP_ASSIGN_LOG_KEY = "_sppAssignLog";

  let sppEmployees = [];
  let sppClients = [];
  let sppProgressInterval = null;

  // Inner tool-card toggles
  const sppAssignSectionToggle = document.getElementById("sppAssignSectionToggle");
  const sppAssignSectionBody   = document.getElementById("sppAssignSectionBody");
  const sppRolesSectionToggle  = document.getElementById("sppRolesSectionToggle");
  const sppRolesSectionBody    = document.getElementById("sppRolesSectionBody");

  sppAssignSectionToggle?.addEventListener("click", () => {
    const expanded = sppAssignSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(sppAssignSectionToggle, sppAssignSectionBody, !expanded);
  });
  sppRolesSectionToggle?.addEventListener("click", () => {
    const expanded = sppRolesSectionToggle.getAttribute("aria-expanded") === "true";
    setSectionExpanded(sppRolesSectionToggle, sppRolesSectionBody, !expanded);
    if (!expanded) void sppLoadRoles();
  });

  // ── Roles CRUD ─────────────────────────────────────────────────────────────

  async function sppGetRoles() {
    const s = await chrome.storage.local.get(SPP_ROLES_KEY);
    return Array.isArray(s[SPP_ROLES_KEY]) ? s[SPP_ROLES_KEY] : [];
  }

  async function sppSaveRoles(roles) {
    await chrome.storage.local.set({ [SPP_ROLES_KEY]: roles });
  }

  async function sppLoadRoles() {
    const roles = await sppGetRoles();
    sppRenderRoles(roles);
    sppPopulateRoleDropdown(roles);
  }

  function sppRenderRoles(roles) {
    const list = document.getElementById("sppRolesList");
    if (!list) return;
    if (!roles.length) {
      list.innerHTML = '<p style="color:#9CA3AF;font-size:11px;margin:0;">Žádné role. Přidej roli nebo importuj ze zaměstnance.</p>';
      return;
    }
    list.innerHTML = roles.map((role, idx) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;margin-bottom:4px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;">
        <span style="font-size:12px;font-weight:500;color:#374151;">${role.name}</span>
        <div style="display:flex;gap:4px;">
          <span style="font-size:10px;color:#9CA3AF;">${Object.keys(role.permissions || {}).length} oprávnění</span>
          <button data-idx="${idx}" class="spp-role-del" type="button" title="Smazat roli"
            style="padding:2px 6px;font-size:11px;border:1px solid #FCA5A5;border-radius:4px;background:#FEF2F2;color:#DC2626;cursor:pointer;">✕</button>
        </div>
      </div>`).join("");

    list.querySelectorAll(".spp-role-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        const roles2 = await sppGetRoles();
        roles2.splice(Number(btn.dataset.idx), 1);
        await sppSaveRoles(roles2);
        sppRenderRoles(roles2);
        sppPopulateRoleDropdown(roles2);
      });
    });
  }

  function sppPopulateRoleDropdown(roles) {
    const sel = document.getElementById("sppAssignRoleSelect");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Role (volitelná) —</option>' +
      roles.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
    if (prev) sel.value = prev;
  }

  document.getElementById("sppAddRoleButton")?.addEventListener("click", async () => {
    const roles = await sppGetRoles();
    const name = `Role ${roles.length + 1}`;
    roles.push({ id: String(Date.now()), name, permissions: {}, sections: [] });
    await sppSaveRoles(roles);
    sppRenderRoles(roles);
    sppPopulateRoleDropdown(roles);
  });

  // ── Import role from existing employee/client ───────────────────────────────

  document.getElementById("sppImportRoleButton")?.addEventListener("click", async () => {
    const empSel = document.getElementById("sppImportEmpSelect");
    const cliSel = document.getElementById("sppImportCliSelect");
    const nameInput = document.getElementById("sppImportRoleName");
    const statusEl = document.getElementById("sppImportStatus");
    const debugRow = document.getElementById("sppImportDebugRow");
    const debugArea = document.getElementById("sppImportDebugArea");

    const employeeId = empSel?.value;
    const clientId   = cliSel?.value;
    if (!employeeId || !clientId) {
      if (statusEl) statusEl.textContent = "Vyber zaměstnance a klienta.";
      return;
    }

    if (statusEl) statusEl.textContent = "Načítám oprávnění…";

    let res;
    try {
      res = await chrome.runtime.sendMessage({
        type: "GET_SPP_EMPLOYEE_PERMISSIONS",
        employeeId,
        clientId,
        sections: [],
      });
    } catch (e) {
      if (statusEl) statusEl.textContent = "Chyba: " + e.message;
      return;
    }

    if (!res?.success) {
      if (statusEl) statusEl.textContent = "Chyba: " + (res?.error || "Neznámá chyba");
      return;
    }

    // Parse allToolsDebug: "[Category] Tool=Level" → build sections + permissions
    const catMap = new Map();
    const permissions = {};
    for (const entry of (res.allToolsDebug || [])) {
      const m = /^\[(.+?)\]\s+(.+?)=(\w+)$/.exec(entry);
      if (!m) continue;
      const [, cat, tool, level] = m;
      const catId  = "s_" + cat.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const toolId = "t_" + tool.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const key = `${catId}.${toolId}`;
      if (!catMap.has(catId)) catMap.set(catId, { id: catId, label: cat, items: [] });
      const sect = catMap.get(catId);
      if (!sect.items.find(i => i.id === toolId)) sect.items.push({ id: toolId, label: tool });
      if (level && level !== "None") permissions[key] = level;
    }
    const sections = [...catMap.values()];

    const empName = empSel.options[empSel.selectedIndex]?.textContent || "";
    const cliName = cliSel.options[cliSel.selectedIndex]?.textContent || "";
    const roleName = nameInput?.value?.trim() || `${empName} → ${cliName}`;

    const roles = await sppGetRoles();
    roles.push({ id: String(Date.now()), name: roleName, permissions, sections });
    await sppSaveRoles(roles);
    sppRenderRoles(roles);
    sppPopulateRoleDropdown(roles);

    if (nameInput) nameInput.value = "";
    if (statusEl) statusEl.textContent = `✓ Role „${roleName}" uložena (${Object.keys(permissions).length} oprávnění).`;

    if (debugArea && res.allToolsDebug?.length) {
      debugArea.value = res.allToolsDebug.join("\n");
      if (debugRow) debugRow.style.display = "block";
    }
    if (res.unmatched?.length && statusEl) {
      statusEl.textContent += ` (${res.unmatched.length} nespárovaných)`;
    }
  });

  // ── Load Data ───────────────────────────────────────────────────────────────

  document.getElementById("sppLoadDataButton")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("sppLoadStatus");
    if (statusEl) statusEl.textContent = "Načítám data ze SPP portálu…";

    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "GET_SPP_DATA" });
    } catch (e) {
      if (statusEl) statusEl.textContent = "Chyba: " + e.message;
      return;
    }

    if (!res?.success) {
      if (statusEl) statusEl.textContent = "Chyba: " + (res?.error || "Neznámá chyba");
      return;
    }

    sppEmployees = res.employees || [];
    sppClients   = res.clients   || [];

    // Populate employee dropdowns
    const empOpt = sppEmployees.map(e => `<option value="${e.id}">${e.name}</option>`).join("");
    const empSelAssign  = document.getElementById("sppAssignEmpSelect");
    const empSelImport  = document.getElementById("sppImportEmpSelect");
    if (empSelAssign) empSelAssign.innerHTML  = '<option value="">— Zaměstnanec —</option>' + empOpt;
    if (empSelImport) empSelImport.innerHTML  = '<option value="">— Zaměstnanec —</option>' + empOpt;

    // Populate client dropdown for import
    const cliSelImport = document.getElementById("sppImportCliSelect");
    if (cliSelImport) cliSelImport.innerHTML =
      '<option value="">— Klient —</option>' +
      sppClients.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

    sppRenderClientList(sppClients);

    if (statusEl) statusEl.textContent = `✓ Načteno: ${sppEmployees.length} zaměstnanců, ${sppClients.length} klientů.`;

    await sppLoadRoles();
  });

  // ── Client list (checkboxes + search + select all) ──────────────────────────

  function sppRenderClientList(clients) {
    const listEl = document.getElementById("sppClientList");
    if (!listEl) return;
    if (!clients.length) {
      listEl.innerHTML = '<span style="color:#9CA3AF;font-size:11px;">Žádní klienti.</span>';
      return;
    }
    listEl.innerHTML = clients.map(c => `
      <label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;font-size:12px;">
        <input type="checkbox" class="spp-cli-cb" data-id="${c.id}" data-name="${c.name.replace(/"/g, '&quot;')}" style="cursor:pointer;">
        <span>${c.name}</span>
      </label>`).join("");
    listEl.addEventListener("change", sppUpdateSelectAll);
  }

  function sppUpdateSelectAll() {
    const all  = [...document.querySelectorAll(".spp-cli-cb")];
    const vis  = all.filter(cb => cb.closest("label")?.style.display !== "none");
    const chk  = vis.filter(cb => cb.checked);
    const saEl = document.getElementById("sppCliSelectAll");
    if (!saEl) return;
    saEl.checked       = vis.length > 0 && chk.length === vis.length;
    saEl.indeterminate = chk.length > 0 && chk.length < vis.length;
  }

  document.getElementById("sppCliSelectAll")?.addEventListener("change", (e) => {
    const vis = [...document.querySelectorAll(".spp-cli-cb")]
      .filter(cb => cb.closest("label")?.style.display !== "none");
    vis.forEach(cb => { cb.checked = e.target.checked; });
  });

  document.getElementById("sppClientSearch")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".spp-cli-cb").forEach(cb => {
      const lbl = cb.closest("label");
      if (!lbl) return;
      lbl.style.display = !q || cb.dataset.name.toLowerCase().includes(q) ? "" : "none";
    });
    sppUpdateSelectAll();
  });

  // ── Assign ──────────────────────────────────────────────────────────────────

  document.getElementById("sppAssignButton")?.addEventListener("click", async () => {
    const statusEl    = document.getElementById("sppLoadStatus");
    const empSel      = document.getElementById("sppAssignEmpSelect");
    const roleSel     = document.getElementById("sppAssignRoleSelect");
    const assignBtn   = document.getElementById("sppAssignButton");
    const stopBtn     = document.getElementById("sppAssignStopButton");

    const empId = empSel?.value;
    if (!empId) { if (statusEl) statusEl.textContent = "Vyber zaměstnance."; return; }

    const selectedClients = [...document.querySelectorAll(".spp-cli-cb:checked")]
      .map(cb => ({ id: cb.dataset.id, name: cb.dataset.name }));
    if (!selectedClients.length) { if (statusEl) statusEl.textContent = "Vyber alespoň jednoho klienta."; return; }

    const emp = sppEmployees.find(e => e.id === empId);
    if (!emp) { if (statusEl) statusEl.textContent = "Zaměstnanec nenalezen — načti data znovu."; return; }

    let rolePermissions = null;
    let roleSections = null;
    const roleId = roleSel?.value;
    if (roleId) {
      const roles = await sppGetRoles();
      const role = roles.find(r => r.id === roleId);
      if (role) { rolePermissions = role.permissions; roleSections = role.sections; }
    }

    if (assignBtn) assignBtn.style.display = "none";
    if (stopBtn)   stopBtn.style.display   = "";
    sppStartProgressPolling();

    try {
      await chrome.runtime.sendMessage({
        type: "SPP_ASSIGN",
        employees: [emp],
        clients: selectedClients,
        rolePermissions,
        roleSections,
      });
    } catch (e) {
      if (statusEl) statusEl.textContent = "Chyba: " + e.message;
    }

    sppStopProgressPolling();
    if (assignBtn) assignBtn.style.display = "";
    if (stopBtn)   stopBtn.style.display   = "none";

    const dlBtn = document.getElementById("sppAssignDownloadLog");
    if (dlBtn) dlBtn.style.display = "";
  });

  document.getElementById("sppAssignStopButton")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "SPP_ASSIGN_STOP" }).catch(() => {});
  });

  // ── Progress polling ────────────────────────────────────────────────────────

  function sppStartProgressPolling() {
    const barEl  = document.getElementById("sppAssignProgressBar");
    const fillEl = document.getElementById("sppAssignProgressFill");
    const textEl = document.getElementById("sppAssignProgressText");
    const errEl  = document.getElementById("sppAssignErrors");
    if (barEl) barEl.style.display = "";

    sppProgressInterval = setInterval(async () => {
      const s = await chrome.storage.local.get(SPP_ASSIGN_PROGRESS_KEY);
      const p = s[SPP_ASSIGN_PROGRESS_KEY];
      if (!p) return;

      const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
      if (fillEl) fillEl.style.width = pct + "%";
      if (textEl) textEl.textContent = p.message || "";

      if (errEl) {
        if (p.errors?.length) {
          errEl.style.display = "";
          errEl.innerHTML = p.errors.map(e =>
            `<div>⚠ ${e.employee || "?"}: ${e.error}</div>`).join("");
        } else {
          errEl.style.display = "none";
        }
      }

      if (!p.active) sppStopProgressPolling();
    }, 800);
  }

  function sppStopProgressPolling() {
    if (sppProgressInterval) { clearInterval(sppProgressInterval); sppProgressInterval = null; }
  }

  // ── Download log ────────────────────────────────────────────────────────────

  document.getElementById("sppAssignDownloadLog")?.addEventListener("click", async () => {
    const s = await chrome.storage.local.get(SPP_ASSIGN_LOG_KEY);
    const log = s[SPP_ASSIGN_LOG_KEY];
    if (!log?.entries?.length) return;

    const lines = [`# SPP Assign Log — ${log.startedAt || "?"}\n`];
    for (const e of log.entries) {
      if (e.action === "summary") {
        lines.push(`\n## Shrnutí\n${e.result}`);
      } else {
        const detail = e.detail ? ` — ${e.detail}` : "";
        const client = e.client ? ` / ${e.client}` : "";
        lines.push(`- [${e.ts}] **${e.employee}**${client} → ${e.action}: ${e.result}${detail}`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `spp-assign-log-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  void sppLoadRoles();

})();
