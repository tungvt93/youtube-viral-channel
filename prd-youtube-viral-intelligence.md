# PRD — YouTube Viral Intelligence
**Phiên bản:** 1.0  
**Ngày:** 05/11/2026  
**Trạng thái:** Draft — cơ sở để thiết kế và triển khai MVP  
**Ngôn ngữ sản phẩm:** Tiếng Việt trước, có khả năng mở rộng đa ngôn ngữ  
**Stack bắt buộc:** Node.js + TypeScript + React + TypeScript

---

## 1. Tổng quan sản phẩm

### 1.1. Tên sản phẩm

**YouTube Viral Intelligence (YVI)** — hệ thống khám phá và theo dõi video, kênh và chủ đề YouTube có dấu hiệu tăng trưởng bất thường theo từng thị trường/quốc gia.

### 1.2. Vấn đề cần giải quyết

Việc tìm video và chủ đề tiềm năng thủ công có các vấn đề:

- Phải tìm kiếm lặp lại trên YouTube theo nhiều từ khóa và ngôn ngữ.
- Dễ chỉ nhìn thấy các video đã có lượng view lớn, bỏ lỡ video mới đang tăng tốc.
- Khó so sánh hiệu suất của video giữa các kênh có quy mô khác nhau.
- Khó phát hiện kênh nhỏ có một hoặc nhiều video vượt xa hiệu suất thông thường.
- Khó nhận ra chủ đề mới đang nổi lên ở một thị trường.
- Không có lịch sử snapshot đủ đều để biết tốc độ tăng trưởng thực tế.
- Dữ liệu video, channel và topic bị phân tán, không có một nơi để lưu, lọc, xếp hạng và theo dõi.

### 1.3. Tầm nhìn

Mỗi ngày, người dùng mở dashboard và nhận được một danh sách có thứ tự ưu tiên:

1. Video đang tăng view nhanh bất thường.
2. Kênh mới nổi hoặc có nhiều video outlier.
3. Chủ đề đang tăng trưởng trong từng thị trường.
4. Chủ đề mới chưa có trong danh mục hiện tại.
5. Các video/kênh/topic đáng theo dõi trong 24 giờ tiếp theo.

YVI không chỉ là một công cụ tìm kiếm. Đây là một **hệ thống discovery + monitoring + anomaly detection** liên tục.

### 1.4. Định vị và giới hạn tuyên bố

YVI sử dụng quốc gia như **thị trường khám phá (discovery market)**: ví dụ kết quả tìm kiếm có thể xem tại US, JP hoặc KR. Không được diễn giải mặc định rằng video đó có audience chủ yếu ở quốc gia tương ứng.

YouTube Data API công khai không cung cấp đầy đủ dữ liệu audience geography của kênh đối thủ. Vì vậy, UI và báo cáo phải dùng các nhãn như:

- “Được phát hiện trong thị trường US”
- “Search market: JP”
- “Xu hướng quan sát được tại KR”

Không dùng tuyên bố “90% người xem đến từ US” nếu không có dữ liệu được phép và có nguồn chứng minh.

### 1.5. Mục tiêu kinh doanh

- Giảm thời gian tìm kiếm video và chủ đề thủ công.
- Tăng số lượng video/kênh/topic tiềm năng được phát hiện mỗi ngày.
- Phát hiện sớm hơn so với việc chỉ xem danh sách video nhiều view.
- Tạo dataset lịch sử có thể khai thác cho phân tích dài hạn.
- Hỗ trợ người dùng nghiên cứu nội dung và đánh giá cơ hội sáng tạo nội dung hợp pháp.

YVI không tự động tải xuống hoặc đăng lại nội dung. Việc tìm thấy video không đồng nghĩa có quyền sao chép, chỉnh sửa hoặc phân phối lại. Quyền sử dụng phải được kiểm tra riêng.

---

## 2. Mục tiêu, KPI và tiêu chí thành công

### 2.1. Product goals

| ID | Mục tiêu | Mô tả |
|---|---|---|
| G-01 | Multi-market discovery | Thu thập ứng viên từ nhiều thị trường |
| G-02 | Early signal detection | Phát hiện video tăng trưởng nhanh thay vì chỉ xếp theo tổng view |
| G-03 | Channel intelligence | Phát hiện kênh có video vượt trội so với baseline của chính kênh |
| G-04 | Topic intelligence | Gom nhóm video và phát hiện topic đang tăng trưởng |
| G-05 | Historical monitoring | Lưu snapshot để tính growth theo thời gian |
| G-06 | Explainable ranking | Giải thích vì sao một video/kênh/topic được xếp hạng cao |
| G-07 | Configurable discovery | Cho phép cấu hình thị trường, nguồn khám phá, ngôn ngữ, query và lịch chạy |

### 2.2. KPI sản phẩm

Các KPI sau là mục tiêu thử nghiệm cho MVP, cần hiệu chỉnh sau 2–4 tuần dữ liệu thực tế.

| KPI | Mục tiêu ban đầu | Cách đo |
|---|---:|---|
| Markets active | 3 thị trường | Có collector chạy thành công hàng ngày |
| Unique candidate videos | 1.000/ngày | Số video ID mới, sau deduplication |
| Snapshot coverage | >= 90% | Tỷ lệ video theo dõi có snapshot đúng lịch |
| Discovery success | >= 95% jobs | Tỷ lệ discovery job thành công |
| Video detail completeness | >= 95% | Tỷ lệ video có snippet, duration, statistics |
| Topic classification coverage | >= 85% | Tỷ lệ video đủ metadata được gán topic hoặc unknown |
| Alert usefulness | >= 60% | Người dùng đánh dấu alert là hữu ích |
| Duplicate rate | < 2% | Tỷ lệ record video trùng trong cùng nguồn dữ liệu |
| Dashboard load | p95 < 3 giây | Các trang danh sách với bộ lọc phổ biến |

Không đặt KPI “phát hiện toàn bộ video viral trên YouTube”, vì API và nguồn dữ liệu không cho phép bảo đảm độ bao phủ toàn bộ nền tảng.

### 2.3. Tiêu chí MVP thành công

MVP được xem là đạt khi:

- Có thể cấu hình ít nhất 3 thị trường.
- Collector lấy được ứng viên từ ít nhất 2 chiến lược discovery.
- Video được lưu duy nhất theo `youtube_video_id`.
- Có snapshot định kỳ và tính được VPH/growth.
- Có trang Viral Videos, Channel Discovery và Topic Trends ở mức cơ bản.
- Có thể giải thích lý do xếp hạng của từng kết quả.
- Có trang API quota/job health để kiểm soát hoạt động thu thập.
- Không vượt ngân sách quota đã cấu hình mà không có cảnh báo.

---

## 3. Người dùng và use cases

### 3.1. Primary user

Một người nghiên cứu xu hướng nội dung, cần phát hiện video, kênh và topic mới nổi tại nhiều quốc gia.

### 3.2. Jobs to be done

- “Mỗi sáng, cho tôi biết video nào tăng view nhanh nhất tại Mỹ.”
- “Tìm kênh nhỏ có video mới vượt xa view thông thường.”
- “Cho tôi biết chủ đề nào đang có nhiều video tăng trưởng tại Nhật.”
- “Theo dõi video này và thông báo khi tốc độ tăng view tăng mạnh.”
- “Tìm thêm các kênh tương tự kênh tôi vừa phát hiện.”
- “Cho tôi biết topic nào mới xuất hiện, chưa có trong taxonomy.”
- “Xuất danh sách video/kênh/topic để tôi phân tích tiếp.”

### 3.3. Vai trò người dùng

MVP chỉ cần một loại tài khoản `Admin/User` đơn giản:

- **Admin:** quản lý API credentials, markets, discovery strategies, taxonomy, lịch chạy, quota.
- **User:** xem dashboard, tìm kiếm, theo dõi, đánh dấu, export.

Có thể dùng một user role duy nhất trong giai đoạn cá nhân sử dụng.

---

## 4. Phạm vi sản phẩm

### 4.1. In scope — MVP

1. Quản lý thị trường.
2. Quản lý discovery query và seed topics.
3. Thu thập video ứng viên từ YouTube Data API.
4. Thu thập video phổ biến theo content region nếu endpoint còn hỗ trợ phù hợp.
5. Thu thập video mới theo query và thời gian.
6. Thu thập video từ các channel đã phát hiện.
7. Lưu video/channel metadata.
8. Snapshot view/like/comment theo thời gian.
9. Tính VPH, growth, acceleration và channel outlier.
10. Phân loại video bằng AI dựa trên metadata công khai.
11. Tổng hợp topic trends theo thị trường khám phá.
12. Dashboard, bộ lọc, watchlist và export CSV.
13. Quản lý quota, job logs và lỗi API.
14. Cơ chế tuân thủ API terms, privacy và quyền sử dụng nội dung.

### 4.2. Out of scope — MVP

- Tự động tải video từ YouTube hoặc Douyin.
- Tự động re-upload lên TikTok.
- Tự động chỉnh sửa video hoặc xóa watermark.
- Khẳng định audience geography của kênh đối thủ.
- Thu thập dữ liệu riêng tư hoặc dữ liệu không được API cho phép.
- Dự đoán chắc chắn video sẽ viral trong tương lai.
- Thu thập toàn bộ YouTube.
- Social listening đa nền tảng.
- Mobile app native.
- Billing/subscription cho SaaS.
- Multi-tenant phức tạp.
- Tích hợp vidIQ bắt buộc.

