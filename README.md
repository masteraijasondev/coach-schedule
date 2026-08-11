# 教練排班與薪資

單一機構教練課堂日曆與薪資查詢（港幣 / 香港時區 / 繁體中文）。

## 功能

- 登入（僱主建立教練帳號 + 臨時密碼，首次強制改密）
- **教練**：月曆登記課堂（類型+時間）、編輯/刪除、按月薪資；可回填近 14 天
- **僱主**：全體教練月曆、建立/取消課堂、學生、課堂類型、教練薪資
- **登記即完成**：建立課堂當下凍結薪資（需已設該類型薪資規則）；無「標記完成」步驟
- 同教練時段重疊：硬阻擋；不同教練可同一時段

## 設定

1. 建立 [Supabase](https://supabase.com) 專案
2. 在 SQL Editor 依序執行：
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_coach_calendar.sql`
   - `supabase/migrations/003_register_is_complete.sql`
3. （可選）執行 `supabase/seed.sql` 預設課堂類型
4. 複製 `.env.local.example` 為 `.env.local`，填入 URL / publishable key / secret key
5. 建立僱主使用者並插入 `profiles`（見下方）
6. `npm install && npm run dev`


```sql
insert into public.profiles (id, email, full_name, role, must_change_password)
values (
  '<auth-user-uuid>',
  'employer@example.com',
  '僱主',
  'employer',
  true
);
```
