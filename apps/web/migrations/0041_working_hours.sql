-- Per-user working hours, alongside the other preferences on the better-auth
-- `user` row (0014/0016/0020/0024/0029).
--
-- Minutes after local midnight, stored local like tasks.scheduled_minute: the
-- worker runs in UTC and never decides what "9am" means. The defaults are the
-- window "Plan my day" assumed before this was a setting (09:00–17:30), so no
-- existing user's plan changes until they change it.
ALTER TABLE "user" ADD COLUMN work_start_minute INTEGER NOT NULL DEFAULT 540;
ALTER TABLE "user" ADD COLUMN work_end_minute INTEGER NOT NULL DEFAULT 1050;