### 4.3. Future scope

- Similar channel discovery nâng cao.
- Semantic topic clustering bằng embeddings.
- Video visual analysis bằng thumbnail/frame khi có cơ sở quyền truy cập phù hợp.
- Alert qua Telegram/Email.
- So sánh topic giữa các thị trường.
- Trend lifecycle: emerging, accelerating, peak, declining.
- Import/export dữ liệu nâng cao.
- Nhiều user và workspace.
- Tích hợp nguồn dữ liệu bên thứ ba theo hợp đồng/API hợp lệ.

---

## 5. Nguyên tắc thiết kế cốt lõi

### 5.1. Discovery khác Monitoring

**Discovery** trả lời: “Tìm được video/kênh nào mới?”

**Monitoring** trả lời: “Sau khi tìm được, nó đang tăng trưởng ra sao?”

Không được dùng một lần lấy dữ liệu để kết luận video đang viral. Cần có ít nhất hai snapshot ở hai thời điểm khác nhau để tính tốc độ tăng trưởng.

### 5.2. Country là market context, không phải audience fact

Mỗi lần discovery phải lưu `market_code` và `discovery_method`. Một video có thể được tìm thấy ở nhiều market. Không gán quốc gia sở hữu video hoặc quốc gia audience nếu không có dữ liệu xác thực.

### 5.3. Giữ dữ liệu raw và dữ liệu tính toán riêng

- Raw API payload hoặc subset cần thiết: phục vụ audit/debug, có chính sách retention.
- Normalized entities: video, channel, market.
- Snapshots: số liệu theo thời điểm.
- Derived metrics: VPH, growth, outlier, trend score.

### 5.4. Không dùng LLM cho phép tính số học

SQL/TypeScript xử lý metrics và ranking. LLM chỉ xử lý phân loại, chuẩn hóa nhãn, tóm tắt và giải thích có cấu trúc.

### 5.5. Explainability

Mỗi score phải có breakdown, ví dụ:

- VPH percentile: 92
- Growth acceleration: 88
- Channel outlier: 97
- Recency: 90
- Data confidence: 85

Người dùng phải hiểu tại sao kết quả được xếp hạng cao.

---

## 6. Nguồn dữ liệu và chiến lược Discovery

### 6.1. Nguồn dữ liệu chính: YouTube Data API v3

Sử dụng API chính thức làm nguồn dữ liệu MVP.

#### A. `videos.list` với `chart=mostPopular`

Mục đích:
- Lấy danh sách video phổ biến trong một content region.
- Tạo seed dataset ban đầu.
- Tạo tín hiệu tổng quan về nội dung phổ biến trong market.

Tham số dự kiến:
- `part=snippet,statistics,contentDetails`
- `chart=mostPopular`
- `regionCode=US|JP|KR...`
- `maxResults=50`
- `videoCategoryId` tùy chọn.

Lưu ý:
- Chỉ sử dụng khi chart/category/region thực tế được API hỗ trợ.
- Đây là danh sách phổ biến theo thuật toán của YouTube, không phải bảng xếp hạng toàn bộ Shorts.
- Không giả định endpoint này cung cấp đầy đủ video đang mới nổi.
- Ghi nhận ngày giờ lấy dữ liệu và market context.

#### B. `search.list`

Mục đích:
- Tìm video mới theo query.
- Khám phá nội dung đa ngôn ngữ.
- Lấy ứng viên theo `publishedAfter`, `order=date` hoặc `order=viewCount`.
- Khám phá video thuộc channel đã biết nếu phù hợp.

Tham số dự kiến:
- `part=snippet`
- `type=video`
- `q=<query>`
- `regionCode=<market>`
- `relevanceLanguage=<language>` (nếu có)
- `publishedAfter=<ISO timestamp>`
- `order=date|viewCount|relevance`
- `maxResults<=50`
- `pageToken` khi cần phân trang.

Lưu ý:
- `regionCode` giới hạn kết quả theo video có thể xem tại quốc gia đó; không xác nhận creator/audience đến từ quốc gia đó.
- `relevanceLanguage` là gợi ý mức độ liên quan, không phải bộ lọc ngôn ngữ tuyệt đối.
- `videoDuration=short` có nghĩa video ngắn hơn 4 phút, không đồng nghĩa định dạng YouTube Shorts.
- Search API có quota cost cao hơn các endpoint đọc thông thường; phải có quota budget và scheduler.
- Không chạy hàng trăm query mỗi ngày khi chưa có quota phù hợp.

#### C. `videos.list` theo danh sách ID

Mục đích:
- Enrichment video sau khi discovery trả về ID.
- Lấy `snippet`, `statistics`, `contentDetails`, `status` nếu endpoint cho phép.
- Batch nhiều ID trong một request theo giới hạn API.

Không gọi một request cho mỗi video. Gom video IDs thành batch theo giới hạn endpoint.

#### D. `channels.list`

Mục đích:
- Lấy title, description, publishedAt, thumbnails, country nếu creator công khai và API trả về, statistics và uploads playlist.
- Cập nhật channel baseline.
- Lấy uploads playlist ID để khám phá video mới từ channel.

Không diễn giải `channel.snippet.country` là audience country. Đây là metadata do creator cung cấp, có thể trống hoặc không phản ánh thị trường audience.

#### E. `playlistItems.list`

Mục đích:
- Đọc uploads playlist của channel đã phát hiện.
- Tìm video mới từ các channel được đưa vào watchlist.
- Giảm phụ thuộc vào search query cho các channel đã biết.

### 6.2. Discovery Strategy 1 — Regional Popularity Seed

- Chạy theo từng market đã bật.
- Lấy danh sách mostPopular phù hợp.
- Upsert video.
- Ghi nhận discovery event.
- Enqueue enrichment cho video mới/chưa đủ metadata.
- Đưa video vào monitoring nếu đáp ứng điều kiện.

Tần suất MVP: 1–2 lần/ngày/market, có thể điều chỉnh theo quota và kết quả thực tế.

### 6.3. Discovery Strategy 2 — Recent Upload Search

Mỗi market có danh sách query đa ngôn ngữ.

Ví dụ seed topic:
- Pets: `funny pets`, `猫`, `面白い犬`, `웃긴 동물`
- Cooking: `easy recipe`, `簡単レシピ`, `간단 요리`
- DIY: `DIY ideas`, `DIY 作り方`, `셀프 인테리어`

Cần tránh chỉ dùng các query chung chung có cạnh tranh cao. Có thể tạo query từ:
- Topic keyword.
- Local language synonyms.
- Phrase/format keyword.
- Seasonal/event keyword.
- Query do hệ thống đề xuất và Admin duyệt.

Mỗi query lưu:
- Market.
- Language.
- Topic.
- Enabled status.
- Last run.
- Run frequency.
- Priority.
- Max pages per run.
- Quota budget.
- Last successful result count.

### 6.4. Discovery Strategy 3 — Channel Expansion

Khi video đạt điều kiện candidate:
1. Lấy channel ID.
2. Upsert channel.
3. Enrich channel.
4. Lấy uploads playlist.
5. Thu thập một số video gần nhất.
6. Tính channel outlier baseline.
7. Nếu channel có tín hiệu tốt, đưa vào channel watchlist.

Điều kiện đưa channel vào watchlist có thể là:
- Có ít nhất một video đạt outlier multiplier >= 5x.
- Hoặc có ít nhất 2 video đạt growth threshold.
- Hoặc được người dùng đánh dấu thủ công.

Các ngưỡng trên là cấu hình ban đầu, không phải tiêu chuẩn phổ quát.

### 6.5. Discovery Strategy 4 — Topic Expansion

Sau khi video được AI phân loại:
- Nếu topic đã có: cập nhật topic-video relationship.
- Nếu topic chưa có: đưa vào `topic_candidates`.
- Gom các candidate có tên/ý nghĩa gần nhau.
- LLM đề xuất canonical topic và synonyms.
- Admin có thể approve/merge/reject.
- Topic được approve sẽ tạo query seeds mới.

Không để LLM tự động tạo hàng nghìn topic trùng lặp mà không có bước chuẩn hóa.

### 6.6. Discovery source attribution

Mỗi lần tìm thấy video phải ghi lại:
- `video_id`
- `market_code`
- `discovery_source`
- `query_id` nếu có
- `discovered_at`
- `source_rank` nếu có
- `raw_context` tối thiểu cần thiết

Một video có thể có nhiều discovery events ở nhiều market và nhiều nguồn.

---

## 7. Monitoring và snapshot collection

### 7.1. Mục tiêu

Theo dõi các video được chọn để biết:
- Tổng views hiện tại.
- Views tăng thêm giữa hai snapshot.
- Views/hour.
- Tốc độ tăng có đang tăng hay giảm.
- Video đã ngừng tăng trưởng hay chưa.

### 7.2. Monitoring states

| State | Ý nghĩa |
|---|---|
| candidate | Vừa được phát hiện, chờ đánh giá |
| monitoring | Đang lấy snapshot định kỳ |
| high_signal | Có dấu hiệu tăng trưởng cao |
| cooling | Tốc độ tăng giảm đáng kể |
| archived | Không còn cần theo dõi thường xuyên |
| unavailable | Video không còn truy cập được qua API |

### 7.3. Tần suất snapshot đề xuất

| Tuổi video hoặc trạng thái | Chu kỳ |
|---|---|
| Candidate mới, tín hiệu cao | 2–4 giờ |
| Candidate thông thường | 6 giờ |
| Video 3–7 ngày | 12 giờ |
| Video trên 7 ngày | 24 giờ |
| Cooling/archived | Giảm tần suất hoặc dừng |

