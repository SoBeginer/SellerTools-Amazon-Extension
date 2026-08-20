(() => {
  // ── Storage keys ─────────────────────────────────────────────────────────
  const CONSOLE_LOG_KEY  = "seller_extension_console_log_v1";   // local
  const LANGUAGE_KEY     = "seller_extension_language_v1";      // sync
  const AMAZON_MODEL_KEY = "seller_extension_amazon_model_v1";  // sync
  const USER_TYPE_KEY    = "seller_extension_user_type_v1";     // sync
  const MCF_ORDERS_KEY   = "seller_extension_mcf_orders_v1";    // sync
  const QMS_HIDDEN_KEY   = "_qmsHiddenMarkets";                 // local
  const MARKET_CACHE_KEY = "seller_extension_market_cache_v2";  // local

  // ── i18n strings ────────────────────────────────────────────────────────
  // Keys used by [data-i18n] attributes in the HTML.
  // All non-EN languages fall back to EN for any missing key.
  const STRINGS = {
    en: {
      pageTitle:        "SellerTools — Settings",
      title:            "SellerTools Settings",
      sectionGeneral:   "General",
      sectionAutomation:"Automation",
      sectionProfile:   "Account Profile",
      labelLanguage:    "Language",
      labelConsoleLog:  "Console Log Download",
      descConsoleLog:   "Auto-download browser console log after each feature completes",
      labelAiFeatures:  "AI Features",
      descAiFeatures:   "Enable paid AI-powered automation features",
      labelAmazonModel: "Amazon model",
      descAmazonModel:  "How you fulfill orders on Amazon",
      labelUserType:    "Your role",
      optSeller:        "Seller",
      optAgency:        "Freelancer / Agency",
      labelMcf:         "MCF Orders",
      descMcf:          "Using Multi-Channel Fulfillment via Amazon",
      btnSave:          "Save",
      btnDiag:          "Run Diagnostics",
      btnClearCache:    "Clear Cache",
      msgSaved:         "Settings saved",
      msgCacheCleared:  "Cache cleared",
      msgError:         "Failed to save",
      diagTitle:        "=== Diagnostics ===",
      diagConsoleLog:   "Console Log Download",
      diagLanguage:     "Language",
      diagAmazonModel:  "Amazon Model",
      diagUserType:     "User Type",
      diagMcf:          "MCF Orders",
      diagEnabled:      "Enabled",
      diagDisabled:     "Disabled",
      diagYes:          "Yes",
      diagNo:           "No",
      diagDone:         "Done.",
    },
    "zh-CN": {
      pageTitle:        "SellerTools — 设置",
      title:            "SellerTools 设置",
      sectionGeneral:   "常规",
      sectionAutomation:"自动化",
      sectionProfile:   "账户资料",
      labelLanguage:    "语言",
      labelConsoleLog:  "控制台日志下载",
      descConsoleLog:   "每次功能完成后自动下载浏览器控制台日志",
      labelAiFeatures:  "AI 功能",
      descAiFeatures:   "启用付费 AI 自动化功能",
      labelAmazonModel: "Amazon 模式",
      descAmazonModel:  "您在 Amazon 上的订单履行方式",
      labelUserType:    "Your role",
      optSeller:        "卖家",
      optAgency:        "自由职业者 / 代理商",
      labelMcf:         "MCF 订单",
      descMcf:          "通过 Amazon 使用多渠道配送",
      btnSave:          "保存",
      btnDiag:          "运行诊断",
      btnClearCache:    "清除缓存",
      msgSaved:         "设置已保存",
      msgCacheCleared:  "缓存已清除",
      msgError:         "保存失败",
      diagTitle:        "=== 诊断 ===",
      diagConsoleLog:   "控制台日志",
      diagLanguage:     "语言",
      diagAmazonModel:  "Amazon 模式",
      diagUserType:     "用户类型",
      diagMcf:          "MCF 订单",
      diagEnabled:      "已启用",
      diagDisabled:     "已禁用",
      diagYes:          "是",
      diagNo:           "否",
      diagDone:         "完成。",
    },
  };
  // All other languages fall back to English strings.

  // ── Elements ──────────────────────────────────────────────────────────────
  const languageSelect   = document.getElementById("languageSelect");
  const consoleLogToggle = document.getElementById("consoleLogToggle");
  const aiFeaturesToggle = document.getElementById("aiFeaturesToggle");
  const mcfOrdersToggle  = document.getElementById("mcfOrdersToggle");
  const diagBtn          = document.getElementById("diagBtn");
  const clearCacheBtn    = document.getElementById("clearCacheBtn");
  const statusMsg        = document.getElementById("statusMsg");
  const diagOutput       = document.getElementById("diagOutput");
  const versionLabel     = document.getElementById("versionLabel");

  let currentLang = "en";

  function getStrings(lang) {
    return STRINGS[lang] ? { ...STRINGS.en, ...STRINGS[lang] } : STRINGS.en;
  }

  // ── Apply translations ────────────────────────────────────────────────────
  function applyLang(lang) {
    currentLang = lang;
    const s = getStrings(lang);
    document.documentElement.lang = lang;
    document.title = s.pageTitle;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (s[key] !== undefined) el.textContent = s[key];
    });
  }

  // ── Status toast ──────────────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    statusMsg.textContent = msg;
    statusMsg.classList.toggle("error", isError);
    // Restart animation even if already playing: remove class, force reflow, re-add
    statusMsg.classList.remove("toast-play");
    void statusMsg.offsetWidth;
    statusMsg.classList.add("toast-play");
  }

  // ── Radio helpers ─────────────────────────────────────────────────────────
  function getRadioValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || null;
  }

  function setRadioValue(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  async function loadSettings() {
    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get([LANGUAGE_KEY, AMAZON_MODEL_KEY, USER_TYPE_KEY, MCF_ORDERS_KEY]),
      chrome.storage.local.get(CONSOLE_LOG_KEY),
    ]);

    const lang = syncResult[LANGUAGE_KEY] || "en";
    languageSelect.value = lang;
    applyLang(lang);

    consoleLogToggle.checked = localResult[CONSOLE_LOG_KEY] === true;
    mcfOrdersToggle.checked  = syncResult[MCF_ORDERS_KEY] === true;

    setRadioValue("amazonModel", syncResult[AMAZON_MODEL_KEY] || "fba_fbm");
    setRadioValue("userType",    syncResult[USER_TYPE_KEY]    || "seller");
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────
  async function saveSettings() {
    try {
      const lang        = languageSelect.value;
      const amazonModel = getRadioValue("amazonModel") || "fba_fbm";
      const userType    = getRadioValue("userType")    || "seller";

      await Promise.all([
        chrome.storage.sync.set({
          [LANGUAGE_KEY]:     lang,
          [AMAZON_MODEL_KEY]: amazonModel,
          [USER_TYPE_KEY]:    userType,
          [MCF_ORDERS_KEY]:   mcfOrdersToggle.checked,
        }),
        chrome.storage.local.set({
          [CONSOLE_LOG_KEY]: consoleLogToggle.checked,
        }),
      ]);

      showToast(getStrings(currentLang).msgSaved);
    } catch {
      showToast(getStrings(currentLang).msgError, true);
    }
  }

  // ── Clear cache ───────────────────────────────────────────────────────────
  async function clearCache() {
    const cacheKeys = [
      "_shippingTemplateList",
      "_priceChangeProgress",
      "_templateDeleteProgress",
      "_marketCache",
      "_marketSelection",
    ];
    await chrome.storage.local.remove(cacheKeys);
    showToast(getStrings(currentLang).msgCacheCleared);
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────
  async function runDiagnostics() {
    diagBtn.disabled = true;
    diagOutput.style.display = "block";
    const s = getStrings(currentLang);

    const [syncResult, localResult] = await Promise.all([
      chrome.storage.sync.get([LANGUAGE_KEY, AMAZON_MODEL_KEY, USER_TYPE_KEY, MCF_ORDERS_KEY]),
      chrome.storage.local.get(CONSOLE_LOG_KEY),
    ]);

    const lines = [
      s.diagTitle,
      "",
      `${s.diagConsoleLog.padEnd(22)} ${localResult[CONSOLE_LOG_KEY] ? s.diagEnabled : s.diagDisabled}`,
      `${s.diagLanguage.padEnd(22)} ${syncResult[LANGUAGE_KEY] || "en"}`,
      `${s.diagAmazonModel.padEnd(22)} ${(syncResult[AMAZON_MODEL_KEY] || "fba_fbm").toUpperCase()}`,
      `${s.diagUserType.padEnd(22)} ${syncResult[USER_TYPE_KEY] || "seller"}`,
      `${s.diagMcf.padEnd(22)} ${syncResult[MCF_ORDERS_KEY] ? s.diagYes : s.diagNo}`,
      "",
      `Extension ID: ${chrome.runtime.id}`,
      `Manifest:     v${chrome.runtime.getManifest().version}`,
      "",
      s.diagDone,
    ];

    diagOutput.textContent = lines.join("\n");
    diagBtn.disabled = false;
  }

  // ── Quick Market Switcher — keyboard shortcut picker ─────────────────────
  const QMS_SHORTCUT_KEY = "_qmsShortcut";
  const QMS_DEFAULT_SHORTCUT = { key: "s", shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, display: "Shift+S" };

  function shortcutFromEvent(e) {
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
    const parts = [];
    if (e.ctrlKey)  parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey)   parts.push("Alt");
    if (e.metaKey)  parts.push("⌘");
    if (!parts.length) return null; // bare letter without modifier — rejected
    const keyLabel = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(keyLabel);
    const normalizedKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    return { key: normalizedKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, display: parts.join("+") };
  }

  async function loadQmsShortcut() {
    const box      = document.getElementById("qmsShortcutBox");
    const resetBtn = document.getElementById("qmsShortcutReset");
    if (!box) return;

    const { [QMS_SHORTCUT_KEY]: saved } = await chrome.storage.local.get(QMS_SHORTCUT_KEY);
    box.textContent = (saved || QMS_DEFAULT_SHORTCUT).display;

    let listening = false;

    box.addEventListener("focus", () => {
      listening = true;
      box.textContent = "Press keys…";
      box.style.borderColor = "#3b82f6";
      box.style.boxShadow   = "0 0 0 3px rgba(59,130,246,0.15)";
      box.style.color       = "#6b7280";
    });

    box.addEventListener("blur", () => {
      listening = false;
      box.style.borderColor = "";
      box.style.boxShadow   = "";
      box.style.color       = "#111827";
      chrome.storage.local.get(QMS_SHORTCUT_KEY, (d) => {
        box.textContent = (d[QMS_SHORTCUT_KEY] || QMS_DEFAULT_SHORTCUT).display;
      });
    });

    box.addEventListener("keydown", async (e) => {
      if (!listening) return;
      e.preventDefault();
      e.stopPropagation();
      const sc = shortcutFromEvent(e);
      if (!sc) { box.textContent = "Need modifier…"; return; }
      listening = false;
      box.textContent = sc.display;
      box.style.borderColor = "";
      box.style.boxShadow   = "";
      box.style.color       = "#111827";
      box.blur();
      await chrome.storage.local.set({ [QMS_SHORTCUT_KEY]: sc });
      showToast(getStrings(currentLang).msgSaved);
    });

    resetBtn?.addEventListener("click", async () => {
      await chrome.storage.local.set({ [QMS_SHORTCUT_KEY]: QMS_DEFAULT_SHORTCUT });
      box.textContent = QMS_DEFAULT_SHORTCUT.display;
      showToast(getStrings(currentLang).msgSaved);
    });
  }

  // ── Quick Market Switcher market visibility ──────────────────────────────
  const QMS_FLAGS = {
    "germany": "🇩🇪", "france": "🇫🇷", "italy": "🇮🇹", "spain": "🇪🇸",
    "united kingdom": "🇬🇧", "uk": "🇬🇧", "netherlands": "🇳🇱", "poland": "🇵🇱",
    "sweden": "🇸🇪", "belgium": "🇧🇪", "ireland": "🇮🇪", "turkey": "🇹🇷",
    "czechia": "🇨🇿", "czech republic": "🇨🇿", "austria": "🇦🇹",
    "united states": "🇺🇸", "usa": "🇺🇸", "canada": "🇨🇦", "mexico": "🇲🇽",
    "japan": "🇯🇵", "australia": "🇦🇺", "singapore": "🇸🇬", "india": "🇮🇳",
    "uae": "🇦🇪", "united arab emirates": "🇦🇪", "saudi arabia": "🇸🇦", "egypt": "🇪🇬",
  };

  async function loadQmsMarkets() {
    const listEl = document.getElementById("qmsMarketList");
    if (!listEl) return;

    const [cacheResult, hiddenResult] = await Promise.all([
      chrome.storage.local.get(MARKET_CACHE_KEY),
      chrome.storage.local.get(QMS_HIDDEN_KEY),
    ]);

    const markets = cacheResult[MARKET_CACHE_KEY]?.data?.standaloneRegionalAccounts || [];
    const hiddenSet = new Set(hiddenResult[QMS_HIDDEN_KEY] || []);

    listEl.innerHTML = "";

    if (markets.length === 0) {
      listEl.innerHTML = '<div style="font-size:13px;color:#999;padding:4px 0;">No markets loaded yet — open Seller Central and use the extension\'s market selector first.</div>';
      return;
    }

    markets.forEach((market) => {
      const mkid = market.ids?.mons_sel_mkid;
      const flag = QMS_FLAGS[(market.label || "").toLowerCase()] || "🌐";
      const isVisible = !hiddenSet.has(mkid);

      const row = document.createElement("div");
      row.className = "row";

      const labelDiv = document.createElement("div");
      labelDiv.className = "row-label";
      const span = document.createElement("span");
      span.textContent = `${flag} ${market.label || "Unknown"}`;
      labelDiv.appendChild(span);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isVisible;
      const track = document.createElement("span");
      track.className = "toggle-track";
      toggleLabel.appendChild(input);
      toggleLabel.appendChild(track);

      input.addEventListener("change", async () => {
        const { [QMS_HIDDEN_KEY]: current = [] } = await chrome.storage.local.get(QMS_HIDDEN_KEY);
        const updated = new Set(current);
        if (input.checked) { updated.delete(mkid); } else { updated.add(mkid); }
        await chrome.storage.local.set({ [QMS_HIDDEN_KEY]: [...updated] });
        showToast(getStrings(currentLang).msgSaved);
      });

      row.appendChild(labelDiv);
      row.appendChild(toggleLabel);
      listEl.appendChild(row);
    });
  }

  // ── Version label ─────────────────────────────────────────────────────────
  function setVersion() {
    versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  // ── Auto-save wire-up (each control saves immediately on change) ──────────
  languageSelect.addEventListener("change", () => { applyLang(languageSelect.value); void saveSettings(); });
  consoleLogToggle.addEventListener("change", () => void saveSettings());
  mcfOrdersToggle.addEventListener("change", () => void saveSettings());
  document.querySelectorAll("input[name='amazonModel']").forEach(r => r.addEventListener("change", () => void saveSettings()));
  document.querySelectorAll("input[name='userType']").forEach(r => r.addEventListener("change", () => void saveSettings()));

  clearCacheBtn.addEventListener("click", clearCache);
  diagBtn.addEventListener("click", runDiagnostics);

  // ── Init ──────────────────────────────────────────────────────────────────
  setVersion();
  loadSettings();
  loadQmsShortcut();
  loadQmsMarkets();
})();
