# SellerTools Amazon Extension — instrukce pro Claude

## KRITICKÁ PRAVIDLA — číst vždy před jakýmkoliv programováním

1. **Před každou editací souboru přečíst aktuální stav** pomocí Read toolu. Nikdy neupravovat soubor pouze z paměti nebo z kontextu konverzace.
2. **Nikdy nenahrazovat celou funkci najednou** — vždy použít chirurgický Edit tool s přesným `old_string`/`new_string`. PowerShell/Bash nahrazení celých bloků jsou zakázány pokud uživatel explicitně nepožádá.
3. **Před smazáním nebo přepsáním kódu** — přečíst okolní kontext (minimálně 50 řádků před a po), aby bylo jasné co existující kód dělá a co se musí zachovat.
4. **Funkční části kódu neměnit** bez přímého pokynu — pokud opravuji funkci X, nesmím přepsat funkci Y která s ní sousedí.
5. **Při nejistotě** — raději se zeptat než přepsat.

---

## Přehled projektu

SellerTools je Chrome extension (MV3, v0.13.0) pro automatizaci Amazon Seller Central. Podporuje multi-market operace přes evropské a další Amazon marketplace.

**Hlavní featury:**
- Draft Scraping (multi-market, scheduling, collection)
- Pricing Fixer (Min/Max ceny na "pricing_issue" produktech)
- Shipping Template Creator (z CSV, automatizace vytváření)
- Shipping Price Change (hromadná změna cen šablon, multi-market)
- Delete Shipping Templates (multi-market)
- Invoice Downloader (PDF/ZIP stahování faktur)
- VAT Report Export (CSV/ZIP export)
- IBA (Immediate Buy Alerts) automatizace + scheduling
- Market Switcher (přepínání marketů)
- Bookmarks (záložky Seller Central stránek)

---

## Skilly v projektu (routing + údržba)

Projekt má v `.claude/skills/` tři provázané skilly, které dohromady pokrývají celý životní cyklus Chrome extension:

| Skill | Doména | Vyvolej když… |
|-------|--------|---------------|
| `chrome-extension-engineering` | _Jak to postavit_ — MV3, service worker, messaging, content scripts, storage, CSP, build tooling | Technická implementace, debugování, architektonická rozhodnutí |
| `responsible-scraping` | _Jak to bezpečně spouštět_ — anti-detekce, rate limiting, Amazon-specific signály, ToS, recovery po lockoutu | Jakákoli interakce s autentizovanými commerce platformami (Seller Central, eBay, Shopify) |
| `extension-best-practices` | _Jestli to projde_ — Chrome Web Store policies, privacy disclosure, permissions justification, review proces | Příprava na CWS submission, řešení rejection, psaní listing/privacy textů |

