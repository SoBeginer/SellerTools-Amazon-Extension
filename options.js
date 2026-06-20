(() => {
  // ── Storage keys ─────────────────────────────────────────────────────────
  const CONSOLE_LOG_KEY  = "seller_extension_console_log_v1";   // local
  const LANGUAGE_KEY     = "seller_extension_language_v1";      // sync
  const AMAZON_MODEL_KEY = "seller_extension_amazon_model_v1";  // sync
  const USER_TYPE_KEY    = "seller_extension_user_type_v1";     // sync
  const MCF_ORDERS_KEY   = "seller_extension_mcf_orders_v1";    // sync

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
})();
