import { useState } from "react";
import type { ContentPromptKey, ContentPromptSettingsView } from "@e4s/contracts";

export function Prompts({ view, readOnly, onSave }: {
  view: ContentPromptSettingsView;
  readOnly: boolean;
  onSave: (groups: Array<{ key: ContentPromptKey; content: string }>) => void | Promise<void>;
}) {
  const [groups, setGroups] = useState(view.groups);
  const change = (key: ContentPromptKey, content: string) => setGroups((current) => current.map((group) => group.key === key ? { ...group, content } : group));
  return <main className="operator-page prompts-page">
    <header className="operator-heading page-title"><div><a className="back-link" href="/settings">← Cài đặt</a><h1>Prompt & rubric</h1><p>Đây là hướng dẫn hệ thống gửi cho AI. Sửa khi thấy AI lệch mức, sửa sai hoặc khen quá tay. Để trống ô = dùng mặc định.</p></div></header>
    {readOnly ? <p className="operator-readonly">Quản lý đang xem ở chế độ chỉ đọc.</p> : null}
    <div className="prompt-card-list">{groups.map((group) => <section className="prompt-card operator-card" key={group.key}><div className="prompt-card-heading operator-row operator-row--between"><h3>{group.label}</h3><button className="operator-button--small" type="button" disabled={readOnly} onClick={() => change(group.key, group.defaultContent)}>Về mặc định</button></div><textarea aria-label={group.label} value={group.content} disabled={readOnly} onChange={(event) => change(group.key, event.target.value)} /></section>)}</div>
    <button className="button--primary" type="button" disabled={readOnly} onClick={() => void onSave(groups.map(({ key, content }) => ({ key, content })))}>Lưu prompt</button>
  </main>;
}
