TikTok CSV Chrome Extension

What it does
- Works on TikTok profile pages like https://www.tiktok.com/@username
- Injects a small bridge into the page to intercept TikTok profile API responses
- Auto-scrolls the profile to trigger more post loads
- Captures per-post metrics and exports them as CSV

How to use
1. Open chrome://extensions
2. Turn on Developer mode
3. Click Load unpacked
4. Select this folder: tiktok_csv
5. Open a TikTok profile page in the active tab
6. Click the extension icon
7. Press Start
8. Wait until the status changes to Stopped or press Stop manually
9. Press Export CSV

CSV fields
- post_id
- profile_username
- author_nickname
- video_url
- description
- likes
- comments
- shares
- bookmarks
- views
- duration_seconds
- created_at_unix
- created_at_iso
- region
- is_pinned
- music_title
- music_author

Notes
- This extension is built for profile pages, not the For You feed.
- TikTok changes its site often. If TikTok changes its internal API paths, the page-bridge.js filters may need an update.
- Keep the TikTok tab open while the extension is scrolling.
