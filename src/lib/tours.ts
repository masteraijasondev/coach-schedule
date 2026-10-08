export type TourStep = {
  id: string;
  title: string;
  body: string;
};

export const EMPLOYER_TOUR: TourStep[] = [
  {
    id: "employer-nav-calendar",
    title: "日曆",
    body: "按「日曆」查看全體員工的可返工、已派更同放假。之後的派更都在這一頁完成。",
  },
  {
    id: "employer-filter-staff",
    title: "篩選員工",
    body: "點選員工或組別，月曆只保留這些人的時段。再點一次就隱藏。",
  },
  {
    id: "employer-filter-status",
    title: "篩選狀態",
    body: "用顏色顯示或隱藏待公司派更、已派更、放假、已簽到同暫無需要。",
  },
  {
    id: "employer-view",
    title: "月曆或週曆",
    body: "月曆看整個月。週曆先選一位員工，再點時段派更。",
  },
  {
    id: "employer-month",
    title: "選擇日期",
    body: "點選日期後，右側列出當日每位員工的時段。",
  },
  {
    id: "employer-day",
    title: "當日派更",
    body: "點開琥珀色可返工色塊，才可以派更或標為暫無需要。色塊打開後才可繼續。若今日沒有可返工，可按略過。",
  },
  {
    id: "employer-assign-estimate",
    title: "預期薪金",
    body: "這裡用時薪估計已派更但未簽到的薪金。改時間會更新今次時段估計。已確認薪金要等同事簽到。",
  },
  {
    id: "employer-nav-salary",
    title: "薪資",
    body: "按「薪資」查看今個結算期。頁面打開後才可繼續。",
  },
  {
    id: "employer-salary-totals",
    title: "已確認與預期",
    body: "已確認薪金只計已簽到。預期薪金只計尚未簽到的已派更，按時薪估計。點員工姓名可看明細。",
  },
  {
    id: "employer-nav-settings",
    title: "設定",
    body: "按「設定」管理同事、課堂類型同學生。頁面打開後才可繼續。",
  },
  {
    id: "employer-settings",
    title: "管理資料",
    body: "同事與工作類型可改時薪或分成。課堂類型決定計薪方式。新增學生會寫入 Airtable。",
  },
];

export const COACH_TOUR: TourStep[] = [
  {
    id: "coach-nav-calendar",
    title: "日曆",
    body: "按「日曆」申報可返工、放假，以及為已派更的時段簽到。",
  },
  {
    id: "coach-view",
    title: "月曆或週曆",
    body: "月曆看整個月，並在右側處理當日。週曆以時間格申報同時段。",
  },
  {
    id: "coach-month",
    title: "選擇日期",
    body: "點選日期後，右側顯示當日的申報同已派更。",
  },
  {
    id: "coach-day",
    title: "當日工作",
    body: "這裡看到待簽到同已簽到的數目。已派更的時段要加入實際上班時間後確認，未加入的時間不計薪。",
  },
  {
    id: "coach-report",
    title: "報更或報假",
    body: "按「報更 / 報假」新增可返工時間、Short Break、放假或病假。儲存後月曆會立即更新。若按鈕未出現，先撤銷全日放假。",
  },
  {
    id: "coach-nav-salary",
    title: "薪資",
    body: "按「薪資」查看今個結算期。頁面打開後才可繼續。",
  },
  {
    id: "coach-salary-totals",
    title: "已確認與預期",
    body: "已確認薪金只計已簽到課堂。預期薪金按尚未簽到的已派更時段乘時薪估計。學生分成要簽到後先計入已確認。",
  },
  {
    id: "coach-nav-students",
    title: "新增學生",
    body: "按「新增學生」建立學生資料。頁面打開後才可繼續。",
  },
  {
    id: "coach-student-form",
    title: "學生資料",
    body: "姓名同電話必填。提交後資料寫入 Airtable。電郵同性別可以稍後再填。",
  },
];
