# Hệ Thống Tự Động Khai Thác Video & Kênh Ngách Viral (YouTube Niche Breakout Pipeline)

Tài liệu này hệ thống hóa toàn bộ kiến trúc giải pháp nhằm phát hiện các video bùng nổ (Breakout) của các kênh quy mô nhỏ/vừa, kết hợp giữa **YouTube Data API v3** và **Kỹ thuật bóc tách đề xuất (Web Scraping `ytInitialData`)** để tiết kiệm Quota và khai thác đúng tệp khán giả mục tiêu.

---

## 1. Bản Chất Vấn Đề Khi Dùng API Truyền Thống

* **`chart='mostPopular'`:** Chỉ trả về các nội dung xu hướng chung của toàn quốc gia (âm nhạc, giải trí, truyền hình, tin tức).
* **`search.list` với `order='viewCount'`:** Ưu tiên Authority (kênh lớn, video tích lũy view nhiều năm), bỏ qua các video mới đăng của kênh nhỏ.
* **Hạn mức Quota:** API v3 chỉ cung cấp $10.000$ units/ngày (`search.list` tốn $100$ units/lệnh $\rightarrow$ chỉ gọi được 100 lần/ngày).

---

## 2. Công Thức Đánh Giá Video Viral Kênh Ngách

Một video ngách viral thực sự là video có tốc độ tăng trưởng và lượng view vượt xa quy mô bình thường của kênh trong thời gian ngắn.

### Chỉ số View-to-Subscriber Ratio (VSR)
$$\text{VSR} = \frac{\text{viewCount}}{\text{subscriberCount}}$$

* **Kênh ngách tiềm năng:** `subscriberCount` từ $1.000$ đến $50.000$.
* **Ngưỡng Breakout:** $\text{VSR} \ge 3.0$ (view gấp từ 3 lần lượng sub trở lên).
* **Khung thời gian lọc:** Video đăng trong vòng $7 - 14$ ngày gần nhất.

---

## 3. Kiến Trúc Pipeline 4 Bước Khép Kín

```text
[BƯỚC 1: Lọc Key Ngách Chuyên Sâu]
            │
            ▼
[BƯỚC 2: Tìm Video Hạt Giống (YouTube API)]
    • Lọc publishedAfter trong 7-14 ngày
    • Đo VSR >= 3.0 & Sub <= 50.000
            │
            ▼
[BƯỚC 3: Bóc Tách Đề Xuất Web Player (ytInitialData)]
    • Lấy danh sách Up Next / Recommendations (0 Quota)
    • Ép Cookie khu vực (gl=US, hl=en)
            │
            ▼
[BƯỚC 4: Đo Lường & Nở Rộng Tệp Kênh Ngách]
    • Thêm kênh mới vào Seed List
    • Tự động theo dõi qua RSS Feed
```

---

## 4. Quản Lý Địa Chỉ IP & Vùng Địa Lý (Localization)

Khi cào Web Player (`ytInitialData`), YouTube phân phối nội dung đề xuất dựa trên:
1. **Cookie `PREF`:** Ép vùng và ngôn ngữ hiển thị.
2. **Header `Accept-Language`:** Khai báo ngôn ngữ client.
3. **Geo-IP:** Vị trí máy chủ gửi request.

### Cấu hình Header & Cookie ép vùng US không cần đổi IP:
```python
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}
cookies = {
    "PREF": "hl=en&gl=US"  # hl: Host Language, gl: Geolocation
}
```

> **Lưu ý:** Nếu cào số lượng lớn liên tục (>100 request/giờ), cần triển khai Proxy xoay (Residential Proxies) hoặc đặt source code trên VPS tại Mỹ (AWS, DigitalOcean, Linode) để tránh bị chặn HTTP 429 hoặc dính CAPTCHA.

---

## 5. Source Code Hoàn Chỉnh (Python)

Cài đặt thư viện cần thiết trước khi chạy:
```bash
pip install google-api-python-client requests
```

### Script: `niche_discovery_pipeline.py`