Každý skill má sekci `## Sibling Skills in This Project`, která popisuje, kdy vyvolat sourozence. Cross-cutting úlohy (např. „publish scraper na CWS") obvykle potřebují **všechny tři**.

**Údržba provázanosti:** Když přidáš nebo zásadně změníš skill v `.claude/skills/`, **aktualizuj `Sibling Skills` sekce ve všech relevantních SKILL.md**, aby cross-reference zůstaly konzistentní. Neexistuje automatický check — konzistence se drží tímto pravidlem v `CLAUDE.md`.

---

## Technický stack

- MV3 vanilla JS, žádný bundler, žádný npm
- Přímé editace `.js` souborů
- **background.js** — service worker, orchestrace, message routing, tab lifecycle
- **content.js** — content script (auto-inject na všechny URL), DOM interakce, market API
- **popup.html + popup.js** — UI popup, 4000+ řádků, všechny user workflows
- **options.html + options.js** — nastavení extension
- **invoice_downloader.js** — injektovaný skript pro stahování faktur
- **shipping_price_changer.js** — injektovaný skript pro manipulaci cen šablon
- **shipping_template_automator.js** — injektovaný skript pro vytváření šablon (web accessible resource)

---

## Testování

- Zachycuj `console.log`, `console.error`, `console.warn` z DevTools přes `mcp__claude-in-chrome__read_console_messages`
- Ukládej výsledky testů do `test_logs/` jako `.md`: `YYYY-MM-DD_HH-MM_název-funkce.md`
- Pokud test selže, automaticky oprav kód a otestuj znovu
- Testujeme na `sellercentral.amazon.de` s Work Chrome profilem
- Extension ID: `bbkhmcbnddmogfbgpfeedmmpmipafmef`

---

## Architektura: klíčové vzory

### 1. Tab State Management (background.js)

`taskStateByTabId` (Map) sleduje aktivní operace per tab:
```js
taskState = {
  taskType: "draftScraping" | "priceChange" | "listShippingTemplates" | "deleteTemplate" | ...
  phase: "switch" | "selectEdit" | "applyChange" | "load" | "delete"
  tabId: number
  expectedUrl: string   // safety check v onUpdated
  processing: boolean   // zabraňuje re-entrant execution
  runId: string         // pro draftScraping
  // ...další task-specific pole
}
```

`chrome.tabs.onUpdated` listener routuje page loady na phase handlery podle `taskType` + `phase`.

### 2. Vícekrokové multi-market workflow (queue pattern)

Queue uložena v `chrome.storage.local`. Po každé operaci se posune `currentIndex`. Background automaticky naviguje na další market/šablonu.

**Příklad — Price Change queue:**
```js
priceChangeQueue = {
  config: { direction, changeType, amount, priceType, dryRun },
  templates: [{ name, origin, marketCode, mkid, mcid, globalAccountId }],
  currentIndex: number,
  totalChanged: number,
  errors: [{ template, error }],
  baseDomain: string
}
```

Fáze: `switch` (/home s market params) → `selectEdit` (/sbr#shipping_templates) → `applyChange` (edit URL)

### 3. Dual-world injection

- **MAIN world**: `window.open` interceptor, Backbone model capture — přístup k page JS
- **ISOLATED world**: `chrome.runtime`/storage přístup
- **Bridge**: CustomEvent (`__invoicePdfCaptured`) pro předávání dat mezi světy

### 4. React-aware form automation

`setNativeValue(el, value)` — používá property descriptors pro obejití React controlled inputs:
```js
const nativeSetter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
nativeSetter.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

### 5. Progress tracking (UI polling)

Popup polluje `chrome.storage.local` pro progress keys. Background zapisuje do storage, popup čte a renderuje.

---

## Market Switcher

### Přepínání marketů (popup → tab)

`buildMarketSwitchUrl(regionalAccount)` sestaví URL s params `mons_sel_mkid`, `mons_sel_dir_mcid`, `mons_sel_dir_paid`, `ignore_selection_changed=true`.

```js
await chrome.tabs.update(tab.id, { url: buildMarketSwitchUrl(regionalAccount) });
```

Doménový mapping: `MKID_TO_DOMAIN` konstanta v `popup.js`.

### Získání seznamu marketů

Z content scriptu přes `GET_MARKET_DATA` message:
1. `GET /account-switcher/global-and-regional-account/merchantMarketplace` → aktuální kontext
2. `GET /account-switcher/regional-accounts/merchantMarketplace?globalAccountId={id}` → všechny markety

**Agency účty (sub-účty):** Při `parentGlobalAccount != null` vrátí plain `?globalAccountId=` prázdné pole. Kód zkouší postupně:
1. plain `globalAccountId`
2. `globalAccountId` + `delegationContext` (funguje pro agency sub-účty)
3. `globalAccountId` + `delegationContextWithTargetPartnerAccount`
4. `parentGlobalAccountId`
5. `parentGlobalAccountId` + `delegationContext`

```js
// Z popupu:
const response = await ensureContentScriptAndSend(tab, { action: "GET_MARKET_DATA" });
const markets = response.data.standaloneRegionalAccounts;
const current = response.data.current.regionalAccount;
```

Každý market záznam:
```js
{
  label: "Germany",
  ids: { mons_sel_mkid: "amzn1.mp.o.A1PA6795UKMFR9", mons_sel_dir_mcid: "amzn1.merchant.d...." },
  globalAccountId: "amzn1.pa.d....",
  domain: null  // vždy null — doménu řeší MKID_TO_DOMAIN
}
```

### Pattern pro "proveď X na všech marketech"

1. Načti markety přes `GET_MARKET_DATA`
2. Pro každý market: přepni → počkej na load (`rpNavigateAndWait` v popup.js) → proveď akci
3. Po dokončení přepni zpět

`rpNavigateAndWait(tabId, url, timeoutMs)` — čeká na `status: "complete"` po `"loading"`.

### Agency kontext (ExaSoft/AZplaygro)

- `globalAccount.label` = aktivní sub-seller, ne agency
- `parentGlobalAccount` = null pro standalone, jinak odkaz na agency
- `globalAccount.delegationContext` = Base64 token nutný pro regional-accounts API
- Přepínání sellera samotného extension nepodporuje

---

## Klíčové message typy

### Background → Content / Popup
Všechny zprávy přes `chrome.runtime.sendMessage` a `chrome.tabs.sendMessage`.

### Popup → Background (vybrané)
| Zpráva | Popis |
|--------|-------|
| `START_DRAFT_SCRAPING` | Spustí draft scraping |
| `PRICE_CHANGE_START` | Hromadná změna cen šablon |
| `LIST_SHIPPING_TEMPLATES` | Načte seznam šablon (multi-market) |
| `DELETE_TEMPLATES` | Smaže šablony |
| `INVOICE_DOWNLOADER_START` | Spustí stahování faktur |
| `VAT_REPORT_START` | Export VAT reportu |
| `GET_MARKET_DATA` | Content script → market data |

### Background → injektované skripty
Přes `chrome.scripting.executeScript` s `func` nebo `files` parametrem.

---

## Storage schema

### chrome.storage.sync
| Klíč | Typ | Popis |
|------|-----|-------|
| `seller_extension_language_v1` | string | "en" \| "zh-CN" |
| `seller_extension_amazon_model_v1` | string | "fba" \| "fbm" \| "fba_fbm" |
| `seller_extension_user_type_v1` | string | "seller" \| "agency" |
| `seller_extension_dry_run_v1` | boolean | Dry run mode |
| `seller_extension_draft_interval_schedule_v1` | object | { enabled, intervalMinutes, nextRun, selectedEmail, origin } |
| `seller_extension_iba_daily_schedule_v1` | object | { enabled, time, nextRun } |
| `sc_bookmarks_v1` | array | Záložky |

### chrome.storage.local (vybrané)
| Klíč | Popis |
|------|-------|
| `_shippingTemplateList` | [{ name, origin, marketCode, mkid, mcid, globalAccountId }] |
| `_priceChangeProgress` | { active, current, total, totalChanged, label, error } |
| `_priceChangeQueue` | Fronta price change operací |
| `_templateDeleteProgress` / `_templateDeleteQueue` | Delete template workflow |
| `_invoiceDownloaderParams` | { months, years, docType, downloadMode } |
| `_vatReportProgress` | { active, phase, message, totalMonths, ... } |
| `seller_extension_market_cache_v3` | { timestamp, data } — 30 min TTL |
| `_stFormState` | Persistence formuláře Shipping Template |
| `captureLogsEnabled` | boolean |

---

## Klíčové funkce per soubor

### background.js
- `buildZip(files)` — ZIP archiv (store mode, CRC32, bez komprese)
- `injectInvoiceDownloader(tabId, params)` — inject invoice_downloader.js
- `injectShippingPriceChanger(tabId)` — inject shipping_price_changer.js
- `buildShippingTemplatesSwitchUrl(market, baseDomain)` — URL pro přepnutí trhu
- `buildShippingTemplatesUrl(baseDomain)` — /sbr#shipping_templates URL
- `getMarketCodeFromOrigin(origin)` — DE, GB, TR, atd. z domény
- `createDraftRunState(options)` — inicializace draft run
- `finalizeDraftRun(runId)` — merge výsledků, navigace na Retool / další market
- `injectConsoleInterceptor(tabId)` — setup `window.__extensionLogBuffer`

### content.js
- `marketFetchCurrentAccountMarkets()` — volá /account-switcher/* endpointy
- `ibaGetPhase(url)` — "COLLECT" | "NEXT_IN_QUEUE" | "CONFIRM_ONE" | "START_QUEUE" | "RETOOL_SEARCH" | "DRAFT_FEED"
- `pricingFindProductContainers()` — `[class*="VolusPriceInputComposite-module__container--"]`
- `pricingGetKatInput(row)` — Amazon kat-input shadow DOM
- `pricingExtractProductChange(container)` — nextMin=50%, nextMax=200% currentPrice
- `pricingShowConfirmationModal(params)` — vrací "save" | "skip" | "stop"
- `ibaSetReactInputValue(element, value)` — React controlled input setter

### popup.js
- `buildMarketSwitchUrl(regionalAccount)` — sestaví URL s mons_sel_* params
- `rpNavigateAndWait(tabId, url, timeoutMs)` — čeká na tab load
- `loadMarketData(forceRefresh)` — market data s 30min cache
- `sortMarketsByRegion(markets)` — řadí Europe/NA/APAC/MEA
- `stParseCsv(text)` / `stParseCsvRow(line, delim)` — RFC 4180 CSV parser
- `stBuildConfig(rows, marketplace, pricingMode, ...)` — generuje shipping template config
- `setupMarketDropdown(btnId, panelId, cbClass, labelId, selectAllId)` — generický dropdown handler
- `ensureContentScriptAndSend(tab, message)` — pošle zprávu content scriptu (inject pokud není)

### shipping_price_changer.js (window.__ API)
- `window.__listShippingTemplates(timeoutMs)` → [{ name }]
- `window.__selectTemplateInSidebar(templateName)` → { selected, error? }
- `window.__getTemplateEditUrl(templateName)` → { found, editUrl?, error? }
- `window.__applyPriceChange(config)` → { success, changed, error?, navigationSave? }
- `window.__deleteShippingTemplate(templateName)` → { success, error? }

### shipping_template_automator.js (window.__ API)
- `window.__runShippingTemplateAutomation(config)` → { success, error?, log, status }
- Hlavní kroky: setTemplateName → setRateModel → toggleSSA → enableServiceType → clearSectionRows → clickAddRegion → setTransitTime → setPricing → editRegionCountries

---

## Shipping Template config struktura

```js
config = {
  templateName: string,
  rateModel: "shipment_based",
  ssaEnabled: boolean,
  addressTypes: ["STREET", "POBOX", "POSTFILIAL", "PACKSTATION"],
  domesticShipping: {
    "EU_STANDARD.DOMESTIC": {
      enabled: boolean,
      clearExisting: boolean,
      regions: [{
        countries: ["DE0"],
        transitTime: "2-3D",   // formát: "2-3D" nebo číslo "3"
        pricing: {
          model: "shipment_based",
          pricePerOrder: "3.99",  // nebo
          unitPrice: "0.99",
          unitMeasure: "Per Item"
        }
      }]
    },
    "EU_EXPEDITED.DOMESTIC": { ... },
    "EU_PREMIUM.DOMESTIC": { ... }
  },
  internationalShipping: {
    "EU_STANDARD.INTERNATIONAL": { ... }
  }
}
```

**Service type IDs:** `EU_STANDARD.DOMESTIC`, `EU_EXPEDITED.DOMESTIC`, `EU_PREMIUM.DOMESTIC`, `EU_STANDARD.INTERNATIONAL`, `EU_EXPEDITED.INTERNATIONAL`

**ALWAYS_ENABLED** (nikdy neklikat checkbox): `EU_STANDARD.DOMESTIC`

---

## Důležité Amazon URL patterny

| URL | Popis |
|-----|-------|
| `/tax/seller-fee-invoices` | Invoice download stránka |
| `/reportcentral/VAT_TRANSACTION/1` | VAT report |
| `/sbr#shipping_templates` | Seznam shipping šablon |
| `/sbr/template?request={"templateId":"...","action":"edit"}` | Edit šablony |
| `/sbr/template` | Vytvoření nové šablony |
| `/account-switcher/global-and-regional-account/merchantMarketplace` | Aktuální market kontext |
| `/account-switcher/regional-accounts/merchantMarketplace?globalAccountId={id}` | Všechny markety |
| `/myinventory/inventory/views/drafts?subview=submitted-missing-info` | Draft scraping stránka |

**Default origin:** `https://sellercentral.amazon.de`

**Retool URL:** `https://expandoadmin.retool.com/apps/010b5280-0eed-11ec-988e-5f01aea24295/Admin%20v2`

---

## DOM selektory (Amazon SC specifické)

| Selektor | Použití |
|----------|---------|
| `[class*="VolusPriceInputComposite-module__container--"]` | Pricing fixer — product containers |
| `kat-input[class*="CellInput"]` | Amazon shadow DOM input pro ceny |
| `kat-pagination` | Paginace inventáře |
| `.shipping_template_link` | Sidebar šablon na /sbr |
| `#sbrui_element_shippingTemplateLinks` | Container sidebaru šablon |
| `.a-popover-modal`, `[role="dialog"].a-popover-modal` | Amazon modaly |
| `#templateNameInput` | Název šablony na /sbr/template |
| `input[name="pricePerOrder"]`, `input[name="unitPrice"]` | Ceny v edit šablony |

---

## Známá omezení

1. **Draft Scraping** — max 1 concurrent run (`DRAFT_PARALLEL_TAB_COUNT = 1`)
2. **Pricing Fixer** — pouze Min/Max ceny, ne primární; pouze `pricing_issue` status; max 3 retries
3. **Shipping Templates** — pouze `shipment_based` rate model
4. **VAT Reports** — hardcoded na `sellercentral.amazon.de`
5. **Agency účty** — přepnutí sellera samotného nepodporováno
6. **Console Log Download** — pouze pokud explicitně zapnuto v nastavení

---

## Jak přidat novou featuru (checklist)

1. **UI** — přidej sekci do `popup.html` s toggle/formulářem
2. **Popup handler** — v `popup.js` navázat eventy, odeslat zprávu do background
3. **Background message handler** — přidat do `chrome.runtime.onMessage` switch
4. **Content script / injected script** — pokud potřeba DOM interakce
5. **Progress tracking** — storage key pro progress + polling v popup
6. **Multi-market** — použij queue pattern (viz Price Change nebo List Templates)
7. **Test** — otestuj na `sellercentral.amazon.de`, zaloguj výsledek do `test_logs/`

---

## Seller Central internals — zjištěno debuggingem

Tato sekce zachycuje non-obvious poznatky objevené reverse engineeringem a debuggingem, které nejsou zdokumentované jinde.

---

### Amazon SC DOM quirky chování

**Virtuální renderování inventáře** — `/myinventory/inventory` renderuje jen ~20 řádků najednou. Musíš scrollovat + dispatchovat `KeyboardEvent('keydown', { key:'End' })` a čekat na stabilní počet přes `SCROLL_STABLE_ROUNDS=5` kol bez růstu.

**Katal (kat-*) komponenty** — vše je v Shadow DOM. Nikdy `querySelector` přímo na host elementu:
```js
katInput.shadowRoot?.querySelector('input')        // value
katBtn.shadowRoot?.querySelector('button').click()  // click
```
Klikat na `kat-button` přes host element je nespolehlivé — vždy přes shadow `<button>`.

**Amazon AUI modaly se neodstraňují z DOM** — po zavření jen `display:none`. Kontroluj `offsetParent !== null`, ne pouhý `querySelector`.

**Compound selektor `.a-popover.a-popover-modal` nikdy nefunguje** — element má jen jednu třídu. Správný: `.a-popover-modal`.

**Třída `shipping_template_link`** — expander div sám nese tuto class. Filtrovat: `.filter(div => !div.querySelector("[data-action='a-expander-toggle']"))`.

**Skeleton-rendered tabulky** — `/tax/seller-fee-invoices` a `/sbr#shipping_templates` renderují skeleton při loadu, data přicházejí async. Vždy čekat přes polling nebo MutationObserver, ne jen na `status:'complete'`.

**`div#EU_STANDARD.DOMESTIC_region_selector`** — je hidden popover preload element, NE sekční root šablony. Filtrovat elementy uvnitř `[id*='a-popover']` a `[class*='popover-preload']`.

**International country tree — dvě kopie v DOM** — `querySelectorAll('i.a-icon-section-expand')` najde oba výskyty každého toggleu. Vždy scopovat na `input[id^='${serviceTypeId}~PRG']`.

**Řádky `<th>` uvnitř `<tbody>`** — Amazon renderuje sub-header řádky do tbody. Filtrovat: `cells.every(c => c.tagName === 'TH')`.

**Brand scanner — nested řádky** — `querySelectorAll('[class*="ahd-product-policy-table-row"]')` vrátí parent i child řádky. Filtrovat top-level: `.filter(row => !row.parentElement?.closest("[class*='ahd-product-policy-table-row']"))`.

**Inventory Age en-dash** — bucket rozsahy používají Unicode en-dash `–` (U+2013), ne ASCII pomlčku. Normalizovat: `.replace(/–/g, '-')`.

**Unstabilní BEM suffixes** — class names jako `VolusPriceInputComposite-module__container--abc12` mění suffix s každým deploym. Používat `[class*="ModuleName-module__elementName--"]`.

---

### API endpointy — nedokumentované chování

**`/account-switcher/global-and-regional-account/merchantMarketplace`** — vrací JSON pouze s headery `Accept: application/json` a `x-requested-with: XMLHttpRequest`. Bez nich vrátí HTML.

**`market.domain` je vždy `null`** — přes API nikdy nepřijde. Doménu mapuj z `mkid` přes `MKID_TO_DOMAIN` konstantu.

**Regional accounts pro agency sub-účty vrací prázdné pole** — progressive retry chain:
```js
() => tryFetchRegional(globalAccountId),
() => tryFetchRegional(globalAccountId, { delegationContext }),
() => tryFetchRegional(globalAccountId, { delegationContext: delegationContextWithTarget }),
() => tryFetchRegional(parentGlobalAccountId),
() => tryFetchRegional(parentGlobalAccountId, { delegationContext })
```

**Account label field** — různé verze API: `label`, `name`, `accountName`, `displayName`, `sellerName`. Vždy zkoušet všechny.

**Pending marketplace entries** — API vrací markety s `label` matchující `/pending/i`. Jsou neaktivní — filtrovat před zpracováním.

**Country kódy v shipping template API** — mají trailing `'0'` suffix: `'DE0'`, `'FR0'`, ne ISO-3166 `'DE'`.

**VAT report `/reportcentral/VAT_TRANSACTION/1`** — existuje pouze na `sellercentral.amazon.de`.

**IBA orders URL** — vyžaduje přesně `orderType=IBA&fulfillmentType=mfn&date-range=last-30`. Chybějící param = prázdná stránka.

---

### React/Vue hacks

**React controlled inputs — `setNativeValue` pattern** — přímý `.value =` React ignoruje:
```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
setter.call(el, value);
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```

**Katal `kat-input` — nutný `execCommand`** — nestačí native setter. `document.execCommand('insertText', false, value)` generuje `isTrusted:true` InputEvent, který aktivuje Save button. Navíc dispatchovat `CustomEvent('kat-change', { composed: true })` na host elementu.

**Shadow input `select()` nefunguje** — `document.activeElement` ukazuje na host, ne shadow input. Správně: `shadowInput.click()` → `shadowInput.focus()` → `setSelectionRange(0, len)` → `execCommand('insertText')`.

**Account switcher je Vue.js, ne React** — Vue binding reaguje na plain `input`/`change` eventy + přímý zápis do `shadowInput.value`. React-style native setter trick nefunguje.

**Backbone re-render po `shippingTime` změně** — row reference se stane stale. Vždy re-query row po nastavení transit time.

**Rate model změna triggeruje full DOM re-render** — všechny DOM reference jsou stale. Čekat na reappearance `input[name='service_type']`.

**`setTemplateName` — nikdy ne clear-then-set** — Backbone zpracuje empty string jako template name. Jeden `setNativeValue` call s výslednou hodnotou.

**Amazon AUI modaly** — `btn.click()`, ne `dispatchEvent(new MouseEvent(...))`. AUI kontroluje `event.isTrusted` — synthetic events s `isTrusted:false` jsou ignorovány.

**React B2B input reset** — po `setInputValue()` může React async resetovat hodnotu. Vždy verifikovat a opakovat:
```js
if (shadowInput.value !== strValue) { await sleep(200); valueSet = await b2bSetInputValue(bpInput, strValue); }
```

**`kat-dropdown` programmatic clear** — `clearBtn.click()` nevyvolá Vue `@kat-change` handler. Dispatchovat ručně:
```js
el.dispatchEvent(new CustomEvent('kat-change', { bubbles: true, composed: true, detail: { value: '' } }));
```

**SPP `kat-input` search** — nereaguje na `.value=` ani synthetic events. Jedině `execCommand('selectAll')` → `execCommand('delete')` → `execCommand('insertText', false, name)`.

**`kat-checkbox` disabled stav** — číst z `shadowRoot > [role='checkbox']` attr `aria-disabled`, ne z `hasAttribute('disabled')` na host elementu.

---

### Background tab omezení

**`requestAnimationFrame` throttling platí jen pro DOM rendering** — AJAX/fetch a Vue/Pinia reactive updates fungují normálně v `active: false` tabu.

**Pinia `_s` Map** — `window.pinia._s` je interní Map všech registered stores. Spolehlivější než named store přístup — funguje i když Amazon přejmenuje stores. Flat list kde všechny účty mají `hasChildren=false` je nespolehlivý → fallthrough na DOM click-reveal.

---

### Timing & async patterny

**Two-step market switch** — nelze přistát přímo na `/sbr` se `mons_sel_*` params. Vždy nejdřív `/home` (phase `switch`), pak target URL.

**`ignore_selection_changed=true`** — povinný param pro market switch. Bez něj Amazon zobrazí confirmation dialog.

**`sawLoading` flag v navigation listeneru** — `onUpdated` může vyvolat `complete` pro předchozí stránku před `loading` nové. Resolver se spustí jen po `sawLoading = true`.

**Post-save navigation = success** — po Save na template edit page Amazon naviguje pryč, Chrome destroys frame:
```js
const isNavigation = /frame|removed|detached|destroyed|navigat/i.test(err.message);
if (isNavigation) r = { success: true, navigationSave: true };
```

**Backbone SBR models** — nejsou dostupné synchronně po `complete`. Polling 500ms × 40 pokusů (20s). Méně pokusů = false negatives na pomalých připojeních.

**Notifikace preferences stránka** — reloaduje se několikrát při inicializaci. Inject jen pokud 6 sekund uplynulo bez dalšího loadu (`STABILITY_MS = 6000`).

**KAT komponenty na disbursement stránce** — registrují se asynchronně. Čekat přes `customElements.whenDefined('kat-button')` (timeout 8s) + 1.5s settle.

**Disbursement alert viditelnost** — `#disburse-now-submit-success-alert` je vždy v DOM, jen skrytý. Kontrolovat `offsetParent !== null`.

**IBA orders page** — 5s flat sleep nutný. `readyState:'complete'` nastane před XHR renderem order řádků.

**Retool inicializace** — 900ms delay po vykreslení elementů + 450ms settle po zadání hodnoty (React debounce).

**Retool result extraction — two-phase wait** — fáze 1: čekat na změnu DOM state signature. Fáze 2: čekat na non-pending výsledek. Bez fáze 1 vrátíš stale výsledek z předchozího searche.

**SPP Pinia permissions** — dva async phases. Stabilizační polling: 3 consecutive rounds se stejným počtem non-None permissions.

**1500ms delay mezi šablonami** — Amazon detekuje concurrent edits. Kratší delay = intermitentní "Template is being edited" chyby.

**SPP rate limiting** — 25s pauza každých 10 stránek, 2–4s random jitter mezi clients.

**Pricing fixer state** — `sessionStorage` (tab-scoped), záměrně ne `chrome.storage.local` — aby fixer po přerušení jiného tabu nepokračoval.

**Race condition — listener před `tabs.update`** — vždy registrovat listener PŘED voláním `chrome.tabs.update`. Na rychlých sítích `complete` přijde dřív.

---

### Account Switcher internals

**SPN vs final account detekce** — Amazon používá `.full-page-account-switcher-account-details` pro OBOJE: SPN sub-sellery i country/marketplace řádky. Rozlišení: pokud jsou VŠECHNY nově viditelné položky názvy zemí (seznam ~100 zemí + suffix `(pending registration)`), jde o marketplace selector, ne SPN. Implementace v `bgScrapeAccounts`: `isCountry()` filtr — pokud `found.every(f => isCountry(f.label))`, vrátí prázdné pole a účet není označen jako SPN.

**Sub-account sdílený mezi více SPN** — stejný účet (např. ExaSoft) může patřit pod více SPN (EXPANDO 5 i EXPANDO global SPN). `Map` s klíčem = label umožňuje jen jednoho rodiče. Řešení: duplicate entry s klíčem `${label}::${parentSPN}` — zobrazí se pod oběma SPNs.

**Click-reveal — per-iterační before/after snapshot** — nepoužívat globální `initiallyVisibleSet` (zachycen jednou na začátku). Po rozbalení SPN mohou sub-účty zůstat v DOM (Amazon Vue SPA animuje přes `height:0; overflow:hidden`, ne `display:none`). Správně: před každým kliknutím zachytit viditelné elementy (`offsetHeight > 0`), po kliknutí porovnat — jen nové jsou sub-účty.

**Expander ikona je SOUSEDNÍ element, ne dítě** — `btn.querySelector('[class*="account-expander-icon"]')` vždy vrátí null. Spolehlivá detekce = click-reveal výše.

**Account label matching — trailing suffix** — label může mít trailing token (`'SellerName DE'`). Matchovat: `text === label || text.startsWith(label + ' ')`.

**`_pendingAccountSwitch` TTL** — storage key se kontroluje s 60s expiry aby stale záznamy netriggrovaly switch.

**Aktuální account pro agency** — `globalAccount.label` = sub-seller (brand). `parentGlobalAccount.label` = agency.

**Market key = `mcid::mkid`** — ne label. Stejná country label ("Germany") může existovat u více seller accounts.

---

### Shipping Templates internals

**Template ID je v hidden input** — ne v anchor href:
```js
div.querySelector("input[type='hidden'][id^='template_id_link']")?.value
```
Edit URL: `/sbr/template?request=` + `encodeURIComponent(JSON.stringify({ templateId, action: 'edit' }))`.

**Template name cap 80 znaků** — SC truncuje. Vždy `.slice(0, 80)` při ukládání i porovnávání.

**Trailing 'DEFAULT'/'Standard' suffix** — SC appenduje k default šabloně. Stripovat: `.replace(/\s*(DEFAULT|Standard)\s*$/i, '').trim()`.

**`EU_STANDARD.DOMESTIC` je ALWAYS_ENABLED** — checkbox nikdy neklikat. Amazon ho hardcoduje jako povinný. Kliknutí = UI error nebo corrupt state.

**Domestic sections zpracovávat STANDARD-first** — EXPEDITED/PREMIUM inheretují region codes ze STANDARD. JSON key iteration je alphabetical (EXPEDITED before STANDARD). Explicitní sort:
```js
.sort(([a], [b]) => (a.includes('STANDARD') ? 0 : 1) - (b.includes('STANDARD') ? 0 : 1))
```

**Modal DOM accumulates checkboxes** — Amazon reusuje stejný modal DOM. Vždy scope clear/set operace na `input[id^='${serviceTypeId}~']`.

**Parent country-group checkbox cascade nefunguje programmaticky** — kliknout parent = parent checked, children ne. Individuálně kliknout každý unchecked child.

**`unitMeasure` option values jsou human-readable** — `'Per Item'`, `'Per Kilo'`, ne snake_case. `'Per Kilogram'` (config key) ≠ `'Per Kilo'` (option value).

**Transit time option values** — `'2_3'` ne `'2-3D'`. Open-ended `'14+'` → option value `'14_99'`.

**Backbone model attribute keys pro template ID** — nestabilní, probing: `shippingTemplateId || merchantShippingGroupId || templateId || id`. Multiple global paths: `window.SBRUI?.Main?.controller` a 3 další variace.

**`inheritRegions: true`** — pro EXPEDITED/PREMIUM domestic. Bez toho nemají pokrytí zemí.

**`address_type` checkboxes přibývají asynchronně** — nastavovat až po `setPricing()`.

---

### Invoice Downloader internals

**Injection guard — DOM `<meta>` element, ne JS variable** — každá injekce má vlastní isolated world kontext, `window.*` proměnné nejsou sdíleny. `try/finally` zajistí `.remove()` i při early return.

**PDF URL capture — MAIN world `window.open` interceptor** — isolated world nemůže override `window.open`. Background injectuje MAIN world script, který zachytí URL a odešle přes `CustomEvent('__invoicePdfCaptured')` na document.

**PDF URLs jsou relative paths** — `/documents/invoice/...`. Před fetch nutné `location.origin + url`.

**PDF fetch vyžaduje `credentials: 'include'`** — endpoint je session-authenticated, bez cookies vrátí 403.

**ZIP assembly v background.js** — content script nemůže volat `chrome.downloads`. Posílá `Uint8Array[]` přes message. ZIP je store mode (bez komprese — PDFs jsou already compressed binary).

**Amazon dvojité `window.open` volání** — pro některé řádky Amazon volá `window.open` dvakrát. Deduplikovat přes `seenUrls Set`.

**500ms sleep mezi PDF clicks** — prevence race condition mezi MAIN world interceptorem a `waitForUrl()` pro další řádek.

**Datum matching** — Amazon formátuje period dates v English abbreviations (`Jan`, `Feb`, ...) bez ohledu na SC locale.

---

### Obecné Amazon SC chování

**Custom URL params jako sentinely** — `_ibaStart=1`, `_pricingFixerStart=1` jsou fake params, Amazon je ignoruje. Content script je detekuje pro self-start automatizace.

**Cenové formáty locale** — DE: `'1.234,56'` (comma = decimal). EN: `'1,234.56'`. Normalizace:
```js
if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
```

**Price labels jsou multi-lingual** — matchovat `'Maximumpreis'`/`'Maximalpreis'`/`'Hochstpreis'` i `'maximum price'`.

**"Too Many Requests" v body textu** — Amazon vrátí rate-limit jako text, ne HTTP 429:
```js
document.body.innerText.toLowerCase().includes('too many requests')
```

**`kat-pagination` klik nespolehlivý** — React interceptuje click bez navigace. Vždy navigovat přes `window.location.href = constructedUrl`.

**Ant Design tree checkboxes** — vyžadují full pointer event sequence s reálnými `clientX/clientY`. Bare `.click()` ignorován.

**`btoa` s Unicode** — `btoa(JSON.stringify(obj))` hodí error pro non-ASCII. Správně: `btoa(unescape(encodeURIComponent(JSON.stringify(obj))))`.

**Brand scanner case-sensitivity** — `/performance/account/health/product-policies?s=BRANDNAME` je case-sensitive. Zkoušet original, UPPERCASE, lowercase varianty.

**IBA storage-based state** — Retool SPA router stripuje URL params při loadu. Stav předávat přes `chrome.storage.local` s okamžitým remove po přečtení.

**Carrier service values** — interní option values neshodují se s display labely: GLS → `'BusinessParcel'`, UPS → `'Standard'`.
