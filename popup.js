'use strict';
let currentOrigin = null;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const tab = await activeTab();
  const siteEl = document.getElementById('site');
  if (tab && tab.url && /^https?:/.test(tab.url)) {
    const u = new URL(tab.url);
    currentOrigin = u.origin;
    siteEl.textContent = u.hostname;
  } else {
    siteEl.textContent = 'Is page par site data nahi hai';
    document.getElementById('poof').disabled = true;
  }
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (s) {
    document.getElementById('blocked').textContent = s.blockedTotal;
    document.getElementById('wiped').textContent = s.wipesTotal;
    document.getElementById('tglGhost').checked = s.ghostOn;
    document.getElementById('tglAuto').checked = s.autoWipe;
    document.getElementById('tglUA').checked = s.fakeUA;
  }
}

document.getElementById('poof').addEventListener('click', async () => {
  const btn = document.getElementById('poof');
  const result = document.getElementById('result');
  if (!currentOrigin) return;
  btn.disabled = true; btn.textContent = '👻 Saaf ho raha hai…';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'POOF', origin: currentOrigin });
    if (r && r.ok) {
      result.textContent = '✅ POOF! ' + r.cookiesRemoved + ' cookies + site ka sara local data saaf. Page refresh karke fresh session milega.';
      const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (s) document.getElementById('wiped').textContent = s.wipesTotal;
    } else {
      result.textContent = '⚠️ Is site ka data saaf nahi ho saka.';
    }
  } catch (e) {
    result.textContent = '⚠️ Kuch ghalat ho gaya: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '👻 POOF! Is site ka data saaf karo';
});

document.getElementById('tglGhost').addEventListener('change', e =>
  chrome.runtime.sendMessage({ type: 'SET_GHOST', on: e.target.checked }));
document.getElementById('tglAuto').addEventListener('change', e =>
  chrome.runtime.sendMessage({ type: 'SET_AUTOWIPE', on: e.target.checked }));
document.getElementById('tglUA').addEventListener('change', e =>
  chrome.runtime.sendMessage({ type: 'SET_FAKEUA', on: e.target.checked }));

init();