```python
import json
import re
import time
import random
import requests
from datetime import datetime, timedelta, timezone
from googleapiclient.discovery import build

# Cấu hình API Key
YOUTUBE_API_KEY = "YOUR_API_KEY_HERE"
youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)


def find_seed_breakout_videos(keyword, days_back=14, max_sub=50000, min_vsr=3.0):
    """Bước 2: Tìm video hạt giống bùng nổ view của các kênh nhỏ qua API."""
    published_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    # 1. Quét video mới theo keyword
    search_resp = (
        youtube.search()
        .list(
            q=keyword,
            part="id",
            type="video",
            videoDuration="medium",  # 4 đến 20 phút (tránh shorts)
            publishedAfter=published_after,
            regionCode="US",
            relevanceLanguage="en",
            maxResults=30,
        )
        .execute()
    )

    video_ids = [item["id"]["videoId"] for item in search_resp.get("items", [])]
    if not video_ids:
        return []

    # 2. Lấy thống kê view của video (1 quota unit)
    video_resp = (
        youtube.videos()
        .list(id=",".join(video_ids), part="statistics,snippet")
        .execute()
    )

    channel_ids = list(set(v["snippet"]["channelId"] for v in video_resp["items"]))

    # 3. Lấy số lượng sub của các kênh liên quan (1 quota unit)
    channel_resp = (
        youtube.channels()
        .list(id=",".join(channel_ids), part="statistics")
        .execute()
    )

    sub_map = {
        c["id"]: int(c["statistics"].get("subscriberCount", 0))
        for c in channel_resp["items"]
    }

    # 4. Lọc theo chỉ số VSR
    breakout_seeds = []
    for v in video_resp["items"]:
        cid = v["snippet"]["channelId"]
        views = int(v["statistics"].get("viewCount", 0))
        subs = sub_map.get(cid, 0)

        if 1000 <= subs <= max_sub and views >= 5000:
            vsr = views / subs
            if vsr >= min_vsr:
                breakout_seeds.append({
                    "video_id": v["id"],
                    "title": v["snippet"]["title"],
                    "channel_id": cid,
                    "channel_title": v["snippet"]["channelTitle"],
                    "views": views,
                    "subs": subs,
                    "vsr": round(vsr, 2),
                })

    return breakout_seeds


def scrape_related_videos(video_id):
    """Bước 3: Bóc tách video đề xuất từ Web Player qua ytInitialData (0 Quota)."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    cookies = {"PREF": "hl=en&gl=US"}

    try:
        res = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        if res.status_code != 200:
            return []

        # Tách chuỗi JSON ytInitialData
        pattern = r"var ytInitialData\s*=\s*({.+?});</script>"
        match = re.search(pattern, res.text)
        if not match:
            return []

        data = json.loads(match.group(1))
        results = (
            data.get("contents", {})
            .get("twoColumnWatchNextResults", {})
            .get("secondaryResults", {})
            .get("secondaryResults", {})
            .get("results", [])
        )

        related_videos = []
        for item in results:
            compact = item.get("compactVideoRenderer")
            if not compact:
                continue

            rec_vid = compact.get("videoId")
            rec_title = compact.get("title", {}).get("simpleText", "")
            byline = compact.get("longBylineText", {}).get("runs", [{}])[0]
            rec_channel_name = byline.get("text", "")
            rec_channel_id = (
                byline.get("navigationEndpoint", {})
                .get("browseEndpoint", {})
                .get("browseId", "")
            )

            if rec_vid:
                related_videos.append({
                    "video_id": rec_vid,
                    "title": rec_title,
                    "channel_name": rec_channel_name,
                    "channel_id": rec_channel_id,
                    "url": f"https://www.youtube.com/watch?v={rec_vid}",
                })
        return related_videos

    except Exception as e:
        print(f"Lỗi khi cào video {video_id}: {e}")
        return []


if __name__ == "__main__":
    # Thay đổi từ khóa ngách cần quét tại đây
    niche_keyword = '"custom mechanical keyboard" "build" -shorts'

    print(f"[*] Đang tìm kiếm video hạt giống: {niche_keyword}")
    seeds = find_seed_breakout_videos(niche_keyword, days_back=14, max_sub=50000, min_vsr=2.5)
    print(f"[+] Tìm thấy {len(seeds)} video hạt giống bùng nổ.\n")

    discovered_channels = set()

    for seed in seeds:
        print(f"--- VIDEO HẠT GIỐNG ---")
        print(f"Tiêu đề: {seed['title']}")
        print(f"Kênh: {seed['channel_title']} | Views: {seed['views']:,} | Subs: {seed['subs']:,} | VSR: {seed['vsr']}x")
        print(f"Link: https://www.youtube.com/watch?v={seed['video_id']}")

        # Tránh gửi request quá nhanh để bảo vệ IP
        delay = random.uniform(2.5, 4.5)
        time.sleep(delay)

        related = scrape_related_videos(seed["video_id"])
        print(f" -> Lấy được {len(related)} video được YouTube đề xuất kèm theo:")

        for r in related[:5]:
            print(f"    * [{r['channel_name']}] {r['title']}")
            if r["channel_id"]:
                discovered_channels.add((r["channel_id"], r["channel_name"]))
        print()

    print(f"=== TỔNG HỢP: ĐÃ PHÁT HIỆN {len(discovered_channels)} KÊNH NGÁCH TIỀM NĂNG ===")
    for cid, cname in discovered_channels:
        print(f"- {cname} | ID: {cid} | Link RSS: https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
```