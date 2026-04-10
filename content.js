const STORAGE_KEY = 'tiktokCsvState';

if (!window.__tiktokCsvContentInstalled) {
  window.__tiktokCsvContentInstalled = true;
  init();
}

function init() {
  injectBridge();
  setupState().then(() => {
    window.addEventListener('message', handleBridgeMessage);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    notifyState();
  });
}

function defaultProfileState() {
  return {
    username: getUsernameFromUrl(),
    startedAt: null,
    finishedAt: null,
    running: false,
    stallCount: 0,
    rows: {},
    order: [],
    totals: { capturedResponses: 0, uniquePosts: 0 },
    lastScrollHeight: 0,
    lastActivityAt: 0,
    autoScrollTimer: null
  };
}

let profileState = defaultProfileState();

async function setupState() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  const all = saved[STORAGE_KEY] || {};
  const username = getUsernameFromUrl();
  const existing = all[username];
  if (existing) {
    profileState = {
      ...defaultProfileState(),
      ...existing,
      username,
      autoScrollTimer: null,
      running: false
    };
    await persistState();
  } else {
    profileState = defaultProfileState();
    await persistState();
  }
}

function injectBridge() {
  if (document.getElementById('tiktok-csv-bridge-script')) return;
  const script = document.createElement('script');
  script.id = 'tiktok-csv-bridge-script';
  script.src = chrome.runtime.getURL('page-bridge.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function getUsernameFromUrl() {
  const match = location.pathname.match(/@([A-Za-z0-9._]+)/);
  return match ? match[1] : 'unknown_profile';
}

function handleBridgeMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== 'tiktok-csv-bridge' || data.kind !== 'item_list') return;
  ingestItemListPayload(data.payload);
}

function ingestItemListPayload(payload) {
  if (!payload || !Array.isArray(payload.itemList)) return;
  profileState.totals.capturedResponses += 1;
  profileState.lastActivityAt = Date.now();

  for (const item of payload.itemList) {
    const row = normalizeItem(item);
    if (!row) continue;
    const alreadyExists = Boolean(profileState.rows[row.post_id]);
    profileState.rows[row.post_id] = row;
    if (!alreadyExists) profileState.order.push(row.post_id);
  }

  profileState.totals.uniquePosts = Object.keys(profileState.rows).length;
  persistState();
  notifyState();
}

function normalizeItem(item) {
  if (!item || !item.id) return null;
  const stats = item.stats || {};
  const author = item.author || {};
  const username = author.uniqueId || getUsernameFromUrl();
  const createdAtUnix = Number(item.createTime || item.createdAt || 0);
  const createdAtIso = createdAtUnix ? new Date(createdAtUnix * 1000).toISOString() : '';
  return {
    post_id: String(item.id),
    profile_username: username,
    author_nickname: author.nickname || '',
    video_url: `https://www.tiktok.com/@${username}/video/${item.id}`,
    description: sanitizeText(item.desc || ''),
    likes: numberValue(stats.diggCount),
    comments: numberValue(stats.commentCount),
    shares: numberValue(stats.shareCount),
    bookmarks: numberValue(stats.collectCount),
    views: numberValue(stats.playCount),
    duration_seconds: numberValue(item.video?.duration),
    created_at_unix: createdAtUnix || '',
    created_at_iso: createdAtIso,
    region: item.region || '',
    is_pinned: Boolean(item.isPinnedItem),
    music_title: sanitizeText(item.music?.title || ''),
    music_author: sanitizeText(item.music?.authorName || '')
  };
}

function sanitizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function handleRuntimeMessage(message, _sender, sendResponse) {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'tiktokCsv:getState') {
    sendResponse(getPublicState());
    return true;
  }

  if (message.type === 'tiktokCsv:start') {
    startCapture().then(() => sendResponse(getPublicState()));
    return true;
  }

  if (message.type === 'tiktokCsv:stop') {
    stopCapture('Stopped manually').then(() => sendResponse(getPublicState()));
    return true;
  }

  if (message.type === 'tiktokCsv:clear') {
    clearProfileData().then(() => sendResponse(getPublicState()));
    return true;
  }
}

async function startCapture() {
  if (!isProfilePage()) {
    throw new Error('Open a TikTok profile page like https://www.tiktok.com/@username first.');
  }
  if (profileState.running) return;

  profileState.username = getUsernameFromUrl();
  profileState.running = true;
  profileState.startedAt = new Date().toISOString();
  profileState.finishedAt = null;
  profileState.stallCount = 0;
  profileState.lastScrollHeight = document.body.scrollHeight;
  profileState.lastActivityAt = Date.now();
  await persistState();
  notifyState();
  autoScrollLoop();
}

async function stopCapture(reason = 'Completed') {
  profileState.running = false;
  profileState.finishedAt = new Date().toISOString();
  if (profileState.autoScrollTimer) {
    clearTimeout(profileState.autoScrollTimer);
    profileState.autoScrollTimer = null;
  }
  await persistState();
  notifyState({ reason });
}

async function clearProfileData() {
  const username = getUsernameFromUrl();
  profileState = defaultProfileState();
  profileState.username = username;
  await persistState();
  notifyState({ reason: 'Cleared' });
}

function autoScrollLoop() {
  if (!profileState.running) return;

  const before = window.scrollY;
  const viewport = window.innerHeight || 900;
  const step = Math.max(900, Math.floor(viewport * 1.2));
  window.scrollTo({ top: before + step, behavior: 'smooth' });

  profileState.autoScrollTimer = setTimeout(async () => {
    const currentHeight = document.body.scrollHeight;
    const nearBottom = window.innerHeight + window.scrollY >= currentHeight - 120;
    const heightChanged = currentHeight > profileState.lastScrollHeight;
    const recentActivity = Date.now() - profileState.lastActivityAt < 5000;

    if (heightChanged || recentActivity) {
      profileState.stallCount = 0;
      profileState.lastScrollHeight = currentHeight;
    } else if (nearBottom) {
      profileState.stallCount += 1;
    }

    await persistState();
    notifyState();

    if (profileState.stallCount >= 6) {
      stopCapture('Reached end of profile');
      return;
    }
    autoScrollLoop();
  }, 1600);
}

function isProfilePage() {
  return /\/@[A-Za-z0-9._]+(?:\/|$)/.test(location.pathname);
}

function getPublicState(extra = {}) {
  const rows = profileState.order.map((id) => profileState.rows[id]).filter(Boolean);
  return {
    username: profileState.username,
    running: profileState.running,
    startedAt: profileState.startedAt,
    finishedAt: profileState.finishedAt,
    stallCount: profileState.stallCount,
    totals: profileState.totals,
    rows,
    isProfilePage: isProfilePage(),
    currentUrl: location.href,
    ...extra
  };
}

async function persistState() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  const all = saved[STORAGE_KEY] || {};
  const username = getUsernameFromUrl();
  const serializable = { ...profileState, username, autoScrollTimer: null };
  all[username] = serializable;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

function notifyState(extra = {}) {
  const detail = getPublicState(extra);
  window.dispatchEvent(new CustomEvent('tiktokCsvStateChanged', { detail }));
}