Scheduler phải hỗ trợ cấu hình theo:
- Market.
- Monitoring state.
- Signal priority.
- API quota còn lại.

Không cần polling toàn bộ video với cùng tần suất. Dành nhiều tài nguyên hơn cho video có tín hiệu tăng trưởng.

### 7.4. Snapshot fields

Tối thiểu:
- `video_id`
- `collected_at`
- `view_count`
- `like_count`
- `comment_count`
- `subscriber_count` không nằm trong video snapshot.
- `source`
- `fetch_status`
- `is_estimated` (mặc định false)

Lưu số đếm dưới dạng BIGINT. Không giả định mọi video đều hiển thị đầy đủ like/comment.

### 7.5. Snapshot quality

- Không tạo snapshot mới nếu API lỗi.
- Không thay snapshot lỗi bằng số 0.
- Nếu view count thấp hơn snapshot trước, lưu dữ liệu mới và đánh dấu anomaly/data correction; không ép giá trị tăng đơn điệu.
- Loại bỏ hoặc đánh dấu snapshot có timestamp sai.
- Tính metric chỉ khi khoảng cách snapshot hợp lệ.
- Có `data_confidence` dựa trên số snapshot, khoảng thời gian và chất lượng dữ liệu.

---

## 8. Thuật toán phát hiện Viral Video

### 8.1. Metrics

Gọi:
- `V(t)` là view count tại thời điểm t.
- `t1`, `t2` là hai thời điểm snapshot.
- `hours = (t2 - t1)` tính bằng giờ.

#### A. Absolute views

Tổng lượt xem hiện tại.

Dùng làm thông tin bối cảnh, không dùng một mình để xếp hạng viral.

#### B. Views per hour (VPH)

`VPH = (V(t2) - V(t1)) / hours`

Nếu chênh lệch views âm, đánh dấu correction/anomaly và không dùng interval đó để tính growth thông thường.

#### C. Growth percentage

`GrowthPct = (V(t2) - V(t1)) / max(V(t1), 1) * 100`

Growth percentage có thể rất lớn với video mới có baseline thấp. Vì vậy phải kết hợp với absolute delta và tuổi video.

#### D. Acceleration

So sánh VPH của interval hiện tại với interval liền trước:

`Acceleration = (VPH_current - VPH_previous) / max(VPH_previous, epsilon)`

Nếu thiếu interval trước, acceleration là null, không mặc định bằng 0.

#### E. Channel outlier multiplier

`ChannelOutlier = CurrentVideoViews / max(ChannelMedianViews, floor)`

Trong đó:
- `ChannelMedianViews` là median views của tối đa 10–20 video gần nhất cùng loại/độ tuổi có thể so sánh.
- `floor` tránh chia cho baseline quá nhỏ.
- Nếu channel chưa đủ video lịch sử, dùng peer baseline theo topic/market hoặc gắn confidence thấp.

Tốt hơn nữa là so sánh view ở cùng tuổi video (ví dụ 24h sau đăng) khi đủ snapshot lịch sử. Không so video 1 ngày tuổi với video 2 năm tuổi một cách trực tiếp.

#### F. Recency

Ưu tiên video mới đăng nhưng có tín hiệu. Có thể dùng decay:

`RecencyScore = exp(-ageHours / tau)`

`t​​au` cấu hình theo loại video/market.

### 8.2. Normalization

Các metric có phân phối lệch lớn. Không nên cộng trực tiếp VPH 100 và 1.000.000.

Dùng percentile rank hoặc log transform trong nhóm so sánh phù hợp:
- Market.
- Topic.
- Video format.
- Age bucket.

Ví dụ:
`NormalizedVPH = percentile_rank(log(1 + VPH))`

### 8.3. Viral Score phiên bản MVP

Đề xuất score 0–100:

`ViralScore = 0.35 * VPHPercentile + 0.25 * GrowthPercentile + 0.20 * OutlierPercentile + 0.10 * RecencyScore100 + 0.10 * AccelerationPercentile`

Quy tắc:
- Nếu thiếu metric, không tự động gán điểm tối đa.
- Re-normalize trọng số trên các metric có dữ liệu, nhưng giảm `data_confidence`.
- Hiển thị score breakdown.
- Không coi score là xác suất viral.
- Score cần được hiệu chỉnh sau khi có lịch sử dữ liệu.

### 8.4. Candidate thresholds

Ngưỡng ban đầu có thể cấu hình:
- `VPH > market/topic p90`.
- `Outlier multiplier >= 3`.
- Có ít nhất 2 snapshot hợp lệ.
- Video age dưới 14 ngày để ưu tiên emerging.

Ngưỡng thực tế nên dùng percentile theo market/topic thay vì một ngưỡng view cố định cho mọi quốc gia.

### 8.5. Video lifecycle

| Lifecycle | Điều kiện tham khảo |
|---|---|
| Newly discovered | Vừa xuất hiện trong dataset |
| Emerging | Tín hiệu tăng trưởng cao, tuổi video thấp |
| Accelerating | VPH tăng qua các interval |
| Viral | VPH/outlier đạt ngưỡng cao |
| Peaking | VPH cao nhưng acceleration giảm |
| Cooling | VPH giảm liên tục |
| Archived | Hết thời gian theo dõi hoặc người dùng archive |

Một video có thể chuyển trạng thái ngược lại nếu tín hiệu tăng trở lại. Lưu lịch sử trạng thái để audit.

---

## 9. Channel Intelligence

### 9.1. Mục tiêu

Phát hiện:
- Kênh mới nổi.
- Kênh nhỏ có video outlier.
- Kênh có nhiều video tăng trưởng.
- Kênh đang thay đổi tần suất đăng hoặc hiệu suất.

### 9.2. Channel metrics

- Subscriber count.
- Total view count.
- Video count.
- Median views per recent video.
- Average/median VPH của các video đang monitoring.
- Outlier video count.
- Outlier ratio.
- Upload frequency.
- Recent channel growth nếu snapshot có dữ liệu.

### 9.3. Channel Outlier Score

Đề xuất:

`ChannelOutlierScore = 0.40 * OutlierVideoRatioPercentile + 0.30 * RecentMedianVPHPercentile + 0.20 * UploadConsistencyScore + 0.10 * ChannelRecencyScore`

Không dùng subscriber count làm yếu tố chính vì mục tiêu là phát hiện kênh nhỏ đang bứt phá.

### 9.4. Channel tiers

- `newcomer`: ít dữ liệu hoặc mới phát hiện.
- `rising`: có một vài video tăng trưởng bất thường.
- `breakout`: nhiều video outlier hoặc tốc độ tăng trưởng cao.
- `established`: hiệu suất ổn định, quy mô lớn.
- `cooling`: hiệu suất gần đây giảm.

Tier là nhãn phân tích nội bộ, không phải phân loại chính thức của YouTube.

### 9.5. Channel discovery workflow

1. Video candidate được phát hiện.
2. Upsert channel.
3. Lấy channel details.
4. Lấy uploads playlist.
5. Lấy tối đa N video gần nhất theo quota budget.
6. Enrich và snapshot các video cần thiết.
7. Tính baseline.
8. Đưa channel vào rising/breakout nếu đạt điều kiện.
9. Tự động theo dõi upload mới.

---

## 10. Topic Intelligence

### 10.1. Mục tiêu

Phát hiện chủ đề đang tăng trưởng và chủ đề mới nổi trong từng market.

### 10.2. Taxonomy

Topic có cấu trúc phân cấp:

- Level 1: Category — Entertainment, Animals, Food, DIY, Gaming...
- Level 2: Topic — Funny Cats, Street Food, Miniature Cooking...
- Level 3: Subtopic/Format — Cat Rescue, 1-minute recipe, before/after transformation...

Mỗi topic lưu:
- Canonical name.
- Description.
- Parent topic.
- Synonyms.
- Localized names.
- Seed keywords theo ngôn ngữ.
- Status: candidate/active/merged/rejected.
- Created by: user/AI.
- Confidence.

### 10.3. AI classification input

MVP chỉ dùng dữ liệu metadata công khai:
- Video title.
- Description đã giới hạn độ dài.
- Tags nếu có.
- Category ID.
- Channel title/description.
- Language estimate nếu có.

Không yêu cầu LLM xem hoặc tải video ở MVP.

### 10.4. Structured output

LLM phải trả JSON theo schema, ví dụ:

```json
{
  "primary_topic": "Funny Cats",
  "secondary_topics": ["Pet Comedy", "Animals"],
  "format": "short_sketch",
  "content_language": "ja",
  "keywords": ["cat", "funny", "reaction"],
  "confidence": 0.87,
  "needs_review": false
}
```

Yêu cầu:
- Validate bằng Zod.
- Retry có giới hạn nếu JSON không hợp lệ.
- Không tin tưởng output tự do.
- Lưu model, prompt version và thời điểm phân loại.
- Có thể reclassify khi taxonomy/prompt thay đổi.

### 10.5. Topic trend metrics

Theo market và time window:
- Unique videos discovered.
- Unique channels.
- Total views (chỉ số tổng hợp của tập video quan sát, không phải market total).
- Median VPH.
- P90 VPH.
- Number of outlier videos.
- New channels count.
- Growth in candidate count.
- Topic momentum.

### 10.6. Topic Momentum Score

Đề xuất:

`TopicMomentum = 0.25 * CandidateVolumeGrowth + 0.30 * MedianVPHGrowth + 0.20 * OutlierDensity + 0.15 * ChannelDiversity + 0.10 * Recency`

Trong đó các thành phần được chuẩn hóa theo market và time window.

Chống false trend:
- Cần tối thiểu số video độc lập.
- Cần tối thiểu số channel độc lập.
- Giảm điểm nếu dữ liệu đến chủ yếu từ một channel.
- So sánh với baseline 7 ngày/28 ngày.
- Đánh dấu low sample size nếu dữ liệu ít.

### 10.7. Topic lifecycle

- `candidate`: topic mới được AI đề xuất.
- `emerging`: số video/kênh và metrics bắt đầu tăng.
- `accelerating`: momentum tăng nhanh.
- `trending`: tín hiệu duy trì ở mức cao.
- `peaking`: volume cao nhưng growth chậm lại.
- `declining`: tín hiệu giảm.
- `merged/rejected`: được quản trị taxonomy xử lý.

---

## 11. Functional Requirements

### 11.1. Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-01 | User đăng nhập bằng email/password | P0 |
| FR-AUTH-02 | Có logout và session expiry | P0 |
| FR-AUTH-03 | API routes yêu cầu authentication | P0 |
| FR-AUTH-04 | Admin-only cho cấu hình API key và scheduler | P0 |

### 11.2. Market Management

| ID | Requirement | Priority |
|---|---|---|
| FR-MKT-01 | Xem danh sách market | P0 |
| FR-MKT-02 | Enable/disable market | P0 |
| FR-MKT-03 | Lưu country code ISO 3166-1 alpha-2 | P0 |
| FR-MKT-04 | Lưu default language và timezone | P1 |
| FR-MKT-05 | Cấu hình discovery frequency theo market | P1 |
| FR-MKT-06 | Xem quota/job health theo market | P1 |

### 11.3. Discovery Management

| ID | Requirement | Priority |
|---|---|---|
| FR-DIS-01 | Tạo/sửa/disable discovery query | P0 |
| FR-DIS-02 | Query gắn với market và language | P0 |
| FR-DIS-03 | Hỗ trợ discovery từ mostPopular nếu endpoint hỗ trợ | P0 |
| FR-DIS-04 | Hỗ trợ recent upload search | P0 |
| FR-DIS-05 | Hỗ trợ channel uploads discovery | P1 |
| FR-DIS-06 | Deduplicate theo YouTube video ID | P0 |
| FR-DIS-07 | Ghi discovery event cho mỗi nguồn/market | P0 |
| FR-DIS-08 | Retry job lỗi có backoff | P0 |
| FR-DIS-09 | Giới hạn pages/query/run | P0 |
| FR-DIS-10 | Admin có thể chạy discovery thủ công | P1 |

### 11.4. Video Management

| ID | Requirement | Priority |
|---|---|---|
| FR-VID-01 | Danh sách video với filter/sort | P0 |
| FR-VID-02 | Xem detail video và YouTube link | P0 |
| FR-VID-03 | Hiển thị title, thumbnail, channel, publishedAt, duration | P0 |
| FR-VID-04 | Hiển thị views/likes/comments hiện tại | P0 |
| FR-VID-05 | Hiển thị VPH, growth, outlier và Viral Score | P0 |
| FR-VID-06 | Biểu đồ view snapshots | P0 |
| FR-VID-07 | Xem market/source discovery | P0 |
| FR-VID-08 | Thêm/bỏ video khỏi watchlist | P0 |
| FR-VID-09 | Gắn nhãn manual | P1 |
| FR-VID-10 | Export CSV | P1 |

### 11.5. Channel Management

| ID | Requirement | Priority |
|---|---|---|
| FR-CH-01 | Danh sách channel xếp hạng | P0 |
| FR-CH-02 | Filter theo market, topic, tier | P0 |
| FR-CH-03 | Channel detail và video gần nhất | P0 |
| FR-CH-04 | Hiển thị subscriber/video count nếu API cung cấp | P0 |
| FR-CH-05 | Hiển thị median views và outlier ratio | P0 |
| FR-CH-06 | Theo dõi channel | P0 |
| FR-CH-07 | Tự động khám phá uploads mới từ watched channel | P1 |

### 11.6. Topic Management

| ID | Requirement | Priority |
|---|---|---|
| FR-TOP-01 | Danh sách topic theo market | P0 |
| FR-TOP-02 | Hiển thị topic momentum | P0 |
| FR-TOP-03 | Hiển thị video/channel đóng góp vào topic | P0 |
| FR-TOP-04 | AI phân loại video | P0 |
| FR-TOP-05 | Tạo topic candidate | P1 |
| FR-TOP-06 | Admin merge/approve/reject topic | P1 |
| FR-TOP-07 | Quản lý localized synonyms | P1 |
| FR-TOP-08 | Tạo discovery query từ topic | P1 |

### 11.7. Alerts

MVP:
- In-app alert khi video đạt threshold.
- Alert khi channel đạt breakout threshold.
- Alert khi topic momentum vượt ngưỡng.

P1:
- Telegram/Email.
- User-configurable thresholds.
- Digest hàng ngày.

Alert phải chống gửi trùng bằng deduplication key và cooldown.

### 11.8. System Health

- Xem trạng thái job.
- Xem số lần API gọi.
- Xem quota budget/usage nếu có thể lấy từ nguồn quản lý quota.
- Xem lỗi gần nhất.
- Xem thời điểm collector chạy gần nhất.
- Tạm dừng một market hoặc discovery strategy.
- Không hiển thị API key đầy đủ trên UI.

---

## 12. User Flows

### 12.1. Onboarding lần đầu

1. Admin đăng nhập.
2. Mở Settings → YouTube API.
3. Nhập API key qua secret manager/env; không lưu plaintext trong database.
4. Chọn 3 markets ban đầu, ví dụ US, JP, KR.
5. Bật hai discovery strategies: regional popularity và recent upload search.
6. Tạo seed topics/queries.
7. Chạy thử một discovery job.
8. Xem số video tìm thấy và quota tiêu thụ.
9. Bật lịch tự động.
10. Dashboard hiển thị dữ liệu sau khi collector hoàn tất.

### 12.2. Tìm video emerging

1. Mở Viral Videos.
2. Chọn market = US.
3. Chọn period = last 24 hours.
4. Chọn lifecycle = emerging/accelerating.
5. Sort = Viral Score hoặc VPH.
6. Mở video detail.
7. Kiểm tra snapshot chart và channel outlier.
8. Add to watchlist hoặc ignore.

### 12.3. Tìm channel breakout

1. Mở Channel Discovery.
2. Chọn market.
3. Sort theo Channel Outlier Score.
4. Chọn channel tier = rising/breakout.
5. Mở channel detail.
6. Xem các video outlier.
7. Theo dõi channel.

### 12.4. Phát hiện topic mới

1. Mở Topic Trends.
2. Chọn market và time range.
3. Xem topic momentum.
4. Mở topic candidate.
5. Xem các video tương đồng và channel độc lập.
6. Approve/merge/reject.
7. Nếu approve, tạo discovery queries.

---

## 13. UX/UI Requirements

### 13.1. Main navigation

Sidebar:
- Overview
- Viral Videos
- Channel Discovery
- Topic Trends
- Watchlist
- Alerts
- Discovery Sources
- Settings
- System Health

### 13.2. Overview dashboard

Cards:
- New videos discovered today.
- Emerging videos.
- Breakout channels.
- Rising topics.
- Markets active.
- API quota status.

Charts:
- Video discoveries over time.
- Emerging videos by market.
- Topic momentum over time.
- Top markets by candidate growth.

Lists:
- Top 10 emerging videos.
- Top 10 breakout channels.
- Top 10 rising topics.

### 13.3. Viral Videos table

Columns:
- Thumbnail.
- Title.
- Channel.
- Market discovered.
- Published at.
- Age.
- Views.
- VPH.
- Growth %.
- Outlier multiplier.
- Viral Score.
- Lifecycle.
- Last snapshot.

Filters:
- Market.
- Date discovered.
- Published date.
- Age range.
- Video format/short candidate.
- Topic.
- Lifecycle.
- Minimum views.
- Minimum VPH.
- Minimum outlier.
- Score range.
- Channel size.

### 13.4. Video detail

Sections:
1. Video header: thumbnail, title, channel, YouTube link.
2. Current metrics.
3. Snapshot line chart.
4. VPH/growth/acceleration chart.
5. Score breakdown.
6. Discovery history.
7. Topic classification.
8. Related videos.
9. Channel summary.
10. Watchlist/labels.

### 13.5. Channel detail

- Channel metadata.
- Subscriber and total views history (nếu có snapshots).
- Recent uploads.
- Video outliers.
- Median baseline.
- Upload frequency.
- Channel score breakdown.
- Markets in which channel was discovered.

### 13.6. Topic detail

- Topic description and localized names.
- Momentum score.
- Video/channel counts.
- Trend chart.
- Top videos.
- Top channels.
- Sample-size warning.
- Seed queries.
- Related/parent topics.

### 13.7. UX principles

- Desktop-first, responsive tablet/mobile.
- Dùng bảng dữ liệu cho thao tác phân tích số lượng lớn.
- Mặc định sort theo tín hiệu mới, không chỉ tổng views.
- Mọi score có tooltip giải thích.
- Có trạng thái loading, empty, partial data, API error.
- Không hiển thị số liệu thiếu như số 0.
- Hiển thị thời điểm snapshot gần nhất và data freshness.

