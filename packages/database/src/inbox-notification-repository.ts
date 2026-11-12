import type { InboxNotificationView, InboxReadInput, NotificationInboxView } from "@e4s/contracts";
import type { Pool } from "pg";

const inboxScope = `select n.* from inbox_notifications n join users u on u.id = n.recipient_id
  where u.id = $1 and u.status = 'active' and u.organization_id = n.organization_id and u.role = n.recipient_role`;

export class InboxNotificationRepository {
  constructor(private readonly pool: Pool) {}

  async list(userId: string, limit: number, unreadOnly: boolean, cursor?: string): Promise<NotificationInboxView> {
    const { rows } = await this.pool.query<{ items: InboxNotificationView[]; unreadCount: number }>(
      `with owned as not materialized (${inboxScope}),
       page as (
         select id, kind, context, created_at as "createdAt", read_at as "readAt",
                substring(event_key from '^(?:complaint:|appeal:[a-z]+:|reopen:[a-z]+:|audit:|assessment:)([0-9a-fA-F-]{36}):') as "relatedId",
                case when kind = 'security_report' then (
                  select jsonb_build_object('subjectName', subject.display_name, 'note', report.note)
                  from manager_pin_reports report join users subject on subject.id = report.subject_user_id
                  where report.organization_id = owned.organization_id
                    and report.id = substring(owned.event_key from '^security:([0-9a-fA-F-]{36})$')::uuid
                ) end as "securityReport"
         from owned
         where $2 > 0 and (not $3::boolean or read_at is null)
           and ($4::uuid is null or (created_at, id) < (select created_at, id from owned where id = $4))
         order by created_at desc, id desc
         limit case when $2::int = 0 then 0 else $2 + 1 end
       )
       select coalesce((select jsonb_agg(page order by "createdAt" desc, id desc) from page), '[]') as items,
              (select count(*)::int from owned where read_at is null) as "unreadCount"`,
      [userId, limit, unreadOnly, cursor ?? null]
    );
    const { items, unreadCount } = rows[0]!;
    return { items: items.slice(0, limit), unreadCount, nextCursor: items.length > limit ? items[limit - 1]!.id : null };
  }

  async markRead(userId: string, input: InboxReadInput): Promise<{ unreadCount: number }> {
    await this.pool.query(
      `with owned as not materialized (${inboxScope})
       update inbox_notifications n set read_at = now()
       from owned where n.id = owned.id and n.read_at is null
         and ($2::uuid[] is null or n.id = any($2))`,
      [userId, "all" in input ? null : input.ids]
    );
    const { unreadCount } = await this.list(userId, 0, false);
    return { unreadCount };
  }
}
