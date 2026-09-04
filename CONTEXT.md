# Coach Schedule

Scheduling and payroll for coaches (employees) and employers at a training centre.

## Language

**可返工 (Availability)**:
A coach-declared time window when they can be assigned work. Not itself a paid shift.
_Avoid_: Shift, 報更 (when meaning availability)

**放假 (Leave)**:
A full day the coach is unavailable. Mutually exclusive with availability that day. Blocks assignment.
_Avoid_: Day off request (as a separate approval object)

**派工 (Assignment)**:
An employer-created lesson placed fully inside a coach's availability, of any lesson type (PT, PTA, Admin, etc.). Starts as pending confirmation.
_Avoid_: Open lesson, self-registered lesson

**待員工確認**:
Assignment status after the employer assigns and before the coach confirms. Visible on both calendars; does not count toward pay.
_Avoid_: 已指派 (as the user-facing label), pending approval by employer

**已確認**:
Assignment status after the coach confirms, before start time. Counts toward payroll when an amount is set.
_Avoid_: 已完成 (as the user-facing label for pay eligibility)

**確認派工**:
The coach's sole action on an assignment (accept). There is no reject action; disagreement is handled by employer cancel.
_Avoid_: Approve, 批更 (employer-side)

**計薪課堂**:
A confirmed lesson with a coach pay amount. Salary totals only these.
_Avoid_: Any assigned-but-unconfirmed lesson