---

## 14. Technical Architecture

### 14.1. Stack đề xuất

Toàn bộ application code sử dụng JavaScript/TypeScript ecosystem.

| Layer | Technology | Ghi chú |
|---|---|---|
| Frontend | React + TypeScript | Dashboard |
| Frontend framework | Next.js | Routing, SSR khi cần, app structure |
| UI | Tailwind CSS + shadcn/ui | Component system |
| Data fetching | TanStack Query | Cache, refetch, loading |
| Table | TanStack Table | Filter/sort/pagination |
| Charts | Recharts | Snapshot/trend charts |
| Backend | Node.js + TypeScript + NestJS | Modular monolith |
| API | REST + OpenAPI | Dễ tích hợp |
| Validation | Zod hoặc class-validator | Request/schema validation |
| ORM | Prisma | Database access/migrations |
| Database | PostgreSQL | Source of truth |
| Queue | Redis + BullMQ | Jobs/scheduling |
| AI | Gemini API qua provider adapter | Classification/summarization |
| Embedding | Gemini Embedding (P1) | Semantic clustering |
| Logging | Pino | Structured logs |
| Monitoring | Sentry + health endpoints | Error tracking |
| Deployment | Docker Compose | MVP |
| Reverse proxy | Nginx/Caddy | TLS/routing |

Không cần Ruby on Rails cho dự án này. Có thể triển khai backend và frontend bằng TypeScript.

### 14.2. Architecture style

MVP dùng **modular monolith + worker process**, không dùng microservices.

Các process:
1. `web`: Next.js frontend.
2. `api`: NestJS API.
3. `worker`: BullMQ workers.
4. `scheduler`: tạo recurring jobs; có thể gộp trong worker nhưng chỉ chạy một scheduler leader.
5. `postgres`: database.
6. `redis`: queue/cache.

### 14.3. High-level data flow

```text
                   ┌─────────────────────┐
                   │ Admin Configuration │
                   │ Markets / Queries   │
                   │ Topics / Schedules  │
                   └──────────┬──────────┘
                              │
                              v
┌──────────────────┐   ┌────────────────────┐
│ YouTube Data API │<--│ Discovery Workers  │
└──────────────────┘   └─────────┬──────────┘
                                 │ Candidate IDs
                                 v
                       ┌────────────────────┐
                       │ Enrichment Workers │
                       │ videos/channels    │
                       └─────────┬──────────┘
                                 │
                                 v
                       ┌────────────────────┐
                       │ PostgreSQL         │
                       │ videos/channels    │
                       │ discovery_events   │
                       └─────────┬──────────┘
                                 │
                  ┌──────────────┴─────────────┐
                  v                            v
        ┌──────────────────┐         ┌──────────────────┐
        │ Snapshot Workers │         │ AI Classifier    │
        │ Metrics          │         │ Topic/Format     │
        └─────────┬────────┘         └─────────┬────────┘
                  └──────────────┬─────────────┘
                                 v
                       ┌────────────────────┐
                       │ Scoring & Trends   │
                       │ Video/Channel/Topic│
                       └─────────┬──────────┘
                                 v
                       ┌────────────────────┐
                       │ NestJS REST API    │
                       └─────────┬──────────┘
                                 v
                       ┌────────────────────┐
                       │ React Dashboard    │
                       └────────────────────┘
```

### 14.4. Suggested repository structure

```text
youtube-viral-intelligence/
├── apps/
│   ├── api/                         # NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── markets/
│   │   │   │   ├── discovery/
│   │   │   │   ├── videos/
│   │   │   │   ├── channels/
│   │   │   │   ├── topics/
│   │   │   │   ├── monitoring/
│   │   │   │   ├── scoring/
│   │   │   │   ├── alerts/
│   │   │   │   ├── quota/
│   │   │   │   └── system-health/
│   │   │   ├── common/
│   │   │   └── main.ts
│   │   └── prisma/
│   ├── worker/                      # BullMQ processors
│   │   └── src/
│   │       ├── processors/
│   │       ├── schedulers/
│   │       └── queues/
│   └── web/                         # Next.js + React
│       ├── app/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       └── lib/
├── packages/
│   ├── shared/                      # Shared types, schemas
│   ├── youtube-client/              # YouTube API adapter
│   ├── ai-client/                  # Gemini adapter
│   ├── scoring/                    # Pure scoring functions
│   └── config/
├── infra/
│   ├── docker/
│   └── nginx/
├── docs/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── README.md
```

Dùng pnpm workspace hoặc Turborepo để quản lý monorepo.

---

## 15. Database Design

Dùng PostgreSQL. Tên bảng snake_case; primary key UUID hoặc bigint tùy convention. YouTube IDs lưu dạng string.

### 15.1. `markets`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| code | varchar(2) | ISO country code, unique |
| name | varchar(100) | Display name |
| default_language | varchar(10) | e.g. en, ja, ko |
| timezone | varchar(64) | IANA timezone |
| enabled | boolean | Default false |
| config | jsonb | Market settings |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 15.2. `discovery_queries`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| market_id | uuid | FK |
| topic_id | uuid nullable | FK |
| query | text | Search phrase |
| language | varchar(10) | Query language |
| strategy | varchar(40) | recent_search/topic_search |
| priority | smallint | Higher first |
| enabled | boolean | |
| max_pages_per_run | smallint | Guardrail |
| frequency_minutes | integer | |
| last_run_at | timestamptz | |
| config | jsonb | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes: `(market_id, enabled, priority)`, `(topic_id)`.

### 15.3. `videos`

| Column | Type | Notes |
|---|---|---|
| id | uuid | Internal PK |
| youtube_video_id | varchar(32) | Unique |
| channel_id | uuid nullable | FK |
| title | text | |
| description | text | |
| published_at | timestamptz | |
| duration_seconds | integer nullable | |
| category_id | varchar(32) | |
| default_language | varchar(10) nullable | |
| thumbnail_url | text nullable | |
| current_view_count | bigint nullable | |
| current_like_count | bigint nullable | |
| current_comment_count | bigint nullable | |
| video_license | varchar(32) nullable | If exposed |
| privacy_status | varchar(32) nullable | If exposed |
| embeddable | boolean nullable | If exposed |
| live_broadcast_content | varchar(32) nullable | |
| format_classification | varchar(32) | unknown/short_candidate/long |
| format_confidence | numeric(5,4) | |
| first_discovered_at | timestamptz | |
| last_enriched_at | timestamptz | |
| metadata | jsonb | Small non-sensitive subset |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Indexes:
- Unique `youtube_video_id`.
- `(published_at DESC)`.
- `(current_view_count DESC)`.
- `(channel_id, published_at DESC)`.
- GIN only if needed for metadata search.

### 15.4. `channels`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| youtube_channel_id | varchar(32) | Unique |
| title | text | |
| description | text | |
| custom_url | text nullable | |
| thumbnail_url | text nullable | |
| creator_country | varchar(2) nullable | Creator-provided metadata only |
| published_at | timestamptz nullable | |
| uploads_playlist_id | varchar(128) nullable | |
| current_subscriber_count | bigint nullable | |
| current_view_count | bigint nullable | |
| current_video_count | bigint nullable | |
| subscriber_count_hidden | boolean | |
| first_discovered_at | timestamptz | |
| last_enriched_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 15.5. `discovery_events`

Một video có thể được phát hiện nhiều lần từ nhiều market/query/source.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| video_id | uuid | FK |
| market_id | uuid | FK |
| discovery_query_id | uuid nullable | FK |
| source | varchar(40) | most_popular/search/channel_uploads/manual |
| source_rank | integer nullable | |
| discovered_at | timestamptz | |
| source_payload | jsonb nullable | Giới hạn dữ liệu lưu |
| created_at | timestamptz | |

Indexes:
- `(market_id, discovered_at DESC)`.
- `(video_id, discovered_at DESC)`.
- `(source, discovered_at DESC)`.

### 15.6. `video_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | bigserial | PK |
| video_id | uuid | FK |
| collected_at | timestamptz | |
| view_count | bigint nullable | |
| like_count | bigint nullable | |
| comment_count | bigint nullable | |
| fetch_status | varchar(20) | success/partial/error |
| source | varchar(40) | |
| raw_hash | varchar(64) nullable | |
| created_at | timestamptz | |

Indexes:
- Unique `(video_id, collected_at)` nếu worker bảo đảm timestamp bucket.
- `(video_id, collected_at DESC)`.
- BRIN trên `collected_at` khi bảng lớn.

Không lưu số 0 cho dữ liệu API không trả về.

### 15.7. `channel_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | bigserial | PK |
| channel_id | uuid | FK |
| collected_at | timestamptz | |
| subscriber_count | bigint nullable | |
| view_count | bigint nullable | |
| video_count | bigint nullable | |
| fetch_status | varchar(20) | |
| created_at | timestamptz | |

### 15.8. `topics`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| slug | varchar(160) | Unique |
| canonical_name | varchar(200) | |
| description | text | |
| parent_topic_id | uuid nullable | Self FK |
| status | varchar(20) | candidate/active/merged/rejected |
| confidence | numeric(5,4) | |
| created_by | varchar(20) | user/ai |
| merged_into_topic_id | uuid nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 15.9. `topic_localizations`

- `id`
- `topic_id`
- `language`
- `localized_name`
- `synonyms` (jsonb)
- `seed_keywords` (jsonb)
- Unique `(topic_id, language)`.

### 15.10. `video_topics`

