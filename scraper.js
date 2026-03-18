(async () => {

const skus = new Set();
let stopRequested = false;
const skuLimit = Number.isInteger(window.__sellerExtensionDraftSkuLimit) && window.__sellerExtensionDraftSkuLimit > 0
  ? window.__sellerExtensionDraftSkuLimit
  : null;

window.__sellerExtensionStopRequested = false;

chrome.runtime.onMessage.addListener((message) => {
  if(message?.type === "STOP_SCRAPING"){
    stopRequested = true;
    window.__sellerExtensionStopRequested = true;
  }
});

function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

function shouldStop(){
  return stopRequested || window.__sellerExtensionStopRequested === true;
}

function getAccountLabel(){
  const globalLabel = document.querySelector(".dropdown-account-switcher-header-label-global")?.textContent?.trim();
  const regionalLabel = document.querySelector(".dropdown-account-switcher-header-label-regional-child")?.textContent?.trim();

  if(globalLabel && regionalLabel){
    return `${globalLabel} ${regionalLabel}`;
  }

  if(globalLabel){
    return globalLabel;
  }

  return "amazon_skus";
}

function getMarketplaceLabel(){
  return document.querySelector(".dropdown-account-switcher-header-label-regional-child")?.textContent?.trim() || "";
}

function sanitizeFileName(value){
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

function getCurrentPageNumber(){
  const pageValue = new URL(window.location.href).searchParams.get("page");
  const parsedPage = Number.parseInt(pageValue || "1", 10);
  return Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
}

function collect(){
  document.querySelectorAll("div[data-sku]").forEach((el) => {
    const sku = el.getAttribute("data-sku");
    if(sku && (!skuLimit || skus.size < skuLimit)) {
      skus.add(sku);
    }
  });
}

async function loadFullPage(){
  let lastCount = 0;
  let stableRounds = 0;

  for(let i = 0; i < 200; i++){
    if(shouldStop()){
      break;
    }

    window.scrollBy(0, 1000);
    collect();
    await sleep(500);

    if(skus.size === lastCount){
      stableRounds++;
    } else {
      stableRounds = 0;
    }

    lastCount = skus.size;

    if(skuLimit && skus.size >= skuLimit){
      break;
    }

    if(stableRounds >= 5){
      break;
    }
  }
}

function hasNextPage(){
  const pagination = document.querySelector("kat-pagination");

  if(!pagination?.shadowRoot){
    return false;
  }

  const btn = pagination.shadowRoot.querySelector('[aria-label="Navigate forward"]');

  if(!btn){
    return false;
  }

  if(btn.disabled || btn.hasAttribute("disabled")){
    return false;
  }

  return btn.getAttribute("aria-disabled") !== "true";
}

const pageNumber = getCurrentPageNumber();
console.log("Processing page", pageNumber);

await loadFullPage();

console.log("FINAL SKU COUNT:", skus.size);

chrome.runtime.sendMessage({
  type: "DRAFT_PAGE_RESULTS",
  pageNumber,
  skus: [...skus],
  marketplace: getMarketplaceLabel(),
  accountLabel: sanitizeFileName(getAccountLabel()) || "amazon_skus",
  hasNextPage: hasNextPage(),
  stopped: shouldStop()
});

chrome.runtime.sendMessage({ type: "SCRAPING_FINISHED" });

})();
