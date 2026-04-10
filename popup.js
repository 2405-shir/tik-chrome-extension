const els = {
  status: document.getElementById('status'),
  profile: document.getElementById('profile'),
  posts: document.getElementById('posts'),
  responses: document.getElementById('responses'),
  pageType: document.getElementById('pageType'),
  message: document.getElementById('message'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  exportBtn: document.getElementById('exportBtn')
};

let latestState = null;

async function getActiveTikTokTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes('tiktok.com')) {
    throw new Error('Open TikTok in the active tab first.');
  }
  return tab;
}

async function sendToTab(type) {
  const tab = await getActiveTikTokTab();
  const response = await chrome.tabs.sendMessage(tab.id, { type });
  latestState = response;
  render();
  return response;
}

function setMessage(text, isError = false) {
  els.message.textContent = text || '';
  els.message.style.color = isError ? '#ff9aa2' : '#9dd2ff';
}

function render() {
  const s = latestState;
  els.status.textContent = s ? (s.running ? 'Running' : 'Stopped') : 'Idle';
  els.profile.textContent = s?.username || '-';
  els.posts.textContent = String(s?.totals?.uniquePosts || 0);
  els.responses.textContent = String(s?.totals?.capturedResponses || 0);
  els.pageType.textContent = s ? (s.isProfilePage ? 'Profile page' : 'Not a profile page') : '-';
}

function csvEscape(value) {
  const str = String(value ?? '');
  return '"' + str.replace(/"/g, '""') + '"';
}

function buildCsv(rows) {
  const headers = [
    'post_id', 'profile_username', 'author_nickname', 'video_url', 'description',
    'likes', 'comments', 'shares', 'bookmarks', 'views', 'duration_seconds',
    'created_at_unix', 'created_at_iso', 'region', 'is_pinned', 'music_title', 'music_author'
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n');
}

async function exportCsv() {
  if (!latestState?.rows?.length) {
    setMessage('No rows captured yet.', true);
    return;
  }
  const csv = buildCsv(latestState.rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const filename = `${latestState.username || 'tiktok'}_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
  await chrome.downloads.download({ url, filename, saveAs: true });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setMessage(`CSV ready: ${latestState.rows.length} rows.`);
}

els.startBtn.addEventListener('click', async () => {
  try {
    setMessage('Starting capture...');
    await sendToTab('tiktokCsv:start');
    setMessage('Capture started. Leave the TikTok tab open while it scrolls.');
  } catch (err) {
    setMessage(err.message || String(err), true);
  }
});

els.stopBtn.addEventListener('click', async () => {
  try {
    await sendToTab('tiktokCsv:stop');
    setMessage('Capture stopped.');
  } catch (err) {
    setMessage(err.message || String(err), true);
  }
});

els.clearBtn.addEventListener('click', async () => {
  try {
    await sendToTab('tiktokCsv:clear');
    setMessage('Cleared saved rows for this profile.');
  } catch (err) {
    setMessage(err.message || String(err), true);
  }
});

els.exportBtn.addEventListener('click', async () => {
  try {
    await sendToTab('tiktokCsv:getState');
    await exportCsv();
  } catch (err) {
    setMessage(err.message || String(err), true);
  }
});

(async function initPopup() {
  try {
    await sendToTab('tiktokCsv:getState');
    setMessage('Ready.');
  } catch (err) {
    setMessage(err.message || String(err), true);
  }
})();