- `video_id`
- `topic_id`
- `relation_type` (primary/secondary)
- `confidence`
- `classification_model`
- `prompt_version`
- `classified_at`
- Unique `(video_id, topic_id)`.

### 15.11. `trend_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | bigserial | PK |
| market_id | uuid | FK |
| topic_id | uuid | FK |
| window_start | timestamptz | |
| window_end | timestamptz | |
| unique_video_count | integer | |
| unique_channel_count | integer | |
| total_observed_views | bigint nullable | Sum within observed set only |
| median_vph | numeric | |
| p90_vph | numeric | |
| outlier_video_count | integer | |
| momentum_score | numeric(5,2) | |
| sample_confidence | numeric(5,4) | |
| created_at | timestamptz | |

Unique `(market_id, topic_id, window_start, window_end)`.

### 15.12. Supporting tables

MVP/P1:
- `video_scores`: score history and score breakdown.
- `channel_scores`: channel score history.
- `watchlist_items`: user entity watchlist.
- `alerts`: alert events and read status.
- `job_runs`: job execution status, duration, result count.
- `api_usage_logs`: endpoint, quota estimate, status, market, request time.
- `ai_classification_runs`: model, prompt version, input hash, output, status.
- `app_settings`: non-secret configuration only.
- `users`, `sessions` or auth provider tables.

---

## 16. API Design

Base path: `/api/v1`

### 16.1. Overview

- `GET /overview?market=US&from=...&to=...`
- `GET /overview/summary`
- `GET /overview/discovery-volume`
- `GET /overview/top-signals`

### 16.2. Markets

- `GET /markets`
- `PATCH /markets/:id`
- `GET /markets/:id/health`

### 16.3. Videos

- `GET /videos`
  - filters: market, topic, lifecycle, published_from, published_to, min_views, min_vph, min_score, format, channel_id.
  - sort: viral_score, vph, growth_pct, published_at, view_count.
  - pagination: cursor-based preferred.
- `GET /videos/:id`
- `GET /videos/:id/snapshots`
- `GET /videos/:id/discovery-events`
- `POST /videos/:id/watchlist`
- `DELETE /videos/:id/watchlist`
- `POST /videos/export`

### 16.4. Channels

- `GET /channels`
- `GET /channels/:id`
- `GET /channels/:id/videos`
- `GET /channels/:id/snapshots`
- `POST /channels/:id/watchlist`
- `DELETE /channels/:id/watchlist`

### 16.5. Topics

- `GET /topics`
- `GET /topics/:id`
- `GET /topics/:id/videos`
- `GET /topics/:id/channels`
- `GET /topics/:id/trends`
- `POST /topics`
- `PATCH /topics/:id`
- `POST /topics/:id/approve`
- `POST /topics/:id/merge`

### 16.6. Discovery

- `GET /discovery/queries`
- `POST /discovery/queries`
- `PATCH /discovery/queries/:id`
- `POST /discovery/queries/:id/run`
- `GET /discovery/jobs`
- `GET /discovery/jobs/:id`

### 16.7. Alerts and system health

- `GET /alerts`
- `PATCH /alerts/:id/read`
- `GET /system/health`
- `GET /system/jobs`
- `GET /system/quota`
- `GET /system/api-usage`

### 16.8. API response conventions

- JSON.
- ISO 8601 timestamps UTC.
- Numeric counters serialized safely; frontend phải xử lý BIGINT có thể vượt JavaScript safe integer bằng string hoặc safe serialization.
- Pagination response có `items`, `nextCursor`, `hasMore`.
- Error format thống nhất: `code`, `message`, `details`, `requestId`.
- Không trả API key hoặc secret.
- Filter validation chặt chẽ.
- Rate limit cho endpoint export và manual job trigger.

---

## 17. Job Queue và Scheduling

### 17.1. Queue names

- `discovery-regional`
- `discovery-search`
- `discovery-channel`
- `video-enrichment`
- `channel-enrichment`
- `video-monitoring`
- `channel-monitoring`
- `ai-classification`
- `topic-aggregation`
- `score-calculation`
- `alert-dispatch`
- `maintenance`

### 17.2. Job flow

**Regional discovery**
1. Scheduler chọn market active.
2. Check quota budget.
3. Enqueue regional popularity job.
4. Fetch results.
5. Upsert discovery events.
6. Enqueue enrichment cho video mới/metadata cũ.
7. Record job metrics.

**Search discovery**
1. Scheduler chọn query enabled theo priority.
2. Check daily query budget.
3. Run search.
4. Lưu nextPageToken nếu được phép dùng trong run.
5. Upsert candidate.
6. Enqueue enrichment.
7. Update query last_run.

**Video monitoring**
1. Chọn video state=monitoring/high_signal.
2. Group video IDs thành batch.
3. Gọi videos.list.
4. Insert snapshots.
5. Enqueue scoring.
6. Update lifecycle.
7. Enqueue alert nếu threshold crossing.

**Topic aggregation**
1. Lấy video classifications.
2. Aggregate theo market/topic/time window.
3. Tính momentum.
4. Lưu trend snapshot.
5. So sánh với previous window.
6. Tạo alert nếu cần.

### 17.3. Idempotency

Mỗi job cần idempotency key, ví dụ:
- `discovery:{strategy}:{market}:{query}:{date_bucket}`
- `video-enrich:{video_id}:{metadata_version}`
- `video-snapshot:{video_id}:{time_bucket}`
- `topic-aggregate:{market}:{topic}:{window}`

Không tạo duplicate snapshots khi job retry.

### 17.4. Retry policy

- Network timeout: retry exponential backoff + jitter.
- HTTP 429/quota exceeded: pause queue theo reset policy, không retry liên tục.
- HTTP 5xx: retry có giới hạn.
- HTTP 400 invalid query: mark failed, không retry tự động.
- HTTP 403 permission/quota: phân loại lỗi và báo Admin.
- Dead-letter queue cho job retry hết hạn.

### 17.5. Concurrency và rate limit

- Global concurrency limit cho YouTube API.
- Per-endpoint concurrency limit.
- Per-market scheduling budget.
- Per-query max pages.
- Token bucket hoặc Redis-based rate limiter.
- Circuit breaker khi API lỗi liên tục.

---

## 18. API Quota và Cost Management

### 18.1. Nguyên tắc

Quota YouTube có thể thay đổi theo project/API policy. Không hard-code quota mặc định như một sự thật vĩnh viễn. Cần cấu hình `daily_budget` và theo dõi thực tế trong Google Cloud Console.

Một số điểm cần xác minh tại thời điểm triển khai:
- `search.list` có quota cost cao hơn `videos.list`.
- `videos.list` và `channels.list` là endpoint đọc có chi phí thấp theo bảng quota hiện hành.
- Quota bucket và allocation có thể khác theo project.
- Invalid requests cũng có thể tiêu tốn quota.
- Quota extension phải qua quy trình của YouTube/Google nếu cần.

### 18.2. Quota budget allocation

MVP đề xuất tỷ lệ phân bổ nội bộ:
- 35% discovery search.
- 20% regional discovery.
- 25% video monitoring.
- 10% channel enrichment/monitoring.
- 10% reserve/retry/manual.

Đây là tỷ lệ ngân sách nội bộ tham khảo, phải điều chỉnh theo quota thực tế. Không phải cách YouTube phân bổ quota.

### 18.3. Quota guardrails

- Không chạy job nếu vượt daily budget.
- Có cảnh báo 70%, 85%, 95%.
- Admin có thể pause discovery search.
- Ưu tiên monitoring video high-signal.
- Cache channel/video metadata.
- Batch IDs.
- Dùng ETag/conditional request khi API hỗ trợ phù hợp.
- Lưu endpoint và quota estimate mỗi lần gọi.

### 18.4. Quota dashboard

Hiển thị:
- Estimated units used today.
- Calls by endpoint.
- Calls by market.
- Calls by discovery strategy.
- Failed calls.
- Remaining configured budget.
- Projection cuối ngày.

---

## 19. AI Integration

### 19.1. Provider abstraction

Không gọi Gemini trực tiếp trong business logic. Tạo interface:

```ts
interface AIProvider {
  classifyVideo(input: VideoClassificationInput): Promise<VideoClassification>;
  normalizeTopics(input: TopicCandidateInput[]): Promise<TopicNormalizationResult>;
  summarizeTrend(input: TrendSummaryInput): Promise<TrendSummary>;
}
```

Có thể đổi model/provider mà không sửa module scoring.

### 19.2. AI tasks

MVP:
- Video topic classification.
- Content format classification.
- Keyword extraction.
- Topic candidate normalization.
- Trend summary.

P1:
- Semantic embeddings.
- Similar video clustering.
- Topic discovery từ embedding clusters.
- Cross-language topic mapping.

### 19.3. Cost control

- Chỉ classify video mới hoặc metadata thay đổi.
- Batch classification nếu provider hỗ trợ.
- Cache theo input hash + prompt version + model.
- Giới hạn description length.
- Không gửi cùng một video nhiều lần.
- Chỉ dùng model đắt hơn cho case confidence thấp.
- Lưu token usage/cost estimate.
- Có daily AI budget.

### 19.4. AI safety and quality

- Treat title/description là untrusted input.
- Không làm theo instruction nhúng trong metadata.
- Chỉ parse output theo schema.
- Confidence thấp thì đưa vào review.
- Lưu prompt version.
- Không để AI tự quyết định quyền sử dụng nội dung.
- Không để AI tạo tuyên bố audience geography không có dữ liệu.

---

