# 0001 MVP Scope Decisions (PRD Open Questions)

Date: 2026-11-05

## Status

Accepted

## Context

`prd-youtube-viral-intelligence.md` mục 29 liệt kê 10 open question cần xác
nhận trước khi production. Các câu hỏi này ảnh hưởng trực tiếp đến scope,
schema seed data, và độ phức tạp MVP, nên cần quyết định trước khi bắt đầu
Phase 0.

## Decision

Người dùng (product owner) đã chốt toàn bộ 10 open question của PRD mục 29:

| # | Open question (PRD §29) | Quyết định |
|---|---|---|
| 1 | Cá nhân hay SaaS nhiều user? | Dùng cá nhân. Một role Admin/User đơn giản như PRD §3.3; không build multi-tenant thật trong MVP. |
| 2 | Có bao nhiêu YouTube API project/credential? | Chưa tạo cho project này. Sẽ tạo mới ở Phase 1 (Google Cloud project + API key), chỉ 1 project/key cho MVP. |
| 3 | Quota thực tế được cấp? | Giả định mặc định free tier 10,000 units/ngày. Đây là giả định chưa xác minh — phải kiểm tra lại trong Google Cloud Console trước khi production (theo DoD §31). |
| 4 | Ưu tiên Shorts hay video dài? | Ưu tiên Shorts. |
| 5 | Lưu thumbnail lâu dài hay chỉ URL? | Chỉ lưu URL, không download/lưu bản copy lâu dài. |
| 6 | Snapshot retention mong muốn? | Giữ nguyên, không xoá/archive tự động ở MVP; xem xét lại khi dữ liệu lớn hơn (partitioning theo PRD §21.2 sẽ áp dụng khi cần, không phải retention policy xoá dữ liệu). |
| 7 | Gemini only hay cần fallback AI provider? | Chỉ Gemini cho MVP, qua `AIProvider` interface (PRD §19.1) để có thể đổi provider sau mà không sửa scoring module. |
| 8 | Cần Telegram/Email alert trong MVP? | Không. Chỉ in-app alert (P0 theo PRD §11.7); Telegram/Email giữ nguyên là P1. |
| 9 | Market list 3, 10 hay 20+ quốc gia? | Bắt đầu 4 markets: **US, UK, DE, FR** (thay cho ví dụ US/JP/KR ở PRD §28/§12.1). Có thể mở rộng sau. |
| 10 | Cần query ngôn ngữ địa phương từ ngày đầu? | Có. Seed query đa ngôn ngữ (en, de, fr) từ ngày đầu, theo mô hình PRD §6.3. |

## Alternatives Considered

1. Giữ market mặc định US/JP/KR như PRD gốc — bị bác bỏ, user chọn thị trường
   khác phù hợp mục tiêu thực tế (US/UK/DE/FR).
2. SaaS multi-tenant từ đầu — bị bác bỏ để tránh overbuild MVP (đúng tinh thần
   PRD §26 "tránh overbuild").
3. Fallback AI provider ngay từ MVP — bị bác bỏ, giữ đúng scope AI Phase 5 của
   PRD, interface đã đủ để đổi sau.

## Consequences

Positive:

- Scope Phase 0–7 giữ nguyên theo PRD, không cần thêm complexity multi-tenant
  hoặc multi-provider AI.
- Market list cụ thể (US/UK/DE/FR) cho phép seed topics/queries theo đúng 4
  ngôn ngữ (en, en-GB, de, fr) ngay từ Phase 1.

Tradeoffs:

- Market US/UK/DE/FR không trùng ví dụ seed keyword đa ngôn ngữ ở PRD §6.3
  (ví dụ tiếng Nhật/Hàn); cần soạn lại seed keyword tiếng Đức/Pháp khi viết
  seed data thật ở Phase 1.
- Quota 10,000 units/ngày là giả định chưa xác minh; budget allocation ở PRD
  §18.2 phải tính lại theo số thật sau khi tạo project và kiểm tra Cloud
  Console.
- "Ưu tiên Shorts" chưa có cơ chế cụ thể trong công thức scoring/discovery của
  PRD (PRD không định nghĩa trọng số ưu tiên Shorts). Cần quyết định kỹ thuật
  riêng khi triển khai Phase 1/3 (ví dụ: mặc định `videoDuration=short` cho
  search discovery, hoặc trọng số ưu tiên `format_classification=short_candidate`
  trong Viral Score) — không tự suy diễn công thức ở đây.

## Follow-Up

- Soạn seed queries/topics tiếng Anh (US/UK), Đức, Pháp cho Phase 1 (thay thế
  ví dụ ja/ko trong PRD §6.3).
- Khi tạo Google Cloud project ở Phase 1, xác minh quota thật và cập nhật lại
  giả định 10,000 units/ngày trong cấu hình `daily_budget`.
- Quyết định cơ chế kỹ thuật cụ thể cho "ưu tiên Shorts" trước khi implement
  Discovery Strategy 2 (search) và Viral Score ở Phase 1/3.
