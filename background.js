// Ghost Mode — background service worker (MV3, all listeners registered synchronously)
'use strict';

const WIPE_TYPES = {
  cache: true, cacheStorage: true, cookies: true, fileSystems: true,
  indexedDB: true, localStorage: true, serviceWorkers: true, webSQL: true
};
const FAKE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const UA_RULE_ID = 9001;

async function getSettings() {
  const s = await chrome.storage.local.get({
    ghostOn: true, autoWipe: false, fakeUA: false, blockedTotal: 0, wipesTotal: 0
  });
  return s;
}

async function bump(key) {
  const s = await chrome.storage.local.get({ [key]: 0 });
  await chrome.storage.local.set({ [key]: s[key] + 1 });
  return s[key] + 1;
}

async function wipeOrigin(origin) {
  let cookiesRemoved = 0;
  try {
    const cs = await chrome.cookies.getAll({ url: origin });
    cookiesRemoved = cs.length;
  } catch (e) { /* ignore */ }
  await chrome.browsingData.remove({ origins: [origin] }, WIPE_TYPES);
  await bump('wipesTotal');
  return cookiesRemoved;
}

function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
  } catch (e) { /* ignore */ }
  return null;
}

// --- Tracker block counter (works for unpacked/dev installs via feedback API) ---
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => { bump('blockedTotal'); });
}

// --- Remember each tab's site so we can auto-wipe it when the tab closes ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && tab.url);
  const origin = url ? originOf(url) : null;
  if (origin) chrome.storage.session.set({ ['o_' + tabId]: origin });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const key = 'o_' + tabId;
  const data = await chrome.storage.session.get(key);
  chrome.storage.session.remove(key);
  const origin = data[key];
  if (!origin) return;
  const s = await getSettings();
  if (!s.autoWipe) return;
  try {
    await wipeOrigin(origin);
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon128.png',
      title: 'Ghost Mode 👻',
      message: new URL(origin).hostname + ' ka data saaf kar diya (tab band hua).'
    });
  } catch (e) { /* ignore */ }
});

// --- Fake browser identity (User-Agent) on/off ---
async function applyFakeUA(on) {
  if (on) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [UA_RULE_ID],
      addRules: [{
        id: UA_RULE_ID, priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{ header: 'User-Agent', operation: 'set', value: FAKE_UA }]
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script'] }
      }]
    });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [UA_RULE_ID] });
  }
}

async function applyGhost(on) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: on ? ['trackers'] : [],
    disableRulesetIds: on ? [] : ['trackers']
  });
}

// --- Popup messages ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'GET_STATE') {
      const s = await getSettings();
      sendResponse(s);
    } else if (msg.type === 'POOF') {
      const origin = msg.origin && originOf(msg.origin);
      if (!origin) { sendResponse({ ok: false }); return; }
      const cookiesRemoved = await wipeOrigin(origin);
      sendResponse({ ok: true, cookiesRemoved });
    } else if (msg.type === 'SET_GHOST') {
      await chrome.storage.local.set({ ghostOn: !!msg.on });
      await applyGhost(!!msg.on);
      sendResponse({ ok: true });
    } else if (msg.type === 'SET_AUTOWIPE') {
      await chrome.storage.local.set({ autoWipe: !!msg.on });
      sendResponse({ ok: true });
    } else if (msg.type === 'SET_FAKEUA') {
      await chrome.storage.local.set({ fakeUA: !!msg.on });
      await applyFakeUA(!!msg.on);
      sendResponse({ ok: true });
    }
  })();
  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  await chrome.storage.local.set(s);
  await applyGhost(s.ghostOn);
  await applyFakeUA(s.fakeUA);
});
