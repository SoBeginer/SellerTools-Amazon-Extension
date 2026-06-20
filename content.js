(() => {
  const isAmazon = /amazon\./.test(window.location.hostname);
  const isRetool = window.location.hostname === "expandoadmin.retool.com";
  if (!isAmazon && !isRetool) return;

  // ── Console log capture ──────────────────────────────────────────────────
  // When enabled (via storage), intercepts console.log/warn/error and sends
  // entries to background for download at the end of each feature run.
  (function installLogCapture() {
    const methods = ["log", "warn", "error"];
    methods.forEach((method) => {
      const original = console[method].bind(console);
      console[method] = function (...args) {
        original(...args);
        chrome.storage.local.get("captureLogsEnabled").then((r) => {
          if (!r.captureLogsEnabled) return;
          const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
          const text = args.map((a) => {
            try { return typeof a === "object" ? JSON.stringify(a) : String(a); }
            catch { return String(a); }
          }).join(" ");
          chrome.runtime.sendMessage({
            type: "LOG_ENTRY",
            entry: `${ts} [${method.toUpperCase()}] ${text}`,
          }).catch(() => {});
        });
      };
    });
  })();

  const draftsPathname = "/myinventory/inventory/views/drafts";
  const draftsSubview = "submitted-missing-info";
  const ibaSearchWaitMs = 25000;
  const ibaConfirmWaitMs = 15000;
  const ibaAutoStartDelayMs = 1500;
  const ibaRetoolResultWaitMs = 12000;  // max wait per attempt for a settled result
  const ibaRetoolPollMs = 250;
  const ibaRetoolInitDelayMs = 900;     // wait after UI found before first search (React init)
  const ibaRetoolInputSettleMs = 450;   // wait after typing before clicking search (React debounce)
  const ibaRetoolMaxRetries = 2;        // max retries per order before giving up
  const ibaAmazonListUrl = "https://sellercentral.amazon.de/orders-v3/mfn/unshipped?orderType=IBA&orderStatus=unshipped&fulfillmentType=mfn&page=1&date-range=last-30&pageSize=250";
  const ibaAmazonStartUrl = `${ibaAmazonListUrl}&_ibaStart=1`;
  const ibaRetoolUrl = "https://expandoadmin.retool.com/apps/6bead31a-73e4-11ee-9733-d7e6a0480985/Fulfillment%20lookup";
  const draftFeedRetoolWaitMs = 25000;
  const dryRunStorageKey = "seller_extension_dry_run_v1";

  if (window.__sellerExtensionContentInitialized) {
    return;
  }

  window.__sellerExtensionContentInitialized = true;

  function ibaLog(...args) {
    console.log("[IBA]", ...args);
  }

  function draftLog(...args) {
    console.log("[DraftFeed]", ...args);
  }

  function marketLog(...args) {
    console.log("[MarketSwitcher]", ...args);
  }

  function ibaSleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function isDryRunEnabled() {
    try {
      const result = await chrome.storage.sync.get(dryRunStorageKey);
      return result[dryRunStorageKey] === true;
    } catch {
      return false;
    }
  }

  function ibaEncodeState(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  }

  function ibaDecodeState(encodedValue) {
    try {
      return JSON.parse(decodeURIComponent(escape(atob(encodedValue))));
    } catch (error) {
      ibaLog("Failed to decode URL state.", error);
      return null;
    }
  }

  function ibaNavigate(url) {
    ibaLog("Navigating to", url);
    window.location.href = url;
  }

  function ibaSetReactInputValue(element, value) {
    if (!element) {
      return;
    }

    const prototype = element instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (typeof setter === "function") {
      setter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ibaSetSelectValue(element, value) {
    if (!element) {
      return false;
    }

    const option = Array.from(element.options || []).find((item) => {
      return item.value === value || item.textContent?.trim() === value;
    });

    const nextValue = option?.value ?? value;

    if (element.value === nextValue) {
      return true;
    }

    element.value = nextValue;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return element.value === nextValue;
  }

  function ibaRemoveExistingDialog() {
    const existing = document.getElementById("iba-confirm-overlay");

    if (existing) {
      existing.remove();
    }
  }

  function ibaIsValidTrackingNumber(value) {
    const tracking = String(value || "").trim();

    if (!tracking || tracking.length < 8 || tracking.length > 64) {
      return false;
    }

    if (/[\s<>{}\[\]]/.test(tracking)) {
      return false;
    }

    if (
      /^numberoutput--\d+$/i.test(tracking) ||
      /^textoutput--\d+$/i.test(tracking) ||
      /^tracking(number)?$/i.test(tracking) ||
      /^undefined$/i.test(tracking) ||
      /^null$/i.test(tracking) ||
      /^n\/?a$/i.test(tracking)
    ) {
      return false;
    }

    return /[a-z0-9]/i.test(tracking);
  }

  function ibaWaitForElement(selector, timeoutMs) {
    const existing = document.querySelector(selector);

    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timed out waiting for ${selector}`));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);

        if (!element) {
          return;
        }

        window.clearTimeout(timeoutId);
        observer.disconnect();
        resolve(element);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }

  function ibaGetPhase(url = new URL(window.location.href)) {
    if (url.hostname === "expandoadmin.retool.com" && url.searchParams.has("_draftFeed")) {
      return "DRAFT_FEED";
    }

    if (url.pathname.includes("/confirm-shipment") && url.searchParams.has("_ibaQueue")) {
      return "CONFIRM_ONE";
    }

    if (url.searchParams.has("_ibaResults")) {
      return "START_QUEUE";
    }

    // RETOOL_SEARCH is detected via storage (see ibaRunCurrentPhase)

    if (url.searchParams.has("_ibaQueue")) {
      return "NEXT_IN_QUEUE";
    }

    if (
      /amazon\./.test(url.hostname) &&
      url.searchParams.get("orderType") === "IBA" &&
      url.searchParams.get("_ibaStart") === "1"
    ) {
      return "COLLECT";
    }

    return null;
  }

  async function notifyBackgroundWhenReady() {
    const url = new URL(window.location.href);

    if (
      url.pathname !== draftsPathname ||
      url.searchParams.get("subview") !== draftsSubview
    ) {
      return;
    }

    if (document.readyState !== "complete") {
      await new Promise((resolve) => {
        window.addEventListener("load", resolve, { once: true });
      });
    }

    chrome.runtime.sendMessage({
      type: "PAGE_READY",
      pageType: "drafts"
    });
  }

  async function marketFetchJson(path) {
    const response = await fetch(path, {
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status}`);
    }

    return response.json();
  }

  async function marketFetchCurrentAccountMarkets() {
    // Step 1: get current context (which seller + which market is active)
    const currentResponse = await marketFetchJson(
      "/account-switcher/global-and-regional-account/merchantMarketplace"
    );
    marketLog("API currentResponse:", JSON.stringify(currentResponse));

    const globalAccountId = currentResponse?.globalAccount?.id;
    const parentGlobalAccountId = currentResponse?.parentGlobalAccount?.id;
    const delegationContext = currentResponse?.globalAccount?.delegationContext || "";
    const delegationContextWithTarget = currentResponse?.globalAccount?.delegationContextWithTargetPartnerAccount || "";
    const currentMcid = currentResponse?.regionalAccount?.ids?.mons_sel_dir_mcid || "";
    const currentMkid = currentResponse?.regionalAccount?.ids?.mons_sel_mkid || "";

    let markets = [];

    function parseRegionalItems(regionalData, fallbackGlobalId) {
      const items = Array.isArray(regionalData)
        ? regionalData
        : Array.isArray(regionalData?.regionalAccounts)
          ? regionalData.regionalAccounts
          : [];
      return items
        .filter((r) => r?.ids?.mons_sel_mkid)
        .map((r) => ({
          label: r.label || r.domain || "—",
          domain: r.domain || window.location.hostname,
          ids: {
            mons_sel_mkid: r.ids.mons_sel_mkid,
            mons_sel_dir_mcid: r.ids.mons_sel_dir_mcid || currentMcid,
          },
          globalAccountId: r.globalAccountId || fallbackGlobalId,
        }));
    }

    async function tryFetchRegional(globalId, extra = {}) {
      const params = new URLSearchParams({ globalAccountId: globalId, ...extra });
      const data = await marketFetchJson(
        `/account-switcher/regional-accounts/merchantMarketplace?${params}`
      );
      marketLog(`regional API [${JSON.stringify(extra)}] response:`, JSON.stringify(data));
      return parseRegionalItems(data, globalAccountId);
    }

    // Step 2: try progressively more specific combinations until we get markets
    const attempts = [
      // Plain globalAccountId (works for standalone accounts)
      () => tryFetchRegional(globalAccountId),
      // With plain delegationContext (works for agency sub-accounts)
      delegationContext
        ? () => tryFetchRegional(globalAccountId, { delegationContext })
        : null,
      // With delegationContextWithTargetPartnerAccount
      delegationContextWithTarget
        ? () => tryFetchRegional(globalAccountId, { delegationContext: delegationContextWithTarget })
        : null,
      // Parent global account ID (last resort)
      parentGlobalAccountId
        ? () => tryFetchRegional(parentGlobalAccountId)
        : null,
      // Parent ID + plain delegationContext
      (parentGlobalAccountId && delegationContext)
        ? () => tryFetchRegional(parentGlobalAccountId, { delegationContext })
        : null,
    ].filter(Boolean);

    for (const attempt of attempts) {
      if (markets.length > 0) break;
      try {
        markets = await attempt();
        marketLog("markets found:", markets.length);
      } catch (err) {
        marketLog("attempt failed:", err.message);
      }
    }

    // Step 3: fallback — show at least the current market from the URL / first API response
    if (markets.length === 0) {
      marketLog("falling back to current market only");
      const cur = currentResponse?.regionalAccount;
      const urlParams = new URLSearchParams(window.location.search);
      markets = cur ? [{
        label: cur.label || currentResponse?.globalAccount?.label || "Current market",
        domain: window.location.hostname,
        ids: {
          mons_sel_mkid: currentMkid || urlParams.get("mons_sel_mkid") || "",
          mons_sel_dir_mcid: currentMcid || urlParams.get("mons_sel_dir_mcid") || "",
        },
        globalAccountId: globalAccountId || urlParams.get("mons_sel_dir_paid") || "",
      }] : [];
    }

    return {
      hostname: window.location.hostname,
      current: currentResponse || {},
      globalAccounts: [],
      standaloneRegionalAccounts: markets,
      regionalAccountsByGlobalId: {},
    };
  }


  // Extract the best available label from an account object (Amazon uses varying field names)
  function accountLabel(obj) {
    return obj?.label || obj?.name || obj?.accountName || obj?.displayName || obj?.sellerName || null;
  }

  async function accountFetchAll() {
    const currentResp = await marketFetchJson(
      "/account-switcher/global-and-regional-account/merchantMarketplace"
    );

    const currentGlobal = currentResp?.globalAccount || null;
    const parentGlobal  = currentResp?.parentGlobalAccount || null;
    const mkid = currentResp?.regionalAccount?.ids?.mons_sel_mkid || "";

    return {
      current:  currentGlobal ? { id: currentGlobal.id, label: accountLabel(currentGlobal) } : null,
      parentId: parentGlobal?.id || null,
      mkid,
    };
  }

  function marketGetSwitchUrl(regionalAccount) {
    const domain = regionalAccount?.domain || window.location.hostname;
    const mkid = regionalAccount?.ids?.mons_sel_mkid || "";
    const mcid = regionalAccount?.ids?.mons_sel_dir_mcid || "";
    const globalAccountId = regionalAccount?.globalAccountId || "";
    const url = new URL(`https://${domain}/home`);
    url.searchParams.set("mons_sel_mkid", mkid);
    url.searchParams.set("mons_sel_dir_mcid", mcid);

    if (globalAccountId) {
      url.searchParams.set("mons_sel_dir_paid", globalAccountId);
    }

    url.searchParams.set("ignore_selection_changed", "true");
    return url.toString();
  }

  function marketIsRegionalActive(regionalAccount, activeRegionalAccount) {
    return regionalAccount?.ids?.mons_sel_mkid === activeRegionalAccount?.ids?.mons_sel_mkid &&
      regionalAccount?.ids?.mons_sel_dir_mcid === activeRegionalAccount?.ids?.mons_sel_dir_mcid;
  }

  const pricingIssuePathname = "/myinventory/inventory";
  const pricingIssueStatus = "pricing_issue";
  const pricingFixerStartParam = "_pricingFixerStart";
  const b2bFixerStartParam = "_b2bFixerStart";
  const pricingFixerSessionKey = "seller_extension_pricing_fixer_state_v1";
  const pricingFixerConfig = {
    TARGET_PAGE_SIZE: 250,
    PAGE_DELAY_MS: 5000,
    SAVE_DELAY_MS: 10000,
    RETRY_WAIT_MS: 20000,
    MAX_RETRIES: 3,
    SCROLL_WAIT_MS: 900,
    SCROLL_MAX_ROUNDS: 40,
    SCROLL_STABLE_ROUNDS: 5,
    DRY_RUN: false
  };
  const pricingFixerState = {
    running: false,
    stopRequested: false,
    startScheduled: false
  };

  function pricingLog(...args) {
    console.log("[PricingFixer]", ...args);
  }

  function pricingGetUrl(url = new URL(window.location.href)) {
    return url;
  }

  function pricingGetTargetUrl(pageNumber = 1) {
    const url = new URL("https://sellercentral.amazon.de/myinventory/inventory");
    url.searchParams.set("fulfilledBy", "all");
    url.searchParams.set("page", String(pageNumber));
    url.searchParams.set("pageSize", String(pricingFixerConfig.TARGET_PAGE_SIZE));
    url.searchParams.set("sort", "sales_desc");
    url.searchParams.set("status", pricingIssueStatus);
    url.searchParams.set(pricingFixerStartParam, "1");
    return url.toString();
  }

  function pricingIsTargetPage(url = pricingGetUrl()) {
    return (
      url.hostname === "sellercentral.amazon.de" &&
      url.pathname === pricingIssuePathname &&
      url.searchParams.get("status") === pricingIssueStatus
    );
  }

  function pricingGetSessionState() {
    try {
      const raw = window.sessionStorage.getItem(pricingFixerSessionKey);
      return raw ? JSON.parse(raw) : { active: false };
    } catch {
      return { active: false };
    }
  }

  function pricingSetSessionState(nextState) {
    window.sessionStorage.setItem(pricingFixerSessionKey, JSON.stringify(nextState));
  }

  function pricingClearSessionState() {
    window.sessionStorage.removeItem(pricingFixerSessionKey);
  }

  function pricingRequestStop() {
    pricingFixerState.stopRequested = true;
    pricingClearSessionState();
  }

  function pricingGetPagination() {
    return document.querySelector("kat-pagination");
  }

  function pricingGetPaginationInfo() {
    const pagination = pricingGetPagination();
    const url = pricingGetUrl();
    const currentPage = Number.parseInt(pagination?.getAttribute("page") || url.searchParams.get("page") || "1", 10);
    const itemsPerPage = Number.parseInt(
      pagination?.getAttribute("items-per-page") || url.searchParams.get("pageSize") || String(pricingFixerConfig.TARGET_PAGE_SIZE),
      10
    );
    const totalItems = Number.parseInt(pagination?.getAttribute("total-items") || "0", 10);
    const totalPages = totalItems > 0 && itemsPerPage > 0
      ? Math.max(1, Math.ceil(totalItems / itemsPerPage))
      : Math.max(1, currentPage || 1);

    return {
      currentPage: Number.isNaN(currentPage) ? 1 : currentPage,
      itemsPerPage: Number.isNaN(itemsPerPage) ? pricingFixerConfig.TARGET_PAGE_SIZE : itemsPerPage,
      totalItems: Number.isNaN(totalItems) ? 0 : totalItems,
      totalPages
    };
  }

  function pricingNormalizePrice(value) {
    const raw = String(value || "").trim().replace(/\s/g, "").replace(/[^\d,.-]/g, "");

    if (!raw) {
      return Number.NaN;
    }

    if (raw.includes(",") && raw.includes(".")) {
      if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
        return Number.parseFloat(raw.replace(/\./g, "").replace(",", "."));
      }

      return Number.parseFloat(raw.replace(/,/g, ""));
    }

    if (raw.includes(",")) {
      return Number.parseFloat(raw.replace(",", "."));
    }

    return Number.parseFloat(raw);
  }

  function pricingFormatPrice(value) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function pricingNormalizeLabel(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function pricingGetLabelType(label) {
    const normalized = pricingNormalizeLabel(label);

    if (!normalized) {
      return null;
    }

    if (
      normalized.includes("maximum price") ||
      normalized.includes("max price") ||
      normalized.includes("highest price") ||
      normalized.includes("maximumpreis") ||
      normalized.includes("maximalpreis") ||
      normalized.includes("höchstpreis")
    ) {
      return "max";
    }

    if (
      normalized.includes("minimum price") ||
      normalized.includes("min price") ||
      normalized.includes("lowest price") ||
      normalized.includes("minimumpreis") ||
      normalized.includes("minimalpreis") ||
      normalized.includes("mindestpreis")
    ) {
      return "min";
    }

    if (
      normalized === "price" ||
      normalized.includes("your price") ||
      normalized.includes("listing price") ||
      normalized.includes("preis")
    ) {
      return "price";
    }

    return null;
  }

  function pricingFindProductContainers() {
    return Array.from(document.querySelectorAll('[class*="VolusPriceInputComposite-module__container--"]'));
  }

  async function pricingLoadFullPage() {
    let lastCount = 0;
    let lastHeight = 0;
    let stableRounds = 0;
    const pageInfo = pricingGetPaginationInfo();
    const expectedCount = Math.min(pageInfo.itemsPerPage, pageInfo.totalItems || pageInfo.itemsPerPage);

    for (let round = 0; round < pricingFixerConfig.SCROLL_MAX_ROUNDS; round += 1) {
      const containers = pricingFindProductContainers();
      const currentCount = containers.length;
      const currentHeight = Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0
      );

      pricingLog(`Lazy load scan ${round + 1}: ${currentCount} containers, height ${currentHeight}.`);

      if (currentCount === lastCount && currentHeight === lastHeight) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      lastCount = currentCount;
      lastHeight = currentHeight;

      if (currentCount >= expectedCount) {
        pricingLog(`Reached expected container count ${currentCount}/${expectedCount}.`);
        break;
      }

      if (stableRounds >= pricingFixerConfig.SCROLL_STABLE_ROUNDS) {
        break;
      }

      window.scrollTo(0, currentHeight);
      document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key: "End", code: "End", keyCode: 35, which: 35, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "End", code: "End", keyCode: 35, which: 35, bubbles: true }));
      await ibaSleep(pricingFixerConfig.SCROLL_WAIT_MS);
    }

    window.scrollTo(0, 0);
    await ibaSleep(600);
  }

  async function pricingWaitForProducts(timeoutMs = 30000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const containers = pricingFindProductContainers();

      if (containers.length > 0) {
        pricingLog(`Detected ${containers.length} pricing containers.`);
        return containers;
      }

      await ibaSleep(500);
    }

    throw new Error("Timed out waiting for pricing issue products.");
  }

  function pricingGetProductTitle(container, index) {
    const productScope = container.closest('[role="row"], tr, [data-row-id], [class*="ListingRow"], [class*="listing-row"]') || container.parentElement || container;
    const anchor = productScope?.querySelector('a[href*="/dp/"], a[href*="/product/"], a[href*="/inventory"]');

    if (anchor?.textContent?.trim()) {
      return anchor.textContent.trim();
    }

    const titleCandidate = Array.from(
      container.closest('[role="row"], tr, [data-row-id]')?.querySelectorAll("a, span, div") || []
    ).find((element) => {
      const text = element.textContent?.trim() || "";
      return text.length > 8 && !/^price$/i.test(text) && !/^minimum price$/i.test(text) && !/^maximum price$/i.test(text);
    });

    return titleCandidate?.textContent?.trim() || `Product ${index + 1}`;
  }

  function pricingGetProductScope(container) {
    return container.closest('[role="row"], tr, [data-row-id], [class*="ListingRow"], [class*="listing-row"]') || container.parentElement || container;
  }

  function pricingCollectPriceRows(scope) {
    return Array.from(scope.querySelectorAll('[class*="priceInputRow"]'));
  }

  function pricingGetRowMap(scope) {
    const rows = pricingCollectPriceRows(scope);
    const rowMap = {};

    rows.forEach((row) => {
      const label = row.children?.[0]?.textContent?.trim() || "";
      const labelType = pricingGetLabelType(label);

      if (labelType) {
        rowMap[labelType] = row;
      }
    });

    return rowMap;
  }

  function pricingGetKatInput(row) {
    return row?.querySelector('kat-input[class*="CellInput"], kat-input') || null;
  }

  function pricingGetKatInputValue(katInput) {
    if (!katInput) {
      return "";
    }

    const shadowInput = katInput.shadowRoot?.querySelector("input");

    return (
      shadowInput?.value ||
      katInput.value ||
      katInput.getAttribute("value") ||
      ""
    );
  }

  function pricingSetKatInputValue(katInput, newValue) {
    const shadowInput = katInput?.shadowRoot?.querySelector("input");

    if (!shadowInput) {
      throw new Error("Pricing input shadow DOM not found.");
    }

    // Focus the shadow input so execCommand targets it
    shadowInput.focus();

    // Select all existing text so insertText replaces it entirely
    shadowInput.setSelectionRange(0, shadowInput.value.length);

    // execCommand generates a trusted InputEvent (isTrusted: true) which kat-input's
    // internal handler accepts — this is what triggers the React state change and
    // makes the "Save all" button appear.
    const inserted = document.execCommand("insertText", false, newValue);

    if (!inserted) {
      // Fallback for browsers where execCommand is unavailable
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (typeof nativeSetter === "function") {
        nativeSetter.call(shadowInput, newValue);
      } else {
        shadowInput.value = newValue;
      }
      shadowInput.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText" }));
      shadowInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    // Keep kat-input host attributes in sync
    katInput.value = newValue;
    katInput.setAttribute("value", newValue);

    // Dispatch events on the kat-input host element using multiple formats
    // Katal typically fires CustomEvent("change", { detail: { value } }) on the host
    katInput.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: newValue } }));
    katInput.dispatchEvent(new CustomEvent("input", { bubbles: true, composed: true, detail: { value: newValue } }));
    katInput.dispatchEvent(new CustomEvent("kat-change", { bubbles: true, composed: true, detail: { value: newValue } }));

    shadowInput.blur();
    shadowInput.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
    katInput.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));
  }

  function pricingExtractProductChange(container, index) {
    const productScope = pricingGetProductScope(container);
    const rowMap = {
      ...pricingGetRowMap(productScope),
      ...pricingGetRowMap(container)
    };
    const priceInput = pricingGetKatInput(rowMap.price);
    const minInput = pricingGetKatInput(rowMap.min);
    const maxInput = pricingGetKatInput(rowMap.max);
    const currentPriceRaw = pricingGetKatInputValue(priceInput);
    const currentPrice = pricingNormalizePrice(currentPriceRaw);

    if (!priceInput || !minInput || !maxInput || Number.isNaN(currentPrice) || currentPrice <= 0) {
      const availableLabels = pricingCollectPriceRows(productScope).map((row) => {
        return row.children?.[0]?.textContent?.trim() || "(missing)";
      });
      pricingLog(`Skipping container ${index + 1}.`, {
        hasPriceInput: Boolean(priceInput),
        hasMinInput: Boolean(minInput),
        hasMaxInput: Boolean(maxInput),
        currentPriceRaw: currentPriceRaw || null,
        currentPriceParsed: currentPrice,
        labels: availableLabels
      });
      return null;
    }

    const nextMin = currentPrice * 0.5;
    const nextMax = currentPrice * 2;

    return {
      title: pricingGetProductTitle(container, index),
      currentPrice,
      currentPriceFormatted: pricingFormatPrice(currentPrice),
      nextMin,
      nextMax,
      nextMinFormatted: pricingFormatPrice(nextMin),
      nextMaxFormatted: pricingFormatPrice(nextMax),
      minInput,
      maxInput
    };
  }

  function pricingFindSaveButton() {
    return document.querySelector('kat-button[label="Save all"]');
  }

  function pricingIsButtonDisabled(button) {
    if (!button) {
      return true;
    }

    return (
      button.disabled === true ||
      button.hasAttribute("disabled") ||
      button.getAttribute("aria-disabled") === "true"
    );
  }

  function pricingFindCancelButton() {
    return Array.from(document.querySelectorAll('kat-button[label="Cancel"]')).find((button) => {
      return !String(button.className || "").includes("katHmd");
    }) || null;
  }

  function pricingHasTooManyRequests() {
    const text = document.body?.innerText?.toLowerCase() || "";
    return text.includes("too many requests") || text.includes("request limit") || text.includes("rate exceeded");
  }

  function pricingRemoveModal() {
    document.getElementById("seller-extension-pricing-fixer-overlay")?.remove();
  }

  function pricingShowConfirmationModal({ currentPage, totalPages, changes }) {
    pricingRemoveModal();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "seller-extension-pricing-fixer-overlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "24px";
      overlay.style.background = "rgba(15, 23, 42, 0.55)";

      const dialog = document.createElement("div");
      dialog.style.width = "min(1080px, 96vw)";
      dialog.style.maxHeight = "85vh";
      dialog.style.display = "flex";
      dialog.style.flexDirection = "column";
      dialog.style.background = "#ffffff";
      dialog.style.borderRadius = "16px";
      dialog.style.boxShadow = "0 24px 60px rgba(15, 23, 42, 0.28)";
      dialog.style.overflow = "hidden";

      const header = document.createElement("div");
      header.style.padding = "18px 20px";
      header.style.borderBottom = "1px solid #e5e7eb";
      header.innerHTML = `
        <div style="font-size:18px;font-weight:700;color:#111827;">Pricing Issue Fixer</div>
        <div style="margin-top:4px;font-size:13px;color:#4b5563;">Page ${currentPage} / ${totalPages} · ${changes.length} products ready for update</div>
      `;

      const body = document.createElement("div");
      body.style.padding = "0 20px 20px";
      body.style.overflow = "auto";

      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.fontSize = "13px";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="position:sticky;top:0;background:#ffffff;text-align:left;padding:12px 8px;border-bottom:1px solid #d1d5db;">Product</th>
            <th style="position:sticky;top:0;background:#ffffff;text-align:right;padding:12px 8px;border-bottom:1px solid #d1d5db;">Current price</th>
            <th style="position:sticky;top:0;background:#ffffff;text-align:right;padding:12px 8px;border-bottom:1px solid #d1d5db;">New min price</th>
            <th style="position:sticky;top:0;background:#ffffff;text-align:right;padding:12px 8px;border-bottom:1px solid #d1d5db;">New max price</th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement("tbody");

      changes.forEach((change) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;color:#111827;">${change.title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#111827;">${change.currentPriceFormatted}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#111827;">${change.nextMinFormatted}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #f3f4f6;text-align:right;color:#111827;">${change.nextMaxFormatted}</td>
        `;
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      body.appendChild(table);

      const footer = document.createElement("div");
      footer.style.display = "flex";
      footer.style.justifyContent = "flex-end";
      footer.style.gap = "12px";
      footer.style.padding = "16px 20px 20px";
      footer.style.borderTop = "1px solid #e5e7eb";

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.textContent = "💾 Uložit tuto stránku";
      saveButton.style.cssText = "height:40px;padding:0 16px;border:0;border-radius:10px;background:#2563eb;color:#ffffff;font-weight:600;cursor:pointer;";

      const skipButton = document.createElement("button");
      skipButton.type = "button";
      skipButton.textContent = "⏭️ Přeskočit stránku";
      skipButton.style.cssText = "height:40px;padding:0 16px;border:0;border-radius:10px;background:#e5e7eb;color:#111827;font-weight:600;cursor:pointer;";

      const stopButton = document.createElement("button");
      stopButton.type = "button";
      stopButton.textContent = "🛑 Zastavit skript";
      stopButton.style.cssText = "height:40px;padding:0 16px;border:0;border-radius:10px;background:#dc2626;color:#ffffff;font-weight:600;cursor:pointer;";

      const closeWith = (action) => {
        pricingRemoveModal();
        resolve(action);
      };

      saveButton.addEventListener("click", () => closeWith("save"));
      skipButton.addEventListener("click", () => closeWith("skip"));
      stopButton.addEventListener("click", () => closeWith("stop"));

      footer.append(stopButton, skipButton, saveButton);
      dialog.append(header, body, footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }

  function pricingApplyChanges(changes) {
    changes.forEach((change) => {
      pricingSetKatInputValue(change.minInput, change.nextMinFormatted);
      pricingSetKatInputValue(change.maxInput, change.nextMaxFormatted);
    });
  }

  async function pricingWaitForSaveReady(timeoutMs = 20000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const saveButton = pricingFindSaveButton();

      if (saveButton && !pricingIsButtonDisabled(saveButton)) {
        return saveButton;
      }

      await ibaSleep(200);
    }

    return null;
  }

  async function pricingSaveChanges(changes) {
    for (let attempt = 1; attempt <= pricingFixerConfig.MAX_RETRIES; attempt += 1) {
      if (pricingFixerConfig.DRY_RUN) {
        pricingLog(`Dry run active. Save suppressed for page attempt ${attempt}.`);
        return;
      }

      pricingApplyChanges(changes);
      const saveButton = await pricingWaitForSaveReady();

      if (!saveButton) {
        throw new Error("Save all button did not become active after editing prices.");
      }

      pricingLog(`Saving page. Attempt ${attempt}/${pricingFixerConfig.MAX_RETRIES}.`);
      window.scrollTo(0, 0);
      await ibaSleep(300);
      const shadowBtn = saveButton.shadowRoot?.querySelector("button");
      (shadowBtn || saveButton).click();
      await ibaSleep(pricingFixerConfig.SAVE_DELAY_MS);

      if (!pricingHasTooManyRequests()) {
        pricingLog("Save completed without rate-limit error.");
        return;
      }

      pricingLog("Rate limit detected after save attempt.");

      if (attempt < pricingFixerConfig.MAX_RETRIES) {
        await ibaSleep(pricingFixerConfig.RETRY_WAIT_MS);
      }
    }

    throw new Error("Save failed after maximum retries due to rate limit.");
  }

  async function pricingMoveToNextPage(currentPage) {
    const nextPage = currentPage + 1;
    const url = pricingGetUrl();

    pricingSetSessionState({
      active: true,
      startedAt: Date.now()
    });

    await ibaSleep(pricingFixerConfig.PAGE_DELAY_MS);

    url.searchParams.set("page", String(nextPage));
    url.searchParams.set("pageSize", String(pricingFixerConfig.TARGET_PAGE_SIZE));
    url.searchParams.set("status", pricingIssueStatus);
    url.searchParams.set(pricingFixerStartParam, "1");
    window.location.href = url.toString();
  }

  async function pricingEnsureTargetPageShape() {
    const url = pricingGetUrl();

    if (!pricingIsTargetPage(url) || url.searchParams.get("pageSize") !== String(pricingFixerConfig.TARGET_PAGE_SIZE)) {
      const nextPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
      pricingSetSessionState({
        active: true,
        startedAt: Date.now()
      });
      window.location.href = pricingGetTargetUrl(Number.isNaN(nextPage) ? 1 : nextPage);
      return false;
    }

    return true;
  }

  async function pricingRunFixer() {
    if (pricingFixerState.running) {
      pricingLog("Pricing fixer is already running on this page.");
      return;
    }

    pricingFixerState.running = true;
    pricingFixerState.stopRequested = false;

    try {
      const isReadyToRun = await pricingEnsureTargetPageShape();

      if (!isReadyToRun) {
        return;
      }

      pricingSetSessionState({
        active: true,
        startedAt: Date.now()
      });

      pricingLog("Waiting for products.");
      await pricingWaitForProducts();
      await pricingLoadFullPage();
      const containers = pricingFindProductContainers();
      const changes = containers
        .map((container, index) => pricingExtractProductChange(container, index))
        .filter(Boolean);

      const pageInfo = pricingGetPaginationInfo();
      pricingLog(`Containers detected: ${containers.length}.`);
      pricingLog(`Page ${pageInfo.currentPage}/${pageInfo.totalPages} with ${changes.length} editable products.`);

      if (changes.length === 0) {
        pricingLog("No editable pricing issue products found on this page.");

        if (pageInfo.currentPage < pageInfo.totalPages && !pricingFixerState.stopRequested) {
          await pricingMoveToNextPage(pageInfo.currentPage);
          return;
        }

        pricingClearSessionState();
        pricingLog("Pricing fixer finished. No more pages to process.");
        void chrome.runtime.sendMessage({ type: "PRICING_FIXER_DONE" }).catch(() => {});
        return;
      }

      await pricingSaveChanges(changes);

      if (pricingFixerState.stopRequested) {
        pricingRequestStop();
        return;
      }

      if (pageInfo.currentPage < pageInfo.totalPages) {
        await pricingMoveToNextPage(pageInfo.currentPage);
        return;
      }

      pricingClearSessionState();
      pricingLog("Pricing fixer completed all pages.");
      void chrome.runtime.sendMessage({ type: "PRICING_FIXER_DONE" }).catch(() => {});
    } catch (error) {
      pricingLog("Pricing fixer failed.", error);
      pricingRequestStop();
      throw error;
    } finally {
      pricingFixerState.running = false;
      pricingFixerState.startScheduled = false;
    }
  }

  function pricingScheduleAutoStart(reason) {
    if (pricingFixerState.running || pricingFixerState.startScheduled) {
      return;
    }

    pricingFixerState.startScheduled = true;
    pricingLog(`Scheduling start: ${reason}.`);
    window.setTimeout(() => {
      void pricingRunFixer().catch((error) => {
        pricingLog("Unhandled pricing fixer error.", error);
      });
    }, 800);
  }

  function draftGetMarketplaceLabel(value) {
    const source = String(value || "").trim().toLowerCase();
    const mappings = {
      de: "Germany",
      germany: "Germany",
      uk: "United Kingdom",
      "united kingdom": "United Kingdom",
      fr: "France",
      france: "France",
      it: "Italy",
      italy: "Italy",
      es: "Spain",
      spain: "Spain",
      nl: "Netherlands",
      netherlands: "Netherlands",
      pl: "Poland",
      poland: "Poland",
      se: "Sweden",
      sweden: "Sweden",
      be: "Belgium",
      belgium: "Belgium",
      us: "United States",
      "united states": "United States",
      ca: "Canada",
      canada: "Canada"
    };

    return mappings[source] || String(value || "").trim() || "Germany";
  }

  function draftGetMarketplaceTreeConfig(countryLabel) {
    const normalized = String(countryLabel || "").trim().toLowerCase();
    const mappings = {
      germany: { group: "Europe", leaf: "DE" },
      france: { group: "Europe", leaf: "FR" },
      italy: { group: "Europe", leaf: "IT" },
      spain: { group: "Europe", leaf: "ES" },
      netherlands: { group: "Europe", leaf: "NL" },
      poland: { group: "Europe", leaf: "PL" },
      sweden: { group: "Europe", leaf: "SE" },
      belgium: { group: "Europe", leaf: "BE" },
      "united kingdom": { group: "Europe", leaf: "UK" },
      ireland: { group: "Europe", leaf: "IE" },
      "united states": { group: "America", leaf: "US" },
      canada: { group: "America", leaf: "CA" },
      mexico: { group: "America", leaf: "MX" },
      brazil: { group: "America", leaf: "BR" },
      turkey: { group: "Europe", leaf: "TR" },
      japan: { group: "Far East", leaf: "JP" },
      australia: { group: "Far East", leaf: "AU" },
      singapore: { group: "Far East", leaf: "SG" },
      "united arab emirates": { group: "Far East", leaf: "AE" },
      egypt: { group: "Far East", leaf: "EG" }
    };

    return mappings[normalized] || null;
  }

  function draftFindClickableByText(text) {
    const target = String(text || "").trim().toLowerCase();

    return Array.from(document.querySelectorAll("button, [role='button'], div, span, p")).find((element) => {
      const value = element.textContent?.trim().toLowerCase();

      if (value !== target) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function draftFindElementContainingText(text) {
    const target = String(text || "").trim().toLowerCase();

    return Array.from(document.querySelectorAll("button, [role='button'], div, span, p")).find((element) => {
      const value = element.textContent?.trim().toLowerCase() || "";
      const rect = element.getBoundingClientRect();
      return value.includes(target) && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function draftGetTextOccurrenceCount(text) {
    const target = String(text || "").trim().toLowerCase();

    if (!target) {
      return 0;
    }

    return Array.from(document.querySelectorAll("div, span, p, button, a")).filter((element) => {
      const value = element.textContent?.trim().toLowerCase() || "";
      const rect = element.getBoundingClientRect();
      return value.includes(target) && rect.width > 0 && rect.height > 0;
    }).length;
  }

  function draftHasResolvedCompanySearch(email, baselineCount) {
    const nextCount = draftGetTextOccurrenceCount(email);

    if (nextCount > baselineCount) {
      return true;
    }

    const visibleMatch = Array.from(document.querySelectorAll("div, span, a, p")).find((element) => {
      const text = element.textContent?.trim().toLowerCase() || "";
      const rect = element.getBoundingClientRect();
      return text.includes(email.toLowerCase()) && rect.width > 0 && rect.height > 0;
    });

    if (visibleMatch) {
      return true;
    }

    const bodyText = document.body?.innerText?.toLowerCase() || "";

    return bodyText.includes("company id") || bodyText.includes("internal company name");
  }

  async function draftWaitForSearchResolution(email) {
    const baselineCount = draftGetTextOccurrenceCount(email);
    const startedAt = Date.now();
    let stableResolvedRounds = 0;

    while (Date.now() - startedAt < draftFeedRetoolWaitMs) {
      if (draftHasResolvedCompanySearch(email, baselineCount)) {
        stableResolvedRounds += 1;

        if (stableResolvedRounds >= 3) {
          return;
        }
      } else {
        stableResolvedRounds = 0;
      }

      await ibaSleep(250);
    }

    throw new Error(`Retool company search did not resolve for ${email}.`);
  }

  async function draftFillCompanySearchInput(email) {
    const searchInput = await ibaWaitForElement("#inputSearchCompanyByUserAccount--0", draftFeedRetoolWaitMs);

    searchInput.focus();
    ibaSetReactInputValue(searchInput, email);
    searchInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));

    const startedAt = Date.now();

    while (Date.now() - startedAt < 4000) {
      if ((searchInput.value || "").trim().toLowerCase() === email.toLowerCase()) {
        draftLog(`Filled company search input with ${email}.`);
        return searchInput;
      }

      ibaSetReactInputValue(searchInput, email);
      await ibaSleep(250);
    }

    throw new Error(`Failed to populate Retool company search input for ${email}.`);
  }

  async function draftWaitForProductsButton() {
    const startedAt = Date.now();

    while (Date.now() - startedAt < draftFeedRetoolWaitMs) {
      const button = draftFindClickableByText("Products 🆕") || draftFindElementContainingText("products");

      if (button) {
        return button;
      }

      await ibaSleep(250);
    }

    throw new Error("Products tab was not found in Retool.");
  }

  function draftFindTabByLabel(label) {
    const target = String(label || "").trim().toLowerCase();

    return Array.from(document.querySelectorAll('[role="tab"], .ant-tabs-tab')).find((element) => {
      const text = element.textContent?.trim().toLowerCase() || "";
      const rect = element.getBoundingClientRect();
      return text === target && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  async function draftWaitForTab(label) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < draftFeedRetoolWaitMs) {
      const tab = draftFindTabByLabel(label);

      if (tab) {
        return tab;
      }

      await ibaSleep(250);
    }

    throw new Error(`Retool tab was not found: ${label}`);
  }

  async function draftOpenProductUnlistingTab() {
    const productUnlistingTab = await draftWaitForTab("Product Unlisting");
    productUnlistingTab.click();
    await ibaSleep(800);
  }

  async function draftWaitForSubmitButton(email) {
    const startedAt = Date.now();
    const emailLower = String(email || "").trim().toLowerCase();

    while (Date.now() - startedAt < draftFeedRetoolWaitMs) {
      const paragraph = Array.from(document.querySelectorAll("p")).find((item) => {
        const text = item.textContent?.trim().toLowerCase() || "";
        return text.includes("submit feed for") && text.includes(emailLower);
      });

      if (paragraph) {
        const button = paragraph.closest("button, [role='button'], div");

        if (button) {
          return button;
        }
      }

      await ibaSleep(250);
    }

    throw new Error("Submit Feed button was not found in Retool.");
  }

  function draftTrySelectCountry(countryLabel) {
    const draftClickLikeUser = (element) => {
      if (!element) {
        return false;
      }

      element.scrollIntoView({ block: "center", inline: "center" });

      if (typeof element.focus === "function") {
        element.focus({ preventScroll: true });
      }

      const rect = element.getBoundingClientRect();
      const clientX = rect.left + (rect.width || 1) / 2;
      const clientY = rect.top + (rect.height || 1) / 2;
      const targetAtPoint = document.elementFromPoint(clientX, clientY);
      const dispatchTarget = targetAtPoint && element.contains(targetAtPoint) ? targetAtPoint : element;
      const pointerEventNames = ["pointerenter", "pointerover", "pointermove", "pointerdown", "pointerup"];
      const mouseEventNames = ["mouseenter", "mouseover", "mousemove", "mousedown", "mouseup", "click"];

      pointerEventNames.forEach((eventName) => {
        dispatchTarget.dispatchEvent(new PointerEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true
        }));
      });

      mouseEventNames.forEach((eventName) => {
        dispatchTarget.dispatchEvent(new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY
        }));
      });

      if (dispatchTarget !== element) {
        element.dispatchEvent(new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY
        }));
      }

      if (typeof dispatchTarget.click === "function") {
        dispatchTarget.click();
      }

      return true;
    };

    const draftFindMarketplaceField = () => {
      const submitHeading = Array.from(document.querySelectorAll("*")).find((element) => {
        return element.textContent?.trim() === "Submit feeds to unlist products";
      });

      if (submitHeading) {
        const panel = submitHeading.closest("div");
        const candidates = Array.from(panel?.querySelectorAll("div") || []).filter((element) => {
          const text = element.textContent || "";
          return text.includes("Amazon marketplaces") && element.querySelector(".ant-tree");
        });
        const exactWidget = candidates.find((element) => {
          return /\binput-control-component__multiline\b/.test(element.className || "");
        });
        const ancestor = exactWidget || candidates[candidates.length - 1];

        if (ancestor) {
          return ancestor;
        }
      }

      return Array.from(document.querySelectorAll("div")).find((element) => {
        const text = element.textContent || "";
        return text.includes("Amazon marketplaces") && element.querySelector(".ant-tree");
      }) || null;
    };

    const draftIsCheckboxChecked = (checkboxElement) => {
      if (!checkboxElement) {
        return false;
      }

      return (
        checkboxElement.classList?.contains("ant-tree-checkbox-checked") ||
        checkboxElement.getAttribute?.("aria-checked") === "true" ||
        checkboxElement.querySelector?.('input[type="checkbox"]:checked') != null
      );
    };

    const draftTryCheckboxTargets = (targets, checkboxRoot, successLabel) => {
      for (const target of targets.filter(Boolean)) {
        draftLog(`Trying checkbox target for ${successLabel}: ${target.className || target.tagName}`);
        draftClickLikeUser(target);

        if (draftIsCheckboxChecked(checkboxRoot)) {
          draftLog(`${successLabel} selected after click.`);
          return true;
        }
      }

      return false;
    };

    const selects = Array.from(document.querySelectorAll("select"));

    for (const select of selects) {
      const matched = Array.from(select.options || []).find((option) => {
        return option.textContent?.trim().toLowerCase() === countryLabel.toLowerCase();
      });

      if (!matched) {
        continue;
      }

      return ibaSetSelectValue(select, matched.value);
    }

    const directOption = draftFindClickableByText(countryLabel);

    if (directOption) {
      directOption.click();
      return true;
    }

    const dropdownTrigger = draftFindElementContainingText("country") || draftFindElementContainingText("marketplace");

    if (dropdownTrigger) {
      dropdownTrigger.click();
      const delayedOption = draftFindClickableByText(countryLabel);

      if (delayedOption) {
        delayedOption.click();
        return true;
      }
    }

    const treeConfig = draftGetMarketplaceTreeConfig(countryLabel);

    if (treeConfig) {
      draftLog(`Trying tree marketplace selector: ${treeConfig.group} / ${treeConfig.leaf}`);

      const marketplaceContainer = draftFindMarketplaceField() || document;

      const directLeafTitle = Array.from(
        marketplaceContainer.querySelectorAll(".ant-tree-title")
      ).find((element) => {
        const treeRoot = element.closest(".ant-tree");
        const insideMarketplaceField = marketplaceContainer.contains(element);
        return (
          element.textContent?.trim() === treeConfig.leaf &&
          insideMarketplaceField &&
          !!treeRoot
        );
      });

      if (directLeafTitle) {
        const contentWrapper =
          directLeafTitle.closest(".ant-tree-node-content-wrapper") ||
          directLeafTitle.parentElement ||
          null;
        const siblingCheckbox =
          contentWrapper?.previousElementSibling?.classList?.contains("ant-tree-checkbox")
            ? contentWrapper.previousElementSibling
            : null;
        const wrapperCheckbox = contentWrapper?.parentElement?.querySelector?.(":scope > .ant-tree-checkbox") || null;
        const checkboxRoot = siblingCheckbox || wrapperCheckbox;
        const checkboxInner = checkboxRoot?.querySelector(".ant-tree-checkbox-inner") || null;
        const directLeafNode =
          contentWrapper?.closest("li.ant-tree-treenode") ||
          contentWrapper?.parentElement ||
          null;

        if (draftIsCheckboxChecked(checkboxRoot)) {
          draftLog(`Direct leaf ${treeConfig.leaf} already selected.`);
          return true;
        }

        if (checkboxInner || checkboxRoot || contentWrapper || directLeafNode) {
          draftLog(`Selecting direct marketplace leaf ${treeConfig.leaf}.`);
          if (draftTryCheckboxTargets(
            [
              checkboxInner,
              checkboxRoot,
              contentWrapper,
              directLeafTitle,
              directLeafNode
            ],
            checkboxRoot,
            `Direct leaf ${treeConfig.leaf}`
          )) {
            return true;
          }

          return false;
        }

        draftLog(`Direct marketplace leaf ${treeConfig.leaf} found without checkbox.`);
      }

      const treeRoots = Array.from(
        marketplaceContainer.querySelectorAll(".tree-component .ant-tree, .ant-tree")
      ).concat(Array.from(document.querySelectorAll(".tree-component .ant-tree, .ant-tree")));

      const uniqueTreeRoots = treeRoots.filter((root, index) => {
        return root && treeRoots.indexOf(root) === index;
      });

      const getOwnNodeWrapper = (node) => {
        return Array.from(node.children).find((child) => {
          return child.classList?.contains("ant-tree-node-content-wrapper");
        }) || null;
      };

      const getNodeLabel = (node) => {
        const wrapperElement = getOwnNodeWrapper(node);
        const titleElement =
          Array.from(wrapperElement?.children || []).find((child) => child.classList?.contains("ant-tree-title")) ||
          null;
        const titleAttr = wrapperElement?.getAttribute("title") || "";
        const titleText = titleElement?.textContent?.trim() || "";
        const wrapperText = wrapperElement?.textContent?.trim() || "";
        return titleText || titleAttr.trim() || wrapperText;
      };

      const candidateTrees = uniqueTreeRoots
        .map((root) => {
          const nodes = Array.from(root.querySelectorAll(":scope > li.ant-tree-treenode, li.ant-tree-treenode"));
          const labels = nodes.map((node) => getNodeLabel(node)).filter(Boolean);
          return { root, nodes, labels };
        })
        .filter((entry) => entry.nodes.length > 0 && marketplaceContainer.contains(entry.root))
        .sort((a, b) => b.labels.length - a.labels.length);

      const treeEntry =
        candidateTrees.find((entry) => entry.labels.includes(treeConfig.group) || entry.labels.includes(treeConfig.leaf)) ||
        candidateTrees[0];

      const visibleTreeNodes = treeEntry?.nodes || [];

      const groupNode = visibleTreeNodes.find((node) => {
        return getNodeLabel(node) === treeConfig.group;
      });

      if (groupNode) {
        const switcher = groupNode.querySelector(".ant-tree-switcher");
        const isOpen = groupNode.className.includes("ant-tree-treenode-switcher-open");

        if (switcher && !isOpen) {
          draftLog(`Opening tree group ${treeConfig.group}.`);
          draftClickLikeUser(switcher);
          return false;
        }
      }

      const leafNode = visibleTreeNodes.find((node) => {
        return getNodeLabel(node) === treeConfig.leaf;
      });

      if (leafNode) {
        const checkbox = Array.from(leafNode.children).find((child) => child.classList?.contains("ant-tree-checkbox"));
        const checkboxInner = checkbox?.querySelector(".ant-tree-checkbox-inner") || null;
        const checkboxWrapper = leafNode.querySelector(".ant-tree-checkbox-wrapper");
        const contentWrapper = getOwnNodeWrapper(leafNode);
        const title =
          Array.from(contentWrapper?.children || []).find((child) => child.classList?.contains("ant-tree-title")) ||
          null;

        if (checkbox && !draftIsCheckboxChecked(checkbox)) {
          draftLog(`Selecting tree leaf ${treeConfig.leaf}.`);
          if (draftTryCheckboxTargets(
            [
              checkboxInner,
              checkboxWrapper,
              checkbox,
              contentWrapper,
              title,
              leafNode
            ],
            checkbox,
            `Tree leaf ${treeConfig.leaf}`
          )) {
            return true;
          }

          return false;
        }

        if (checkbox && draftIsCheckboxChecked(checkbox)) {
          draftLog(`Tree leaf ${treeConfig.leaf} already selected.`);
          return true;
        }

        if (title) {
          draftLog(`Tree leaf ${treeConfig.leaf} found without checkbox, clicking title.`);
          draftClickLikeUser(title);
          return false;
        }

        draftLog(`Tree leaf ${treeConfig.leaf} found but no clickable checkbox.`);
        return false;
      }

      const availableLabels = visibleTreeNodes
        .map((node) => getNodeLabel(node))
        .filter(Boolean)
        .slice(0, 25);
      draftLog(`Tree leaf ${treeConfig.leaf} not found yet. Visible labels: ${availableLabels.join(", ")}`);
    }

    return false;
  }

  async function draftSelectCountry(countryLabel) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < draftFeedRetoolWaitMs) {
      if (draftTrySelectCountry(countryLabel)) {
        return;
      }

      await ibaSleep(300);
    }

    throw new Error(`Country selector for ${countryLabel} was not found.`);
  }

  async function draftRunFeedPhase() {
    const url = new URL(window.location.href);
    const state = ibaDecodeState(url.searchParams.get("_draftFeed") || "");

    if (!state?.email || !Array.isArray(state.skus) || state.skus.length === 0) {
      draftLog("Missing _draftFeed payload.");
      return;
    }

    const email = String(state.email).trim();
    const marketplace = draftGetMarketplaceLabel(state.marketplace);
    const skuList = state.skus.filter(Boolean).join("\n");

    draftLog(`Preparing feed for ${email} / ${marketplace} / ${state.skus.length} SKUs.`);

    await draftFillCompanySearchInput(email);
    await draftWaitForSearchResolution(email);
    await ibaSleep(1200);

    const productsButton = await draftWaitForProductsButton();
    productsButton.click();
    draftLog("Opened Products tab.");
    await draftOpenProductUnlistingTab();
    draftLog("Opened Product Unlisting subtab.");

    const textarea = await ibaWaitForElement("#textArea1--0", draftFeedRetoolWaitMs);
    ibaSetReactInputValue(textarea, skuList);
    draftLog("Inserted SKU list into textarea.");

    await draftSelectCountry(marketplace);
    draftLog(`Selected marketplace ${marketplace}.`);

    const submitButton = await draftWaitForSubmitButton(email);
    const dryRun = await isDryRunEnabled();

    if (dryRun) {
      draftLog(`Dry run active. Feed submit suppressed for ${email}.`);
      alert(`Dry run: feed is ready for ${email} (${marketplace}) with ${state.skus.length} SKUs. Submit click was suppressed.`);
      return;
    }

    submitButton.click();
    draftLog(`Submitted feed for ${email}.`);
    // Notifikace background.js — multi-market queue pokračuje na další market
    chrome.runtime.sendMessage({ type: "DRAFT_FEED_SUBMITTED" }).catch(() => {});
    alert(`Draft feed submitted for ${email} (${marketplace}).`);
  }

  function ibaCollectOrderIds() {
    const orderIds = new Set();
    const orderIdRe = /\b(\d{3}-\d{7}-\d{7})\b/g;

    // Scan all anchor hrefs
    document.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href") || "";
      let m;
      while ((m = orderIdRe.exec(href)) !== null) orderIds.add(m[1]);
    });

    // Also scan visible text in the page body (catches IDs in table cells, spans, etc.)
    const bodyText = document.body ? document.body.innerText : "";
    let m;
    while ((m = orderIdRe.exec(bodyText)) !== null) orderIds.add(m[1]);

    return [...orderIds];
  }

  async function ibaWaitForOrderLinks(timeoutMs = 5000) {
    const pollMs = 300;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (/\b\d{3}-\d{7}-\d{7}\b/.test(document.body?.innerText || "")) return true;
      await ibaSleep(pollMs);
    }
    return false;
  }

  async function ibaWaitForStableOrderIds(maxWaitMs = 8000, stablePollMs = 800) {
    // Wait for first orders to appear, then keep polling until count stops growing
    await ibaWaitForOrderLinks(5000);

    let prev = -1;
    let stableRounds = 0;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const ids = ibaCollectOrderIds();
      if (ids.length > 0 && ids.length === prev) {
        stableRounds++;
        if (stableRounds >= 2) {
          ibaLog(`Order count stable at ${ids.length}.`);
          return ids;
        }
      } else {
        stableRounds = 0;
      }
      prev = ids.length;
      await ibaSleep(stablePollMs);
    }

    const final = ibaCollectOrderIds();
    ibaLog(`Collect timeout reached, returning ${final.length} orders.`);
    return final;
  }

  async function ibaRunCollectPhase() {
    const amazonBase = new URL(window.location.href).origin;

    ibaLog("Waiting 5s for full DOM load…");
    await ibaSleep(5000);
    ibaLog("Waiting for orders in DOM…");
    const orderIds = await ibaWaitForStableOrderIds();
    ibaLog(`Collected ${orderIds.length} IBA orders.`);

    if (orderIds.length === 0) {
      chrome.runtime.sendMessage({ type: "IBA_DONE", result: "no_orders" }).catch(() => {});
      const multiMode = await new Promise(r => chrome.storage.local.get("_ibaMultiClientMode", d => r(d._ibaMultiClientMode)));
      if (!multiMode) alert("No unshipped IBA orders found.");
      return;
    }

    await new Promise((resolve) => {
      chrome.storage.local.set({
        _ibaOrders: { orders: orderIds, amazonBase },
        _ibaSearchPending: true
      }, resolve);
    });

    ibaLog(`Saved ${orderIds.length} orders to storage, navigating to Retool.`);
    ibaNavigate(ibaRetoolUrl);
  }

  function ibaFindSearchButton() {
    return Array.from(document.querySelectorAll("button")).find((button) => {
      return button.innerText?.trim().toLowerCase() === "search";
    });
  }

  async function ibaWaitForSearchButton(timeoutMs) {
    const existing = ibaFindSearchButton();

    if (existing) {
      return existing;
    }

    await ibaWaitForElement("button", timeoutMs);
    const button = ibaFindSearchButton();

    if (!button) {
      throw new Error("Search button not found on Retool.");
    }

    return button;
  }

  function ibaGetRetoolSearchSources() {
    const sources = [];
    const body = document.body;

    if (body?.innerText) {
      sources.push(body.innerText);
    }

    if (body?.textContent) {
      sources.push(body.textContent);
    }

    if (document.documentElement?.innerHTML) {
      sources.push(document.documentElement.innerHTML);
    }

    document.querySelectorAll("script").forEach((script) => {
      if (script.textContent) {
        sources.push(script.textContent);
      }
    });

    return sources;
  }

  function ibaExtractLastMatch(sources, patterns) {
    for (const pattern of patterns) {
      for (let index = sources.length - 1; index >= 0; index -= 1) {
        const source = sources[index];
        const matches = [...source.matchAll(pattern)];

        if (matches.length > 0) {
          return matches[matches.length - 1][1]?.trim() || "";
        }
      }
    }

    return "";
  }

  function ibaExtractRetoolResult(orderId) {
    const sources = ibaGetRetoolSearchSources();
    const trackingNumber = ibaExtractLastMatch(sources, [
      /"trackingNumber"\s*:\s*"([^"]+)"/g,
      /trackingNumber\s*[:=]\s*"([^"]+)"/gi,
      /tracking(?:\s+number)?\s*[:#]?\s*([A-Z0-9-]{8,})/gi
    ]).trim();
    const carrier = ibaExtractLastMatch(sources, [
      /"carrier"\s*:\s*"([^"]+)"/g,
      /carrier\s*[:=]\s*"([^"]+)"/gi,
      /carrier\s*[:#]?\s*([A-Za-z0-9 _-]+)/gi
    ]).trim();

    if (!ibaIsValidTrackingNumber(trackingNumber)) {
      return null;
    }

    return {
      o: orderId,
      t: trackingNumber,
      c: carrier
    };
  }

  function ibaExtractRetoolNotFoundState() {
    const sources = ibaGetRetoolSearchSources();
    const message = ibaExtractLastMatch(sources, [
      /(FulfillmentID was not found in Order record[^"\n<]*)/gi,
      /(fulfillmentid[^"\n<]*not found[^"\n<]*)/gi,
      /(order record[^"\n<]*missing[^"\n<]*)/gi
    ]).trim();

    if (!message) {
      return null;
    }

    return {
      status: "not_found",
      message
    };
  }

  function ibaGetRetoolStateSignature(state) {
    if (!state) {
      return "";
    }

    if (state.status === "found" && state.result) {
      return `found:${state.result.t}|${state.result.c || ""}`;
    }

    if (state.status === "not_found") {
      return `not_found:${state.message || ""}`;
    }

    return state.status || "";
  }

  function ibaGetRetoolSearchState(orderId) {
    const result = ibaExtractRetoolResult(orderId);

    if (result) {
      return {
        status: "found",
        result
      };
    }

    const notFoundState = ibaExtractRetoolNotFoundState();

    if (notFoundState) {
      return notFoundState;
    }

    return {
      status: "pending"
    };
  }

  async function ibaWaitForRetoolResult(orderId, previousState, timeoutMs) {
    const startedAt = Date.now();
    const previousSignature = ibaGetRetoolStateSignature(previousState);

    // Phase 1: Wait for ANY change from the pre-search state.
    // This confirms a new search cycle has started (Retool cleared/reloaded results).
    // Without this, old results still in the DOM can be mistaken for a new result.
    while (Date.now() - startedAt < timeoutMs) {
      const state = ibaGetRetoolSearchState(orderId);
      if (ibaGetRetoolStateSignature(state) !== previousSignature) {
        break;
      }
      await ibaSleep(ibaRetoolPollMs);
    }

    // Phase 2: Wait for a settled, non-pending result.
    // Once the state has changed, wait until Retool finishes loading the result.
    while (Date.now() - startedAt < timeoutMs) {
      const state = ibaGetRetoolSearchState(orderId);
      if (state.status !== "pending") {
        return state;
      }
      await ibaSleep(ibaRetoolPollMs);
    }

    return ibaGetRetoolSearchState(orderId);
  }

  async function ibaRunRetoolSearchPhase() {
    // Clear the pending flag immediately so we don't re-trigger on Retool navigations
    await new Promise((resolve) => {
      chrome.storage.local.remove("_ibaSearchPending", resolve);
    });

    const state = await new Promise((resolve) => {
      chrome.storage.local.get("_ibaOrders", (data) => resolve(data._ibaOrders || null));
    });

    if (!state?.orders?.length || !state.amazonBase) {
      ibaLog("Missing _ibaOrders in storage.");
      return;
    }

    ibaLog(`Loaded ${state.orders.length} orders from storage.`);

    const input = await ibaWaitForElement("#inputOrderId--0", ibaSearchWaitMs);
    const searchButton = await ibaWaitForSearchButton(ibaSearchWaitMs);

    // Give Retool time to fully mount React handlers before the first interaction.
    // Without this delay, the first click() may be ignored by an uninitialised component.
    ibaLog("Retool UI ready — waiting for React initialisation…");
    await ibaSleep(ibaRetoolInitDelayMs);

    const results = [];

    for (const orderId of state.orders) {
      ibaLog(`Searching Retool for ${orderId}.`);

      let searchState = null;

      for (let attempt = 0; attempt <= ibaRetoolMaxRetries; attempt++) {
        if (attempt > 0) {
          ibaLog(`Retrying ${orderId} (attempt ${attempt + 1}/${ibaRetoolMaxRetries + 1})…`);
          await ibaSleep(1200);
        }

        // Capture state BEFORE typing so we can detect any change.
        const previousState = ibaGetRetoolSearchState(orderId);

        // Focus the input first — React controlled inputs often need this
        // to register subsequent programmatic changes correctly.
        input.focus();
        input.dispatchEvent(new Event("focus", { bubbles: true }));

        ibaSetReactInputValue(input, orderId);

        // Wait for React to process the new input value before clicking.
        await ibaSleep(ibaRetoolInputSettleMs);

        searchButton.click();

        searchState = await ibaWaitForRetoolResult(orderId, previousState, ibaRetoolResultWaitMs);

        if (searchState.status !== "pending") {
          break; // got a definitive answer — stop retrying
        }

        ibaLog(`No result for ${orderId} after attempt ${attempt + 1} — ${attempt < ibaRetoolMaxRetries ? "will retry" : "giving up"}.`);
      }

      if (searchState.status === "found" && searchState.result) {
        ibaLog(`Found tracking for ${orderId}: ${searchState.result.t} / ${searchState.result.c || "carrier-missing"}`);
        results.push(searchState.result);
        continue;
      }

      if (searchState.status === "not_found") {
        ibaLog(`Retool returned no tracking for ${orderId}: ${searchState.message}`);
        continue;
      }

      ibaLog(`Retool result timed out for ${orderId} after ${ibaRetoolMaxRetries + 1} attempt(s) — skipping.`);
    }

    ibaLog(`Retool returned ${results.length} tracking results.`);

    const encodedResults = ibaEncodeState(results);
    const nextUrl = `${state.amazonBase}/orders-v3/mfn/unshipped?_ibaResults=${encodeURIComponent(encodedResults)}&orderType=IBA&orderStatus=unshipped&fulfillmentType=mfn&page=1&date-range=last-30`;
    ibaNavigate(nextUrl);
  }

  function ibaBuildConfirmShipmentUrl(origin, queue, index) {
    return `${origin}/orders-v3/order/${queue[index].o}/confirm-shipment?_ibaQueue=${encodeURIComponent(ibaEncodeState(queue))}&_ibaIdx=${index}`;
  }

  function ibaBuildQueuePreview(queue) {
    return queue.map((item, index) => {
      return `${index + 1}. ${item.o} | ${item.t} | ${item.c || "carrier-missing"}`;
    }).join("\n");
  }

  function ibaShowQueueApprovalDialog(queue) {
    ibaRemoveExistingDialog();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.id = "iba-confirm-overlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "rgba(15, 23, 42, 0.58)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "24px";

      const dialog = document.createElement("div");
      dialog.style.width = "min(820px, 100%)";
      dialog.style.maxHeight = "80vh";
      dialog.style.display = "flex";
      dialog.style.flexDirection = "column";
      dialog.style.overflow = "hidden";
      dialog.style.borderRadius = "16px";
      dialog.style.background = "#ffffff";
      dialog.style.boxShadow = "0 20px 50px rgba(15, 23, 42, 0.35)";
      dialog.style.fontFamily = "Arial, sans-serif";
      dialog.style.color = "#111827";

      const header = document.createElement("div");
      header.style.padding = "18px 20px 12px";
      header.style.borderBottom = "1px solid #e5e7eb";
      header.innerHTML = "<div style=\"font-size:20px;font-weight:700;\">Confirm IBA Shipment Queue</div><div style=\"margin-top:6px;font-size:13px;color:#4b5563;\">Review every order before Amazon shipment confirmation starts.</div>";

      const body = document.createElement("div");
      body.style.padding = "16px 20px";
      body.style.maxHeight = "52vh";
      body.style.overflow = "auto";

      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.fontSize = "13px";

      const thead = document.createElement("thead");
      thead.innerHTML = "<tr><th style=\"text-align:left;padding:10px;border-bottom:1px solid #d1d5db;\">#</th><th style=\"text-align:left;padding:10px;border-bottom:1px solid #d1d5db;\">Order ID</th><th style=\"text-align:left;padding:10px;border-bottom:1px solid #d1d5db;\">Tracking</th><th style=\"text-align:left;padding:10px;border-bottom:1px solid #d1d5db;\">Carrier</th></tr>";
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      queue.forEach((item, index) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${item.o}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-family:monospace;">${item.t}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${item.c || "carrier-missing"}</td>
        `;
        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      body.appendChild(table);

      const footer = document.createElement("div");
      footer.style.display = "flex";
      footer.style.justifyContent = "flex-end";
      footer.style.gap = "10px";
      footer.style.padding = "16px 20px 20px";
      footer.style.borderTop = "1px solid #e5e7eb";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.style.border = "0";
      cancelButton.style.borderRadius = "10px";
      cancelButton.style.padding = "10px 16px";
      cancelButton.style.fontWeight = "700";
      cancelButton.style.cursor = "pointer";
      cancelButton.style.background = "#e5e7eb";
      cancelButton.style.color = "#111827";

      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.textContent = "Start confirming";
      approveButton.style.border = "0";
      approveButton.style.borderRadius = "10px";
      approveButton.style.padding = "10px 16px";
      approveButton.style.fontWeight = "700";
      approveButton.style.cursor = "pointer";
      approveButton.style.background = "#1f2937";
      approveButton.style.color = "#ffffff";

      function closeDialog(approved) {
        ibaRemoveExistingDialog();
        resolve(approved);
      }

      cancelButton.addEventListener("click", () => closeDialog(false));
      approveButton.addEventListener("click", () => closeDialog(true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          closeDialog(false);
        }
      });

      footer.append(cancelButton, approveButton);
      dialog.append(header, body, footer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }

  async function ibaRunStartQueuePhase() {
    const url = new URL(window.location.href);
    const queue = ibaDecodeState(url.searchParams.get("_ibaResults") || "");

    if (!Array.isArray(queue) || queue.length === 0) {
      ibaLog("No IBA results available to start queue.");
      alert("No tracking results were found in Retool.");
      return;
    }

    ibaNavigate(ibaBuildConfirmShipmentUrl(window.location.origin, queue, 0));
  }

  async function ibaRunNextInQueuePhase() {
    const url = new URL(window.location.href);
    const queue = ibaDecodeState(url.searchParams.get("_ibaQueue") || "");
    const index = Number.parseInt(url.searchParams.get("_ibaIdx") || "0", 10);

    if (!Array.isArray(queue) || !queue[index]) {
      ibaLog("Queue state is invalid.");
      return;
    }

    ibaNavigate(ibaBuildConfirmShipmentUrl(window.location.origin, queue, index));
  }

  function ibaGetServiceValueForCarrier(carrier) {
    if (carrier === "GLS") {
      return "BusinessParcel";
    }

    if (carrier === "UPS") {
      return "Standard";
    }

    return "";
  }

  async function ibaRunConfirmOnePhase() {
    const url = new URL(window.location.href);
    const queue = ibaDecodeState(url.searchParams.get("_ibaQueue") || "");
    const index = Number.parseInt(url.searchParams.get("_ibaIdx") || "0", 10);
    const order = Array.isArray(queue) ? queue[index] : null;

    if (!order) {
      ibaLog("Current queue item is missing.");
      return;
    }

    if (!ibaIsValidTrackingNumber(order.t)) {
      alert(`Invalid tracking detected for ${order.o}: ${order.t}`);
      throw new Error(`Invalid tracking detected for ${order.o}: ${order.t}`);
    }

    const carrierDropdown = await ibaWaitForElement('[id^="CarrierListDropdown"]', ibaConfirmWaitMs);

    ibaLog(`Confirming shipment for ${order.o}.`);

    if (order.c) {
      ibaSetSelectValue(carrierDropdown, order.c);
      await ibaSleep(1000);
    }

    const serviceValue = ibaGetServiceValueForCarrier(order.c);
    const serviceDropdown = document.querySelector("#shipping-service-dropdown1");

    if (serviceDropdown && serviceValue) {
      ibaSetSelectValue(serviceDropdown, serviceValue);
      await ibaSleep(500);
    }

    const trackingInput = document.querySelector('[data-test-id="text-input-tracking-id"]');

    if (!trackingInput) {
      throw new Error("Tracking input not found.");
    }

    ibaSetReactInputValue(trackingInput, order.t);
    await ibaSleep(500);

    const confirmButton = document.querySelector('input[type="submit"][value="Confirm dispatch"]');

    if (!confirmButton) {
      throw new Error("Confirm dispatch button not found.");
    }

    const dryRun = await isDryRunEnabled();

    if (dryRun) {
      ibaLog(`Dry run active. Confirm dispatch suppressed for ${order.o}.`);
      alert(`Dry run: shipment ready for ${order.o} with tracking ${order.t}. Confirm dispatch was suppressed.`);
      return;
    }

    confirmButton.click();
    await ibaSleep(3000);

    const nextIndex = index + 1;

    if (Array.isArray(queue) && nextIndex < queue.length) {
      ibaNavigate(ibaBuildConfirmShipmentUrl(window.location.origin, queue, nextIndex));
      return;
    }

    chrome.runtime.sendMessage({ type: "IBA_DONE", result: "complete" }).catch(() => {});
    const multiMode = await new Promise(r => chrome.storage.local.get("_ibaMultiClientMode", d => r(d._ibaMultiClientMode)));
    if (!multiMode) alert("IBA shipment automation complete.");
    ibaNavigate(ibaAmazonListUrl);
  }

  async function ibaRunCurrentPhase() {
    const url = new URL(window.location.href);

    // Retool: detect pending IBA search via storage (URL params are stripped by Retool's SPA router)
    if (url.hostname === "expandoadmin.retool.com") {
      const pending = await new Promise((resolve) => {
        chrome.storage.local.get("_ibaSearchPending", (d) => resolve(!!d._ibaSearchPending));
      });
      if (pending) {
        ibaLog("Detected pending IBA search from storage.");
        await ibaSleep(ibaAutoStartDelayMs);
        await ibaRunRetoolSearchPhase();
        return;
      }
    }

    const phase = ibaGetPhase();

    if (!phase) {
      return;
    }

    ibaLog(`Detected phase: ${phase}`);
    await ibaSleep(ibaAutoStartDelayMs);

    if (phase === "DRAFT_FEED") {
      await draftRunFeedPhase();
      return;
    }

    if (phase === "COLLECT") {
      await ibaRunCollectPhase();
      return;
    }

    if (phase === "START_QUEUE") {
      await ibaRunStartQueuePhase();
      return;
    }

    if (phase === "CONFIRM_ONE") {
      await ibaRunConfirmOnePhase();
      return;
    }

    if (phase === "NEXT_IN_QUEUE") {
      await ibaRunNextInQueuePhase();
    }
  }

  // ─── B2B Price Fixer ─────────────────────────────────────────────────────

  function b2bLog(...args) {
    console.log("[B2BFixer]", ...args);
  }

  // Extrahuje SKU z řádku tabulky
  function b2bExtractSKUFromRow(row) {
    const allSpans = Array.from(row.querySelectorAll("span"));
    const skuSpan = allSpans.find((s) => s.textContent.trim() === "SKU" && s.className.includes("defaultText"));
    if (!skuSpan) return null;
    const panel = skuSpan.closest('[class*="JanusSplitBox-module__row"]');
    if (panel) {
      const link = panel.querySelector("a");
      if (link) return link.textContent.trim();
    }
    const parent = skuSpan.parentElement;
    const grandParent = parent?.parentElement;
    const siblings = Array.from(grandParent?.children || []);
    const nextPanel = siblings[1];
    return nextPanel?.querySelector("a")?.textContent?.trim() || nextPanel?.textContent?.trim() || null;
  }

  // Extrahuje SKU z otevřeného B2B panelu (pro ověření správného produktu)
  function b2bExtractSKUFromPanel(panel) {
    const dts = Array.from(panel.querySelectorAll("dt"));
    const skuDt = dts.find((dt) => dt.textContent.trim() === "SKU");
    if (skuDt) {
      const dd = skuDt.nextElementSibling;
      if (dd) return dd.textContent.trim();
    }
    const katLink = panel.querySelector("kat-link");
    return katLink?.textContent?.trim() || null;
  }

  // Najde odkaz "Business price" pro SKU v živém DOMu (odolné vůči re-renderu)
  function b2bFindBpLinkForSku(sku) {
    const row = document.querySelector(`[data-sku="${CSS.escape(sku)}"]`);
    if (!row) return null;
    const spans = Array.from(row.querySelectorAll('[class*="JanusRichText-module__defaultText"]'));
    const bpSpan = spans.find((s) => s.textContent.trim() === "Business price");
    const subContainer = bpSpan?.closest('[class*="JanusReferencePrice-module__subContainer"]');
    return subContainer?.nextElementSibling?.querySelector("a") || null;
  }

  // Přečte "standard price" z textu panelu (např. "standard price of €23.49")
  function b2bReadPanelStandardPrice(panel) {
    const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const m = node.textContent.match(/standard price of\s*(?:€|£|\$)\s*([\d.,]+)/i);
      if (m) return parseFloat(m[1].replace(",", "."));
    }
    return null;
  }

  // Čte viditelné řádky a ukládá data do cache (SKU → data)
  function b2bCacheVisibleRows(skuCache) {
    const rows = Array.from(document.querySelectorAll('[class*="JanusTable-module__tableContentRow"]'));
    let added = 0;
    for (const row of rows) {
      const sku = b2bExtractSKUFromRow(row);
      if (!sku || skuCache.has(sku)) continue;

      const katInputs = Array.from(row.querySelectorAll('kat-input[class*="CellInput"]'));
      if (katInputs.length < 4) continue;

      const price    = parseFloat(katInputs[1].getAttribute("value"));
      const minPrice = parseFloat(katInputs[2].getAttribute("value"));
      const maxPrice = parseFloat(katInputs[3].getAttribute("value"));

      const spans = Array.from(row.querySelectorAll('[class*="JanusRichText-module__defaultText"]'));
      const bpSpan = spans.find((s) => s.textContent.trim() === "Business price");
      const subContainer = bpSpan?.closest('[class*="JanusReferencePrice-module__subContainer"]');
      const bpLink = subContainer?.nextElementSibling?.querySelector("a");
      const bpValue = parseFloat(bpLink?.textContent?.trim().replace("€", "").replace(",", ".").trim());

      skuCache.set(sku, { price, minPrice, maxPrice, bpValue, bpLinkEl: bpLink });
      added++;
    }
    return added;
  }

  // Vloží hodnotu do shadow inputu uvnitř kat-input
  async function b2bSetInputValue(katInput, strValue) {
    const shadowInput = katInput?.shadowRoot?.querySelector("input");
    if (!shadowInput) return false;

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

    shadowInput.click(); await ibaSleep(80);
    shadowInput.focus(); await ibaSleep(80);

    // setSelectionRange je spolehlivější než .select() pro shadow DOM inputy
    // (document.activeElement je kat-input host, ne shadow input — select() může selhat)
    shadowInput.setSelectionRange(0, shadowInput.value.length);
    await ibaSleep(40);

    // execCommand generuje isTrusted input eventy, které React preferuje
    const inserted = document.execCommand("insertText", false, strValue);

    // Pokud execCommand selhal nebo hodnota nesedí → native setter
    if (!inserted || shadowInput.value !== strValue) {
      if (typeof nativeSetter === "function") {
        nativeSetter.call(shadowInput, strValue);
      } else {
        shadowInput.value = strValue;
      }
      // Notifikace kat-inputu o změně přes shadow input event
      shadowInput.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: strValue }));
      await ibaSleep(150);
    }

    // Vždy dispatch React-compatible eventy na kat-input hostu
    shadowInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    katInput.value = strValue;
    katInput.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: strValue } }));
    shadowInput.blur();
    shadowInput.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));

    // Delší čekání — dáme Reactu čas zpracovat event a případně re-renderovat
    await ibaSleep(400);

    return shadowInput.value === strValue;
  }

  // Čeká až se tlačítko stane klikatelným (kontroluje i shadow button)
  async function b2bWaitForSaveReady(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const btn = document.querySelector('[class*="FooterComponent-module__submitButton"]');
      if (btn && !btn.disabled && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true") {
        const shadowBtn = btn.shadowRoot?.querySelector("button");
        if (!shadowBtn || !shadowBtn.disabled) return btn;
      }
      await ibaSleep(200);
    }
    return null;
  }

  // Klikne na kat-button přes shadow root (spolehlivější než .click() na hostu)
  function b2bClickKatButton(katBtn) {
    const shadowBtn = katBtn?.shadowRoot?.querySelector("button");
    if (shadowBtn && !shadowBtn.disabled) { shadowBtn.click(); return true; }
    katBtn?.click();
    return !!katBtn;
  }

  // Zavře B2B panel (cancel, nebo fallback na X tlačítko)
  async function b2bClosePanel() {
    const cancelBtn = document.querySelector('[class*="FooterComponent-module__cancelButton"]');
    if (cancelBtn) { b2bClickKatButton(cancelBtn); await ibaSleep(600); }
    if (!document.querySelector('[class*="B2BInsightsActionPanel-module__actionPanelWrapper"]')) return true;
    const xBtn = document.querySelector('[class*="B2BInsightsActionPanel-module__"] [aria-label*="close" i]') ||
                 document.querySelector('[class*="B2BInsightsActionPanel-module__"] button');
    xBtn?.click();
    await ibaSleep(600);
    return !document.querySelector('[class*="B2BInsightsActionPanel-module__actionPanelWrapper"]');
  }

  // Čeká na zavření panelu
  async function b2bWaitForPanelClose(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!document.querySelector('[class*="B2BInsightsActionPanel-module__actionPanelWrapper"]')) return true;
      await ibaSleep(100);
    }
    return false;
  }

  async function b2bRunFixer() {
    const startTime = Date.now();
    const dryRun = await isDryRunEnabled();
    b2bLog("Starting. Dry run:", dryRun);

    // ── Fáze 1: lazy-load + cache všech řádků ────────────────────────────────
    // Scrollujeme celou stránku a ukládáme data PŘED tím, než otevřeme jakýkoliv panel.
    // Panel by jinak překryl řádky a zablokoval čtení cen.
    b2bLog("Fáze 1: lazy-load + cache SKU dat...");
    const skuCache = new Map();

    let lastCount = 0;
    let noChangeRounds = 0;
    while (true) {
      b2bCacheVisibleRows(skuCache);
      window.scrollTo(0, document.body.scrollHeight);
      await ibaSleep(800);
      b2bCacheVisibleRows(skuCache);
      if (skuCache.size === lastCount) {
        noChangeRounds++;
        if (noChangeRounds >= 3) break;
      } else {
        noChangeRounds = 0;
      }
      lastCount = skuCache.size;
      b2bLog(`Cache: ${skuCache.size} SKU...`);
    }
    window.scrollTo(0, 0);
    await ibaSleep(500);
    b2bLog(`Cache hotova: ${skuCache.size} SKU.`);

    // ── Fáze 2: oprava B2B cen podle cache ───────────────────────────────────
    b2bLog("Fáze 2: oprava B2B cen...");
    let fixed = 0;
    let skipped = 0;
    let failed = 0;

    for (const [sku, data] of skuCache) {
      const { price, minPrice, maxPrice, bpValue, bpLinkEl } = data;

      if (isNaN(price) || isNaN(bpValue)) {
        b2bLog(`${sku}: neplatné hodnoty, přeskočeno.`);
        skipped++;
        continue;
      }

      if (bpValue >= minPrice && bpValue <= maxPrice) {
        skipped++;
        continue;
      }

      let newBP = Math.round(price * 0.99 * 100) / 100;
      b2bLog(`${sku}: price=${price}, BP=${bpValue}, range=[${minPrice},${maxPrice}] → newBP=${newBP}`);

      if (dryRun) {
        b2bLog(`${sku}: dry run, přeskočeno.`);
        fixed++;
        continue;
      }

      // Najít B2B odkaz v živém DOMu (cache může obsahovat zastaralý odkaz po re-renderu)
      let bpLink = b2bFindBpLinkForSku(sku);
      if (!bpLink && bpLinkEl?.isConnected) {
        bpLink = bpLinkEl;
      }
      if (!bpLink) {
        // Zkusit scrollovat nahoru a počkat na re-render řádku
        window.scrollTo(0, 0);
        await ibaSleep(500);
        const freshRow = document.querySelector(`[data-sku="${CSS.escape(sku)}"]`);
        if (freshRow) {
          freshRow.scrollIntoView({ behavior: "smooth", block: "center" });
          await ibaSleep(700);
          bpLink = b2bFindBpLinkForSku(sku);
        }
      }
      if (!bpLink) {
        b2bLog(`${sku}: B2B odkaz nenalezen v DOMu, přeskočeno.`);
        failed++;
        continue;
      }

      bpLink.scrollIntoView({ behavior: "smooth", block: "center" });
      await ibaSleep(400);
      bpLink.click();
      await ibaSleep(1000);

      const panel = document.querySelector('[class*="B2BInsightsActionPanel-module__actionPanelWrapper"]');
      if (!panel) {
        b2bLog(`${sku}: panel se neotevřel.`);
        failed++;
        continue;
      }

      // Ověřit že panel patří správnému SKU
      const panelSKU = b2bExtractSKUFromPanel(panel);
      if (panelSKU && panelSKU !== sku) {
        b2bLog(`${sku}: panel obsahuje jiné SKU (${panelSKU}), zavírám.`);
        await b2bClosePanel();
        failed++;
        continue;
      }

      const bpInput = panel.querySelector('kat-input[class*="CellInput"]');
      if (!bpInput) {
        b2bLog(`${sku}: kat-input v panelu nenalezen.`);
        await b2bClosePanel();
        failed++;
        continue;
      }

      // Přečíst panelové constraints
      const panelMin = parseFloat(bpInput.getAttribute("min"));
      const panelMax = parseFloat(bpInput.getAttribute("max"));

      // Přečíst standard price z textu panelu (např. "standard price of €23.49")
      // Pokud je cena z řádku vyšší než standard price, použijeme standard price jako základ
      const panelStandardPrice = b2bReadPanelStandardPrice(panel);
      let effectiveBP = newBP;
      if (panelStandardPrice && !isNaN(panelStandardPrice) && panelStandardPrice * 0.99 < newBP) {
        effectiveBP = Math.round(panelStandardPrice * 0.99 * 100) / 100;
        b2bLog(`${sku}: panelStandardPrice=${panelStandardPrice}, newBP přepočítán na ${effectiveBP}`);
      }
      if (!isNaN(panelMin) && effectiveBP < panelMin) {
        b2bLog(`${sku}: effectiveBP ${effectiveBP} pod panelMin ${panelMin}, ořezáno.`);
        effectiveBP = panelMin;
      }
      if (!isNaN(panelMax) && effectiveBP > panelMax) {
        b2bLog(`${sku}: effectiveBP ${effectiveBP} nad panelMax ${panelMax}, ořezáno.`);
        effectiveBP = panelMax;
      }
      effectiveBP = Math.round(effectiveBP * 100) / 100;
      b2bLog(`${sku}: panelMin=${panelMin}, panelMax=${panelMax}, panelStdPrice=${panelStandardPrice}, effectiveBP=${effectiveBP}`);

      const strValue = effectiveBP.toFixed(2);
      let valueSet = await b2bSetInputValue(bpInput, strValue);

      // Druhý pokus — React může asynchronně resetovat hodnotu po prvním nastavení
      if (!valueSet || bpInput?.shadowRoot?.querySelector("input")?.value !== strValue) {
        b2bLog(`${sku}: první pokus neuspěl, zkouším znovu...`);
        await ibaSleep(200);
        valueSet = await b2bSetInputValue(bpInput, strValue);
      }

      if (!valueSet) {
        b2bLog(`${sku}: nepodařilo se vložit hodnotu ${strValue}.`);
        await b2bClosePanel();
        failed++;
        continue;
      }

      const saveBtn = await b2bWaitForSaveReady();
      if (!saveBtn) {
        b2bLog(`${sku}: save button zůstal disabled (timeout 15s).`);
        await b2bClosePanel();
        failed++;
        continue;
      }

      b2bClickKatButton(saveBtn);
      await ibaSleep(500);

      const closed = await b2bWaitForPanelClose();
      if (!closed) {
        b2bLog(`${sku}: panel se nezavřel po save, zavírám ručně.`);
        await b2bClosePanel();
      }

      b2bLog(`${sku}: uloženo → BP=${strValue}`);
      fixed++;
      await ibaSleep(300);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const elapsedStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
    b2bLog(`Hotovo. Opraveno: ${fixed}, přeskočeno: ${skipped}, selhání: ${failed}. Čas: ${elapsedStr}`);
    alert(`B2B Price Fix dokončen.\nOpraveno: ${fixed}\nPřeskočeno: ${skipped}\nSelhání: ${failed}\nČas: ${elapsedStr}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Account switcher automation — shared by message handler and storage self-trigger

  async function accountSelectRun(sellerName, marketLabel) {
    console.log("[SellerTools] accountSelectRun: seller=%s market=%s", sellerName, marketLabel);

    function findAccountBtn(label) {
      return [...document.querySelectorAll("button.full-page-account-switcher-account-details")]
        .find((btn) => {
          const text = btn.querySelector("span.full-page-account-switcher-account-label")
            ?.textContent?.trim() || "";
          return text === label || text.startsWith(label + " ") || text.startsWith(label + " ");
        });
    }

    // Step 1: wait for kat-input shadow DOM (up to 5s — may run before Vue fully inits)
    const t0 = Date.now();
    const searchInput = await new Promise((resolve) => {
      const deadline = t0 + 5000;
      const tick = () => {
        const input = document.querySelector("kat-input")?.shadowRoot?.querySelector("input");
        if (input) { resolve(input); return; }
        if (Date.now() > deadline) { resolve(null); return; }
        setTimeout(tick, 100);
      };
      tick();
    });
    console.log("[SellerTools] accountSelectRun: kat-input ready in", Date.now() - t0, "ms, found:", !!searchInput);

    if (searchInput && sellerName) {
      searchInput.focus();
      searchInput.value = sellerName;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
      const searchBtn = document.querySelector("kat-button.search-button");
      if (searchBtn) searchBtn.click();
      console.log("[SellerTools] accountSelectRun: typed seller name, search btn clicked:", !!searchBtn);
    }

    // Step 2: poll for seller row (up to 6s)
    const sellerBtn = sellerName ? await new Promise((resolve) => {
      const deadline = Date.now() + 6000;
      const tick = () => {
        const btn = findAccountBtn(sellerName);
        if (btn) { resolve(btn); return; }
        if (Date.now() > deadline) { resolve(null); return; }
        setTimeout(tick, 250);
      };
      tick();
    }) : null;
    console.log("[SellerTools] accountSelectRun: seller btn found:", !!sellerBtn);

    if (!sellerBtn) {
      const labels = [...document.querySelectorAll("span.full-page-account-switcher-account-label")]
        .map(el => el.textContent?.trim()).filter(Boolean);
      console.log("[SellerTools] accountSelectRun: visible labels:", JSON.stringify(labels));
      return { success: false, error: `Seller "${sellerName}" not found` };
    }

    sellerBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    // Step 3: click market row if specified
    if (marketLabel) {
      const marketBtn = findAccountBtn(marketLabel);
      if (marketBtn) {
        console.log("[SellerTools] accountSelectRun: clicking market:", marketLabel);
        marketBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      } else {
        console.log("[SellerTools] accountSelectRun: market row not found for:", marketLabel);
      }
    }

    // Step 4: confirm
    const confirmBtn = document.querySelector("kat-button[data-test='confirm-selection']");
    if (confirmBtn) {
      console.log("[SellerTools] accountSelectRun: clicking confirm");
      confirmBtn.click();
      return { success: true };
    }
    return { success: false, error: "Confirm button not found" };
  }

  // ─────────────────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === "GET_ACCOUNT_DATA") {
      accountFetchAll()
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.action === "GET_MARKET_DATA") {
      marketFetchCurrentAccountMarkets()
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message?.action === "GET_PAGE_TYPE") {
      // Detect what kind of SC page we're on — more reliable than URL matching
      const url = window.location.href;

      // Login / step-up auth page
      const isLogin = url.includes("/ap/signin") || url.includes("/ap/mfa")
        || !!document.getElementById("ap_email")
        || !!document.getElementById("auth-mfa-form");

      // Account switcher page — check DOM, not just URL
      const isAccountSwitcher = url.includes("/account-switcher/")
        || !!document.querySelector("input[placeholder*='Search for an account' i]")
        || !!([...document.querySelectorAll("h1,h2,h3")].find(el => /select an account/i.test(el.textContent)))
        || !!([...document.querySelectorAll("button,input[type='submit']")].find(el => /select\s*account/i.test(el.textContent || el.value || "")));

      // Payments / disburse page
      const isDisburse = url.includes("/payments/disburse")
        || !!document.getElementById("request-transfer-button");

      const type = isDisburse ? "disburse"
                 : isAccountSwitcher ? "account-switcher"
                 : isLogin ? "login"
                 : "other";

      sendResponse({ type, url });
      return;
    }

    if (message?.action === "DO_ACCOUNT_SELECT") {
      const { sellerName, marketLabel } = message;
      accountSelectRun(sellerName, marketLabel)
        .then((result) => sendResponse(result || { success: false }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (message?.action === "DO_DISBURSEMENT") {
      (async () => {
        try {
          // Wait for KAT custom elements to register
          if (window.customElements?.whenDefined) {
            await Promise.race([
              customElements.whenDefined("kat-button"),
              new Promise((r) => setTimeout(r, 8000)),
            ]);
          }
          // Extra settle time for the page to fully render
          await new Promise((r) => setTimeout(r, 1500));

          const btn = document.getElementById("request-transfer-button");
          if (!btn) {
            sendResponse({ success: false, error: "Button #request-transfer-button not found" });
            return;
          }

          // KAT button — click via shadow DOM
          const innerBtn = btn.shadowRoot?.querySelector("button");
          if (!innerBtn) {
            sendResponse({ success: false, error: "Shadow DOM inner button not found" });
            return;
          }
          if (innerBtn.disabled || btn.getAttribute("disabled") === "true") {
            sendResponse({ success: false, error: "Button is disabled — disbursement may have already been requested or is unavailable" });
            return;
          }

          // Read disbursement amount from the page before clicking
          const amountSelectors = [
            "#disbursement-amount",
            "#disburse-amount",
            "[data-testid='disbursement-amount']",
            ".disburse-amount",
            "#transfer-amount",
            // Amazon SC sometimes uses a table with label/value pairs
            "td.transfer-amount",
            // Fallback: find a cell next to a label containing "transfer" or "disburse"
          ];
          let amount = null;
          for (const sel of amountSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) { amount = el.textContent.trim(); break; }
          }
          if (!amount) {
            // Generic fallback: look for currency pattern near the button
            const allText = [...document.querySelectorAll("td, span, div")]
              .map((el) => el.textContent.trim())
              .find((t) => /^[-+]?[\d.,]+\s*€|EUR|GBP|£|\$|USD/.test(t));
            if (allText) amount = allText;
          }

          innerBtn.click();

          // Poll for success or error alert (max 15s)
          const result = await new Promise((resolve) => {
            const deadline = Date.now() + 15000;
            const iv = setInterval(() => {
              const ok  = document.getElementById("disburse-now-submit-success-alert");
              const err = document.getElementById("disburse-now-submit-error-alert");
              if (ok && ok.offsetParent !== null) {
                clearInterval(iv);
                resolve({ success: true, amount });
              } else if (err && err.offsetParent !== null) {
                clearInterval(iv);
                resolve({ success: false, error: err.textContent?.trim() || "Disbursement failed" });
              } else if (Date.now() > deadline) {
                clearInterval(iv);
                resolve({ success: false, error: "Timeout — no result received within 15s" });
              }
            }, 300);
          });

          sendResponse(result);
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    if (message?.action === "IBA_START") {
      ibaNavigate(ibaAmazonStartUrl);
      return;
    }

    if (message?.action === "PRICING_FIXER_START") {
      pricingSetSessionState({
        active: true,
        startedAt: Date.now()
      });
      window.location.href = pricingGetTargetUrl(1);
      return;
    }

    if (message?.action === "B2B_FIXER_START") {
      const b2bUrl = new URL(window.location.href);
      b2bUrl.pathname = pricingIssuePathname;
      b2bUrl.searchParams.set("fulfilledBy", "all");
      b2bUrl.searchParams.set("page", "1");
      b2bUrl.searchParams.set("pageSize", "250");
      b2bUrl.searchParams.set("sort", "sales_desc");
      b2bUrl.searchParams.set("status", pricingIssueStatus);
      b2bUrl.searchParams.set("ref_", "xx_invmgr_favb_xx");
      b2bUrl.searchParams.set(b2bFixerStartParam, "1");
      window.location.href = b2bUrl.toString();
      return;
    }

    if (message?.action === "SCRAPE_INVENTORY_AGE") {
      (async () => {
        const tabId = message.tabId;
        try {
          if (!window.location.href.includes("/inventoryplanning/manageinventoryhealth")) {
            sendResponse({ success: false, error: "Wrong page." });
            return;
          }

          // Check for CAPTCHA / interstitial
          if (document.getElementById("ap_email") || document.getElementById("auth-mfa-form") || /captcha/i.test(document.title)) {
            await chrome.runtime.sendMessage({ type: "INVENTORY_AGE_ROWS", tabId, rows: [], hasNextPage: false, marketCode: "??" });
            sendResponse({ success: false, error: "Amazon requested verification — scan aborted." });
            return;
          }

          // Wait for table to load (max 15s)
          const tableReady = await new Promise(resolve => {
            const deadline = Date.now() + 15000;
            const check = () => {
              const hasRows = document.querySelector("kat-table-row ipv2-product-details") || document.querySelector("ipv2-product-details");
              if (hasRows) { resolve(true); return; }
              if (Date.now() > deadline) { resolve(false); return; }
              setTimeout(check, 400);
            };
            check();
          });

          if (!tableReady) {
            // Empty inventory is valid
            const emptyMsg = document.querySelector("kat-table")?.innerText || "";
            if (/no result|no item|leer|keine/i.test(emptyMsg) || !document.querySelector("kat-table")) {
              await chrome.runtime.sendMessage({ type: "INVENTORY_AGE_ROWS", tabId, rows: [], hasNextPage: false, marketCode: "??" });
              sendResponse({ success: true });
              return;
            }
            sendResponse({ success: false, error: "Table did not load within 15s." });
            return;
          }

          function parseProductDetails(pdText) {
            const lines = (pdText || "").split("\n").map(s => s.trim()).filter(Boolean);
            const out = { title: lines[0] || "" };
            for (const line of lines) {
              const m = line.match(/^(ASIN|FNSKU|SKU|UPC\/EAN|UPC|EAN)\s*:\s*(.+)$/i);
              if (m) out[m[1].toUpperCase().replace("/", "_")] = m[2].trim();
            }
            return out;
          }

          function scrapeInventoryRows() {
            const rows = [...document.querySelectorAll("kat-table-row")]
              .filter(r => r.querySelector("ipv2-product-details"));

            return rows.map(row => {
              const cells = [...row.querySelectorAll("kat-table-cell")];
              const byClass = prefix => cells.find(c =>
                (c.className || "").split(/\s+/).some(cl => cl.startsWith(prefix))
              );

              const productCell = byClass("product_details") || cells[1];
              const ageCell     = byClass("inventory_age")   || cells[6];
              const levelCell   = byClass("inventory_level");
              const salesCell   = byClass("sales_summary");
              const excessCell  = byClass("est_overstock");
              const aisCell     = byClass("est_ais");
              const actionCell  = byClass("actions") || byClass("fixed-action-column");

              const pd = parseProductDetails(productCell?.innerText);

              const ageBuckets = {};
              (ageCell?.innerText || "").split("\n").forEach(line => {
                const m = line.match(/^([\d+\-\u2013]+):(\d+)\s*$/);
                if (m) ageBuckets[m[1].replace(/\u2013/g, "-")] = Number(m[2]);
              });
              const totalUnits = Object.values(ageBuckets).reduce((a, b) => a + b, 0);

              const onHandMatch = (levelCell?.innerText || "").match(/On-hand[^\d]*(\d+)/i);
              const recMinMatch = (levelCell?.innerText || "").match(/Recommended min\. level[^\d]*(\d+)\s*\|\s*(\d+)\s*DoS/i);

              return {
                asin: pd.ASIN || "",
                sku: pd.SKU || "",
                fnsku: pd.FNSKU || "",
                title: pd.title || "",
                ageBuckets,
                totalUnits,
                onHand: onHandMatch ? Number(onHandMatch[1]) : null,
                recommendedMinUnits: recMinMatch ? Number(recMinMatch[1]) : null,
                recommendedMinDoS:   recMinMatch ? Number(recMinMatch[2]) : null,
                excessUnits: Number((excessCell?.innerText || "0").trim()) || 0,
                estAisTotal: (aisCell?.innerText || "").replace(/^Total:\s*/, "").trim(),
                recommendedAction: (actionCell?.innerText || "").trim(),
                sellThroughRaw: byClass("sell_through")?.innerText.trim() || "",
                salesSummaryRaw: salesCell?.innerText.trim() || "",
                feePerUnitRaw: byClass("est_fee_per_unit_sold")?.innerText.trim() || "",
                yourPriceRaw: byClass("your_price")?.innerText.trim() || "",
              };
            });
          }

          // ── Local log collector — avoids async LOG_ENTRY race with finalizeInventoryAgeScan ──
          const scanLog = [];
          const ts = () => new Date().toISOString().replace("T", " ").slice(0, 23);
          const sLog  = (...a) => { console.log(...a);  scanLog.push(`${ts()} [LOG]   ${a.join(" ")}`); };
          const sWarn = (...a) => { console.warn(...a); scanLog.push(`${ts()} [WARN]  ${a.join(" ")}`); };
          const sErr  = (...a) => { console.error(...a);scanLog.push(`${ts()} [ERROR] ${a.join(" ")}`); };

          // ── Virtual-scroll reveal loop ────────────────────────────────────────
          // kat-table uses virtual rendering: only ~20 visible rows rendered at once.
          // Scroll to the last rendered row repeatedly to trigger lazy load of more.
          const totalItems = parseInt(
            document.querySelector("kat-pagination")?.getAttribute("total-items") || "0", 10
          );
          sLog(`[InventoryAge] total-items attr: ${totalItems}`);

          chrome.storage.local.set({ _inventoryAgeProgress: {
            active: true, phase: "scrape", totalItems, rowsSoFar: 0,
          } }).catch(() => {});

          // Scroll loop: keep scrolling until we have all items or no new rows appear
          const scrollDeadline = Date.now() + 60000;
          let stableCount = 0;
          let lastRendered = 0;

          while (Date.now() < scrollDeadline) {
            const rendered = document.querySelectorAll("kat-table-row ipv2-product-details").length;

            if (totalItems > 0 && rendered >= totalItems) {
              sLog(`[InventoryAge] all ${rendered} rows rendered`);
              break;
            }

            if (rendered === lastRendered) {
              stableCount++;
              if (stableCount >= 4) {
                sLog(`[InventoryAge] row count stable at ${rendered} — stopping scroll`);
                break;
              }
            } else {
              stableCount = 0;
              lastRendered = rendered;
            }

            // Scroll last rendered row into view to trigger next batch
            const allRendered = document.querySelectorAll("kat-table-row ipv2-product-details");
            if (allRendered.length > 0) {
              allRendered[allRendered.length - 1].scrollIntoView({ behavior: "instant", block: "end" });
            }

            chrome.storage.local.set({ _inventoryAgeProgress: {
              active: true, phase: "scrape", totalItems, rowsSoFar: rendered,
            } }).catch(() => {});

            await new Promise(r => setTimeout(r, 600));
          }

          let allRows = scrapeInventoryRows();
          sLog(`[InventoryAge] scrape complete: ${allRows.length} rows (total-items: ${totalItems})`);

          const tldMap = { de:'DE','co.uk':'GB',fr:'FR',it:'IT',es:'ES',nl:'NL',pl:'PL',se:'SE',com:'US','com.tr':'TR','com.be':'BE',ae:'AE',sa:'SA',sg:'SG','co.jp':'JP','in':'IN','com.au':'AU','com.mx':'MX',ca:'CA','com.br':'BR' };
          const tld = window.location.hostname.replace(/^.*?amazon\./, '');
          const mktCode = tldMap[tld] || tld.toUpperCase() || "??";
          sLog(`[InventoryAge] scan complete: ${allRows.length} rows, market: ${mktCode}`);

          const bgResp = await chrome.runtime.sendMessage({
            type: "INVENTORY_AGE_ROWS", tabId,
            rows: allRows,
            hasNextPage: false,
            marketCode: mktCode,
            scanLog,
          });
          sendResponse({ success: true, action: bgResp?.action });
        } catch (error) {
          console.error("[SellerTools] SCRAPE_INVENTORY_AGE error:", error);
          await chrome.runtime.sendMessage({ type: "INVENTORY_AGE_ROWS", tabId, rows: [], hasNextPage: false, marketCode: "??" }).catch(() => {});
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }

  });

  // ── Brand Scanner ──────────────────────────────────────────────────────────
  // Each brand gets its own tab opened by background.js with ?s=BrandName in URL.
  // This content script auto-detects that param on load, waits for table, extracts.

  const BRAND_SCANNER_PATH = "/performance/account/health/product-policies";

  function brandLog(...args) { console.log("[BrandScanner]", ...args); }

  (function brandScannerAutoRun() {
    if (!window.location.pathname.startsWith(BRAND_SCANNER_PATH)) return;

    const brandParam = new URLSearchParams(window.location.search).get("s");
    if (!brandParam) return;

    const brand = decodeURIComponent(brandParam);
    brandLog("Auto-run for brand:", brand);

    brandWaitForTableRows(12000).then(() => {
      const rows = brandExtractRows();
      brandLog("Sending result — rows:", rows.length);
      chrome.runtime.sendMessage({ type: "BRAND_SCANNER_PAGE_RESULT", brand, rows });
    });
  })();

  function brandPageIsReady() {
    // Violations present
    if (document.querySelector("[class*='ahd-product-policy-table-row']")) return true;
    // Explicit "no violations" message
    if (document.body?.innerText?.includes("Zero policy violation warnings")) return true;
    return false;
  }

  async function brandWaitForTableRows(timeoutMs) {
    const sleep = ms => new Promise(r => window.setTimeout(r, ms));
    await sleep(600); // let React mount

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (brandPageIsReady()) {
        await sleep(300); // brief settle
        return;
      }
      await sleep(200);
    }
    brandLog("Timeout waiting for table rows or zero-state");
  }

  function brandExtractRows() {
    const allRows = Array.from(document.querySelectorAll("[class*='ahd-product-policy-table-row']"));
    // Keep only top-level rows — skip any row that is nested inside another matching row
    const tableRows = allRows.filter(
      row => !row.parentElement?.closest("[class*='ahd-product-policy-table-row']")
    );
    brandLog("Found top-level table rows:", tableRows.length, "(total matched:", allRows.length, ")");

    // Collect by reason — keep the highest SKU count seen
    // (same reason can appear twice: once expanded with count, once collapsed with 0)
    const byReason = new Map();

    for (const row of tableRows) {
      const link = row.querySelector("a");
      if (!link) continue;
      const reason = link.innerText?.trim();
      if (!reason) continue;

      // SKU count can be inside nested child elements — use full innerText of the row.
      const rowText = row.innerText || "";
      const skuMatch = rowText.match(/(\d[\d,.]*)\s+SKUs?\s+impacted/i);
      const skus = skuMatch ? parseInt(skuMatch[1].replace(/[,.]/g, ""), 10) : 0;

      const existing = byReason.get(reason);
      if (existing === undefined || skus > existing) {
        byReason.set(reason, skus);
      }
    }

    const results = Array.from(byReason.entries()).map(([reason, skus]) => ({ reason, skus }));
    brandLog("Extracted unique rows:", results.length);
    return results;
  }

  // Auto-run account switcher automation from storage — triggered when popup stores _pendingAccountSwitch
  if (window.location.href.includes("/account-switcher/")) {
    (async () => {
      try {
        console.log("[SellerTools] account-switcher: content script active, waiting 1.5s for Vue…");
        await new Promise((r) => setTimeout(r, 1500));
        const { _pendingAccountSwitch: pending } = await chrome.storage.local.get("_pendingAccountSwitch");
        console.log("[SellerTools] account-switcher: _pendingAccountSwitch =", JSON.stringify(pending));
        if (!pending) { console.log("[SellerTools] account-switcher: no pending switch, stopping"); return; }
        if (Date.now() - (pending.ts || 0) > 60000) { console.log("[SellerTools] account-switcher: pending expired"); return; }
        await chrome.storage.local.remove("_pendingAccountSwitch");
        console.log("[SellerTools] account-switcher: starting accountSelectRun");
        await accountSelectRun(pending.sellerName, pending.marketLabel);
      } catch (e) {
        console.error("[SellerTools] account-switcher auto-trigger error:", e);
      }
    })();
  }

  if (pricingIsTargetPage()) {
    const sessionState = pricingGetSessionState();
    const url = pricingGetUrl();

    if (sessionState.active || url.searchParams.get(pricingFixerStartParam) === "1" || url.searchParams.get("status") === pricingIssueStatus) {
      pricingScheduleAutoStart(sessionState.active ? "session-resume" : "auto-detect");
    }

    if (url.searchParams.get(b2bFixerStartParam) === "1") {
      window.setTimeout(() => { void b2bRunFixer(); }, pricingFixerConfig.PAGE_DELAY_MS);
    }
  }

  if (isAmazon) {
    void notifyBackgroundWhenReady();
  }
  void ibaRunCurrentPhase().catch((error) => {
    ibaLog("Automation failed.", error);
  });
})();
