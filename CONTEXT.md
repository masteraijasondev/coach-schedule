# Coach Schedule

Scheduling and payroll for coaches (employees) and employers at a training centre.

## Language

**可返工 (Availability)**:
A coach-declared time window when they can be assigned work. Not itself a paid shift.
_Avoid_: Shift, 報更 (when meaning availability)

**放假 (Leave)**:
A coach-declared unavailable window: a full day, or a timed Short Break. Full-day leave is mutually exclusive with availability that day. A Short Break can sit beside availability on the same day (for example evening unavailable, morning still 可返工). Both block assignment in the covered window.
_Avoid_: Day off request (as a separate approval object)

**派更 (Assignment)**:
An employer-created lesson placed fully inside a coach's availability, of any lesson type (PT, PTA, Admin, etc.). Starts as pending confirmation.
_Avoid_: Open lesson, self-registered lesson, 派工

**待員工確認**:
Assignment status after the employer assigns and before the coach confirms. Visible on both calendars; does not count toward pay.
_Avoid_: 已指派 (as the user-facing label), pending approval by employer

**已確認 / 已確認簽到**:
Coach-confirmed work periods inside an assignment. Only these periods count toward payroll when an amount is set. Time inside the original assigned window that was not added stays unconfirmed and unpaid.
_Avoid_: 已完成 (as the user-facing label for pay eligibility)

**確認派更 / 簽到**:
The coach confirms actual work inside an assigned window by adding one or more time periods that have already ended, then confirming. Future time cannot be checked in. Only added past periods become 已確認簽到 and count toward payroll. Time not added is unconfirmed and unpaid; leftover availability can be assigned again.
_Avoid_: Confirming the whole assigned window in one click; confirming time that has not yet ended

**計薪課堂**:
A confirmed lesson with a coach pay amount. Salary totals only these.
_Avoid_: Any assigned-but-unconfirmed lesson