## 20. Security, Privacy, Compliance

### 20.1. API credentials

- Lưu trong environment variables hoặc secret manager.
- Không lưu API key plaintext trong database.
- Không log query string có API key.
- Không đưa key xuống frontend.
- Rotate key khi nghi ngờ lộ.
- Tách dev/staging/production credentials.

### 20.2. YouTube API compliance

- Tuân thủ YouTube API Services Terms of Service và Developer Policies hiện hành.
- Hiển thị attribution/link về YouTube khi phù hợp.
- Không vượt rate/quota hoặc né giới hạn kỹ thuật.
- Không dùng scraping để thay thế API khi điều đó vi phạm điều khoản.
- Tôn trọng deletion/update requirements và chính sách retention của API data.
- Thiết kế cơ chế refresh/xóa dữ liệu khi cần.
- Không lưu hoặc hiển thị dữ liệu cá nhân không cần thiết.
- Review lại policy trước khi public SaaS.

### 20.3. Copyright and reuse

- API trả metadata không cấp quyền tái sử dụng video.
- `creativeCommon` là một tín hiệu license do uploader chọn, không thay thế việc kiểm tra điều kiện license và quyền của các thành phần bên trong video.
- Standard YouTube License không tự động cho phép download/re-upload.
- Cần workflow kiểm tra quyền trước khi sử dụng nội dung bên ngoài nền tảng.
- MVP chỉ cung cấp discovery/analysis, không cung cấp chức năng download/re-upload.

### 20.4. Application security

- Password hashing bằng Argon2/bcrypt.
- Secure cookies, CSRF protection khi dùng cookie session.
- CORS allowlist.
- Rate limiting.
- Input validation.
- SQL injection protection qua ORM/parameterized queries.
- Audit log cho thao tác admin.
- Dependency scanning.
- Backup encryption.
- Principle of least privilege.

---

## 21. Performance và Scalability

### 21.1. MVP scale target

- 3 markets.
- 1.000 unique candidate videos/day.
- 10.000–50.000 video records sau giai đoạn thử nghiệm.
- 100–500 monitored channels.
- 5–10 seed topics.
- 2–4 snapshots/day cho high-signal videos.

Đây là target thử nghiệm, không phải API coverage guarantee.

### 21.2. Database performance

- Index theo `youtube_video_id`, `channel_id`, `published_at`, `market_id`, `collected_at`.
- Cursor pagination cho list lớn.
- Aggregate metrics theo scheduled jobs, không tính toàn bộ trên mỗi request.
- Partition `video_snapshots` theo tháng khi dữ liệu đủ lớn.
- Archive raw payload cũ theo retention.
- Dùng materialized view hoặc aggregate tables khi cần.

### 21.3. Scaling path

Khi tăng lên hàng triệu snapshots:
1. Partition snapshots theo tháng.
2. Tối ưu index/retention.
3. Tách analytics queries khỏi transactional queries nếu cần.
4. Thêm read replica khi workload tăng.
5. Cân nhắc ClickHouse/warehouse chỉ khi PostgreSQL không còn đáp ứng.
6. Không tách microservices trước khi có bottleneck thực tế.

---

## 22. Observability và Operations

### 22.1. Logs

Structured JSON logs:
- request_id
- job_id
- queue
- market_code
- endpoint
- duration_ms
- status
- error_code
- quota_estimate

Không log secret/API key.

### 22.2. Metrics

- jobs_total by queue/status.
- job_duration_seconds.
- youtube_api_requests_total by endpoint/status.
- youtube_api_quota_estimated_total.
- discovered_videos_total by market/source.
- snapshots_total.
- snapshot_lag_seconds.
- classification_failures_total.
- queue_waiting_jobs.
- database_pool_usage.

### 22.3. Alerts vận hành

- Collector không chạy trong khoảng thời gian dự kiến.
- API quota đạt threshold.
- Tỷ lệ API errors tăng cao.
- Snapshot lag vượt ngưỡng.
- Queue backlog tăng liên tục.
- AI classification failure tăng.
- Database disk usage cao.

### 22.4. Backup and recovery

- PostgreSQL daily backup.
- Kiểm tra restore định kỳ.
- Redis queue không phải source of truth.
- Có thể tái tạo jobs từ database.
- Retention và backup phải phù hợp với YouTube API policy.

---

## 23. Testing Strategy

### 23.1. Unit tests

- VPH calculation.
- Growth percentage.
- Acceleration.
- Median baseline.
- Outlier multiplier.
- Percentile normalization.
- Viral score.
- Topic momentum.
- Lifecycle transitions.
- Query budget calculation.
- Idempotency key generation.

### 23.2. Integration tests

- YouTube API adapter với mocked responses.
- Prisma repository.
- BullMQ job retry.
- Duplicate discovery event handling.
- Snapshot insert idempotency.
- AI provider schema validation.
- Market filtering.
- Quota guard.

### 23.3. E2E tests

- Admin login.
- Enable market.
- Create discovery query.
- Trigger discovery.
- View discovered video.
- View snapshot chart.
- Add to watchlist.
- Filter viral videos by market/topic.
- View channel outlier.
- Approve topic candidate.

### 23.4. Data quality tests

- Không có duplicate YouTube video IDs.
- Không tạo snapshot với view count null thành 0.
- Không tính VPH từ một snapshot.
- Không tính acceleration khi thiếu interval.
- Không gán market làm audience country.
- Không tạo topic trend với sample size quá nhỏ mà không cảnh báo.
- Không hiển thị score khi data confidence thấp mà không có nhãn.

---

## 24. Acceptance Criteria

### Epic 1 — Discovery

- [ ] Admin có thể bật/tắt market.
- [ ] Admin tạo được query theo market/language.
- [ ] Hệ thống chạy regional popularity discovery khi endpoint hỗ trợ.
- [ ] Hệ thống chạy recent search discovery.
- [ ] Video trùng ID chỉ có một entity.
- [ ] Mỗi lần phát hiện được lưu thành discovery event.
- [ ] Job có status, start/end time, result count và error.

### Epic 2 — Enrichment

- [ ] Video mới được enrich bằng videos.list.
- [ ] Channel mới được enrich bằng channels.list.
- [ ] Batch IDs để giảm số request.
- [ ] Metadata thiếu được biểu diễn null, không thay bằng 0.
- [ ] API errors không làm mất dữ liệu cũ.

### Epic 3 — Monitoring

- [ ] Video candidate được đưa vào monitoring queue theo rule.
- [ ] Snapshot được lưu theo lịch.
- [ ] Retry không tạo duplicate snapshot.
- [ ] VPH chỉ tính từ hai snapshot hợp lệ.
- [ ] Có thể xem lịch sử view chart.
- [ ] High-signal video được tăng tần suất theo cấu hình.

### Epic 4 — Viral detection

- [ ] Có VPH.
- [ ] Có GrowthPct.
- [ ] Có Acceleration khi đủ dữ liệu.
- [ ] Có Channel Outlier.
- [ ] Có Viral Score 0–100.
- [ ] Score breakdown hiển thị được.
- [ ] Có data confidence.
- [ ] Có lifecycle status.

### Epic 5 — Channel intelligence

- [ ] Channel được tạo từ video discovery.
- [ ] Có recent uploads discovery.
- [ ] Có median views baseline.
- [ ] Có outlier ratio.
- [ ] Có channel score và tier.
- [ ] Có trang channel detail.

### Epic 6 — Topic intelligence

- [ ] Video được phân loại theo schema.
- [ ] AI output được validate.
- [ ] Topic candidate có thể được approve/reject.
- [ ] Topic trend aggregate theo market/time window.
- [ ] Có unique channel count để tránh false trend.
- [ ] Có sample confidence.

### Epic 7 — Dashboard

- [ ] Overview có KPI cards.
- [ ] Viral Videos có filter/sort/pagination.
- [ ] Channel Discovery có filter/sort.
- [ ] Topic Trends có chart và detail.
- [ ] Watchlist hoạt động.
- [ ] CSV export hoạt động.
- [ ] Hiển thị data freshness.

### Epic 8 — Operations

- [ ] API key không lộ ra frontend/logs.
- [ ] Quota budget guard hoạt động.
- [ ] Job retries có giới hạn.
- [ ] Có dead-letter queue.
- [ ] Có system health dashboard.
- [ ] Có backup database.

---

## 25. MVP Roadmap và Implementation Tasks

### Phase 0 — Foundation (1–2 ngày)

**Tasks**
- [ ] Tạo monorepo pnpm.
- [ ] Tạo Next.js app.
- [ ] Tạo NestJS app.
- [ ] Tạo worker app.
- [ ] Docker Compose: PostgreSQL, Redis.
- [ ] Prisma schema và migration.
- [ ] Shared TypeScript config.
- [ ] Pino logger.
- [ ] Health endpoints.
- [ ] CI: lint, typecheck, unit tests.

**Deliverable:** Project chạy local bằng một lệnh Docker Compose.

### Phase 1 — YouTube Data Collection (3–5 ngày)

**Tasks**
- [ ] Tạo Google Cloud project.
- [ ] Enable YouTube Data API v3.
- [ ] Cấu hình API key trong secret/env.
- [ ] Implement YouTube API client.
- [ ] Implement retry/rate limit.
- [ ] Implement regional popularity discovery.
- [ ] Implement search discovery.
- [ ] Implement video enrichment.
- [ ] Implement channel enrichment.
- [ ] Implement discovery_events.
- [ ] Implement deduplication.
- [ ] Implement job_runs và API usage logs.
- [ ] Seed US, JP, KR.
- [ ] Seed 5–10 topics/queries.

