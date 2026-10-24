export type TourStep = {
  id: string;
  title: string;
  body: string;
};

export type RouteTour = {
  storageKey: string;
  match: (pathname: string) => boolean;
  steps: TourStep[];
};

export const EMPLOYER_TOURS: RouteTour[] = [
  {
    storageKey: "employer-salary-detail",
    match: (pathname) => /^\/employer\/salary\/[^/]+$/.test(pathname),
    steps: [
      {
        id: "employer-salary-detail",
        title: "一位同事的薪金",
        body: "已確認薪金只計已簽到。預期薪金按尚未簽到的已派更時段乘時薪估計。下方按工作類型列出已簽到明細。",
      },
    ],
  },
  {
    storageKey: "employer-salary",
    match: (pathname) => pathname === "/employer/salary",
    steps: [
      {
        id: "employer-salary-totals",
        title: "已確認與預期",
        body: "已確認薪金只計已簽到。預期薪金只計尚未簽到的已派更，按時薪估計。點員工姓名可看這一位的明細。",
      },
    ],
  },
  {
    storageKey: "employer-coaches-workflow",
    match: (pathname) => pathname === "/employer/coaches",
    steps: [
      {
        id: "employer-coach-create-name",
        title: "新同事姓名",
        body: "輸入顯示姓名。建立後，右側列表同月曆都會用這個名字。",
      },
      {
        id: "employer-coach-create-role",
        title: "職位",
        body: "選 Coach 或 Admin。Coach 可以填分成，教班跟學生價。Admin 只計時薪。",
      },
      {
        id: "employer-coach-create-email",
        title: "登入電郵",
        body: "這是登入帳號。同一電郵不能再建立另一個使用中的帳號。",
      },
      {
        id: "employer-coach-create-password",
        title: "臨時密碼",
        body: "至少 8 字元。員工第一次登入必須自行更改密碼。",
      },
      {
        id: "employer-coach-create-submit",
        title: "建立帳號",
        body: "按這裡建立。成功後，這位同事會出現在右側列表。",
      },
      {
        id: "employer-coach-edit-name",
        title: "修改姓名",
        body: "改這位同事的顯示姓名。要按「更新員工資料」先生效。",
      },
      {
        id: "employer-coach-edit-role",
        title: "更改職位",
        body: "改為 Admin 會收起分成。改為 Coach 後可以填分成。",
      },
      {
        id: "employer-coach-hourly",
        title: "預設時薪",
        body: "按時數簽到時，若該工作類型沒有另填時薪，就用這個數。",
      },
      {
        id: "employer-coach-ratio",
        title: "Coach 分成",
        body: "只適用於 Coach。教班簽到按學生學費乘這個百分比計人工。Admin 沒有這一欄。",
      },
      {
        id: "employer-coach-save-profile",
        title: "儲存資料",
        body: "按「更新員工資料」先儲存姓名、職位、時薪同分成。",
      },
      {
        id: "employer-coach-types",
        title: "可做的工作",
        body: "勾選後，這位同事簽到時才可以報這種工作。",
      },
      {
        id: "employer-coach-type-rate",
        title: "工作類型時薪",
        body: "按時數的工作可以各自填時薪，例如 Admin 100、PTA 120。留空就用上面的預設時薪。教班仍然跟學生價。",
      },
      {
        id: "employer-coach-save-types",
        title: "儲存工作類型",
        body: "按這裡後，勾選同各類型時薪先會用於之後的簽到。",
      },
    ],
  },
  {
    storageKey: "employer-lesson-types",
    match: (pathname) => pathname === "/employer/lesson-types",
    steps: [
      {
        id: "employer-lesson-types",
        title: "課堂類型",
        body: "新增類型時選擇計薪方式，例如按學生、按人數或按時數。停用後就不會再出現在簽到選項。",
      },
    ],
  },
  {
    storageKey: "employer-students",
    match: (pathname) => pathname === "/employer/students",
    steps: [
      {
        id: "coach-student-form",
        title: "新增學生",
        body: "姓名同電話必填。提交後資料寫入 Airtable。電郵同性別可以稍後再填。",
      },
    ],
  },
  {
    storageKey: "employer-settings",
    match: (pathname) => pathname === "/employer/settings",
    steps: [
      {
        id: "employer-settings",
        title: "設定",
        body: "按「同事與工作類型」改時薪或分成。按「課堂類型」設定計薪方式。按「新增學生」寫入 Airtable。",
      },
    ],
  },
  {
    storageKey: "employer-calendar",
    match: (pathname) => pathname === "/employer",
    steps: [
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
        body: "點開琥珀色可返工色塊，就可以派更或標為暫無需要。",
      },
    ],
  },
];

export const COACH_TOURS: RouteTour[] = [
  {
    storageKey: "coach-salary",
    match: (pathname) => pathname === "/coach/salary",
    steps: [
      {
        id: "coach-salary-totals",
        title: "已確認與預期",
        body: "已確認薪金只計已簽到課堂。預期薪金按尚未簽到的已派更時段乘時薪估計。學生分成要簽到後先計入已確認。",
      },
    ],
  },
  {
    storageKey: "coach-students",
    match: (pathname) => pathname === "/coach/students",
    steps: [
      {
        id: "coach-student-form",
        title: "學生資料",
        body: "姓名同電話必填。提交後資料寫入 Airtable。電郵同性別可以稍後再填。",
      },
    ],
  },
  {
    storageKey: "coach-calendar",
    match: (pathname) => pathname === "/coach",
    steps: [
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
        body: "按「報更 / 報假」，先選可返工、放假或病假，再填一段時間。儲存後月曆會立即更新。若按鈕未出現，先撤銷全日放假。",
      },
    ],
  },
];
