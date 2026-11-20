# UI follow-up: months, grouped appeals, full-width tabs and archived forms

User supplied ten screenshots and directly requested these corrections on the existing 4300 implementation. Continue the approved scope; 4175 and GitHub remain untouched.

- [x] Group monthly exam versions by explicit month/year, analogous to promotion level selection. Preserve level and status within the chosen month. API provides canonical month metadata; do not infer from display titles or publication timestamps. Tabs run chronologically, including year boundaries.
- [x] Appeals use one shared outer card and grouped rows, matching Season feedback; preserve all actions and read-only Manager access.
- [x] Tab bars fill their available width with equal-width items across learner/operator/Manager; account for nested Manager groups and narrow-screen label wrapping.
- [x] Trace compact CSS leaking into desktop, inspect actual computed layout at 375/440/768/960/961/1024/1440px. Restore appropriate desktop exam modal width, preserve mobile spacing and aligned help/close controls. Audit all three roles and resize transitions.
- [x] Add explicit confirmed delete for archived unused bank forms. Deny deletion of source forms used by attempts or selected policies. Keep historical exam data and referenced files. Test permissions and organization scope.
- [x] Keep existing theme surfaces with clear input and fieldset boundaries. Follow the monthly saved-version list and shared monthly preview exactly for other exam types. Preserve certificate print white paper. Supersedes the rejected broad green background treatment.
- [x] Run focused checks/typecheck/build, migrate/deploy only e4s-dev, verify browser behavior and capture actual 4300 screenshots for all three roles.
- [x] Keep compact actions directly visible on one row, with delivery configuration in the toolbar. Do not represent this feature as a form row or hide actions in a menu.
- [x] Add explicit per-form status badges: configured published sources are Đang dùng; other published forms Đã duyệt; drafts Bản nháp; archives Đã lưu trữ. Preserve the monthly row layout and surfaces.

Ownership: monthly_appeals_ui owns controller/Review and related tests; archived_delete owns bank contract/API/database/UI and new migration; root owns shared CSS, month API metadata and integration. responsive_audit supplies independent read-only findings and real-browser screenshots. Changes share the existing intentionally dirty worktree.