**Deliverable:** Có thể chạy collector và xem video được lưu trong PostgreSQL.

### Phase 2 — Snapshot & Monitoring (3–4 ngày)

**Tasks**
- [ ] Implement monitoring queue.
- [ ] Implement batch video snapshots.
- [ ] Implement monitoring scheduler.
- [ ] Implement adaptive polling.
- [ ] Implement snapshot idempotency.
- [ ] Implement data quality validation.
- [ ] Implement snapshot APIs.

**Deliverable:** Video có lịch sử views theo thời gian.

### Phase 3 — Scoring Engine (2–4 ngày)

**Tasks**
- [ ] Implement VPH.
- [ ] Implement GrowthPct.
- [ ] Implement Acceleration.
- [ ] Implement channel baseline.
- [ ] Implement outlier multiplier.
- [ ] Implement percentile normalization.
- [ ] Implement Viral Score.
- [ ] Implement data confidence.
- [ ] Implement lifecycle transitions.
- [ ] Unit test scoring.

**Deliverable:** Có ranking video tăng trưởng bất thường.

### Phase 4 — Channel Intelligence (2–3 ngày)

**Tasks**
- [ ] Implement uploads playlist discovery.
- [ ] Fetch recent channel videos.
- [ ] Build channel baseline.
- [ ] Calculate channel outlier ratio.
- [ ] Calculate channel score/tier.
- [ ] Channel list/detail API.

**Deliverable:** Có danh sách channel rising/breakout.

### Phase 5 — AI Topic Intelligence (3–5 ngày)

**Tasks**
- [ ] Implement AI provider adapter.
- [ ] Define Zod classification schema.
- [ ] Implement batch classification.
- [ ] Save classification runs.
- [ ] Create topic candidate workflow.
- [ ] Implement topic normalization.
- [ ] Implement topic aggregation.
- [ ] Implement topic momentum score.
- [ ] Add sample-size confidence.

**Deliverable:** Có topic trends theo market.

### Phase 6 — React Dashboard (4–6 ngày)

**Tasks**
- [ ] Login page.
- [ ] Overview dashboard.
- [ ] Viral Videos table.
- [ ] Video detail + snapshot chart.
- [ ] Channel Discovery table.
- [ ] Channel detail.
- [ ] Topic Trends page.
- [ ] Topic detail.
- [ ] Watchlist.
- [ ] Discovery settings.
- [ ] System health/quota page.
- [ ] CSV export.

**Deliverable:** Có thể sử dụng sản phẩm qua giao diện web.

### Phase 7 — Hardening (2–4 ngày)

**Tasks**
- [ ] E2E tests.
- [ ] Load test các list APIs.
- [ ] Check query plans/indexes.
- [ ] API quota alert.
- [ ] Job backlog alert.
- [ ] Error tracking.
- [ ] Database backup.
- [ ] Review YouTube API policies.
- [ ] Deploy VPS/staging.
- [ ] Chạy thử 7 ngày và hiệu chỉnh score.

**Tổng ước lượng:** Khoảng 20–33 ngày công cho một MVP có đủ các luồng chính, tùy mức độ hoàn thiện UI, kinh nghiệm với API và độ phức tạp của AI. Có thể chia thành các bản release nhỏ hơn.

---

## 26. Release Plan — Ưu tiên đúng để tránh overbuild

### Release 0.1 — Data Foundation

Chỉ làm:
- Markets.
- Discovery queries.
- YouTube API client.
- Videos/channels.
- Discovery events.
- Job logs.

Mục tiêu: xác nhận có thể thu thập dữ liệu đều và có chất lượng.

### Release 0.2 — Viral Detection

Thêm:
- Snapshots.
- VPH.
- Growth.
- Outlier.
- Viral Videos page.

Mục tiêu: chứng minh hệ thống tìm được video tăng trưởng nhanh hơn cách sort theo tổng views.

### Release 0.3 — Channel Discovery

Thêm:
- Channel uploads.
- Channel baseline.
- Channel outlier score.
- Channel watchlist.

Mục tiêu: từ một video mở rộng thành một nguồn khám phá channel.

### Release 0.4 — Topic Intelligence

Thêm:
- AI classification.
- Topic taxonomy.
- Topic momentum.
- Topic trends dashboard.

Mục tiêu: phát hiện chủ đề mới và mở rộng discovery tự động.

### Release 1.0 — Daily Intelligence

Thêm:
- Alerts.
- Daily digest.
- Better trend lifecycle.
- Export.
- Operations dashboard.
- Tuning score theo dữ liệu thực tế.

---

## 27. Rủi ro và phương án giảm thiểu

| Risk | Mức độ | Mitigation |
|---|---|---|
| API quota không đủ | High | Budget, query prioritization, batch, quota extension |
| Search results không bao phủ | High | Multi-strategy discovery, channel expansion, transparent coverage |
| Không xác định được Shorts chính xác | High | Format confidence, duration heuristic, không tuyên bố chắc chắn |
| Market bị hiểu nhầm là audience country | High | UI terminology rõ ràng, data model tách market và creator metadata |
| View count thay đổi/chỉnh sửa | Medium | Snapshot anomaly handling |
| False viral signal | High | Percentile, multiple snapshots, sample confidence |
| Channel baseline thiếu dữ liệu | Medium | Peer baseline và low-confidence label |
| AI phân loại sai | Medium | Schema, confidence, manual review |
| Topic fragmentation | Medium | Canonical taxonomy, synonym merge |
| API policy thay đổi | High | Policy review, adapter isolation, compliance checklist |
| Chi phí AI tăng | Medium | Cache, batch, budget, classify only new records |
| Snapshot table tăng nhanh | Medium | Partitioning, retention, aggregate tables |
| Dữ liệu bị xóa/không truy cập | Medium | Refresh policy, unavailable state, deletion workflow |

---

## 28. Các quyết định kỹ thuật đã chốt

1. Toàn bộ code application dùng TypeScript/JavaScript.
2. Frontend dùng React + Next.js.
3. Backend dùng Node.js + NestJS.
4. Worker dùng Node.js + BullMQ.
5. PostgreSQL là source of truth.
6. Redis chỉ phục vụ queue/cache, không phải database chính.
7. YouTube Data API là nguồn chính cho MVP.
8. Discovery và Monitoring là hai pipeline riêng.
9. Snapshot là nền tảng của growth detection.
10. AI chỉ phân loại/chuẩn hóa/tóm tắt; scoring do code tính.
11. Country là market context, không phải audience geography.
12. MVP không tự động download/re-upload.
13. Bắt đầu với US, JP, KR và 5–10 seed topics.
14. Ưu tiên hoàn thành data pipeline trước dashboard bóng bẩy.

---

## 29. Open Questions cần xác nhận trước khi production

- [ ] Sản phẩm chỉ dùng cá nhân hay dự kiến SaaS nhiều user?
- [ ] Có bao nhiêu YouTube API projects/credentials hợp lệ?
- [ ] Quota thực tế được cấp cho project là bao nhiêu?
- [ ] Ưu tiên Shorts hay cả video dài?
- [ ] Có cần lưu thumbnail lâu dài hay chỉ lưu URL?
- [ ] Snapshot retention mong muốn bao lâu?
- [ ] AI provider chính là Gemini hay cần provider fallback?
- [ ] Có cần Telegram alert ngay trong MVP?
- [ ] Có cần market list 3, 10 hay 20+ quốc gia?
- [ ] Có cần tìm kiếm bằng ngôn ngữ địa phương từ ngày đầu?

---

## 30. Tài liệu tham khảo chính thức

Các endpoint, quota và policy cần được kiểm tra lại trước khi release vì Google/YouTube có thể thay đổi:

- YouTube Data API Overview: https://developers.google.com/youtube/v3/getting-started
- YouTube Data API Reference: https://developers.google.com/youtube/v3/docs
- Search: list: https://developers.google.com/youtube/v3/docs/search/list
- Videos: list: https://developers.google.com/youtube/v3/docs/videos/list
- Channels: list: https://developers.google.com/youtube/v3/docs/channels/list
- PlaylistItems: list: https://developers.google.com/youtube/v3/docs/playlistItems/list
- YouTube API Services Terms of Service: https://developers.google.com/youtube/terms/api-services-terms-of-service
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies

---

## 31. Definition of Done

MVP chỉ được coi là hoàn thành khi:

1. Hệ thống chạy ổn định ít nhất 7 ngày liên tục trên staging/production.
2. Có dữ liệu từ tối thiểu 3 markets.
3. Discovery chạy tự động và có job history.
4. Video được deduplicate chính xác.
5. Có ít nhất 2 snapshot hợp lệ cho các video monitoring.
6. Có Viral Score và score breakdown.
7. Có Channel Discovery dựa trên baseline/outlier.
8. Có Topic Trends với sample confidence.
9. Dashboard có thể lọc theo market, topic và time range.
10. Có quota guard và system health.
11. Có backup/restore procedure.
12. Các giới hạn về market, audience geography, Shorts detection và quyền sử dụng nội dung được thể hiện rõ trong UI/documentation.

**Product principle cuối cùng:** YVI không hứa tìm được mọi video viral. YVI phải làm tốt việc thu thập có hệ thống, phát hiện tín hiệu sớm từ dữ liệu quan sát được, giải thích được vì sao một kết quả đáng chú ý và liên tục cải thiện discovery dựa trên lịch sử thực tế.
