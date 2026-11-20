import { useEffect, useState } from "react";
import { Button, OperatorPage, PageTitle } from "./primitives.js";
import type { OperatorPromptsActions, OperatorPromptsView, PromptKey } from "./types.js";

export function OperatorPrompts({ view, actions, readOnly = false }: { view: OperatorPromptsView; actions: OperatorPromptsActions; readOnly?: boolean }) {
  const makeValues = () => Object.fromEntries(view.prompts.map(([key, , value]) => [key, value])) as Record<PromptKey, string>;
  const [values, setValues] = useState<Record<PromptKey, string>>(makeValues);
  const saving = view.saveState === "loading";
  useEffect(() => setValues(makeValues()), [view.prompts]);
  return <OperatorPage title="Prompt" hideRouteBack><PageTitle><a className="link-button small" href="/settings" onClick={event => { event.preventDefault(); actions.onBack(); }}>← Cài đặt</a><h1>Prompt & rubric</h1><p className="muted">Đây là hướng dẫn hệ thống gửi cho AI. Sửa khi thấy AI lệch mức, sửa sai hoặc khen quá tay. Để trống ô = dùng mặc định.</p></PageTitle>
    {view.prompts.map(([key, label, , status, version]) => {
      const headingId = `prompt-${key}-label`;
      const textareaId = `prompt-${key}`;
      return <section className="card" key={key} aria-labelledby={headingId}><div className="row between"><div className="row"><h3 id={headingId}>{label}</h3><span className="small muted">{status === "draft" ? `Bản nháp v${version}` : `Đang dùng v${version}`}</span></div><div className="row">{status === "draft" && <Button type="button" small disabled={readOnly || saving} aria-label={`Phát hành ${label}`} onClick={() => actions.onPublish(key, version)}>Phát hành</Button>}<Button type="button" small disabled={readOnly || saving} onClick={() => actions.onReset(key)}>Về mặc định</Button></div></div><textarea id={textareaId} aria-labelledby={headingId} style={{ minHeight: 140, fontSize: ".85rem" }} value={values[key] ?? ""} readOnly={readOnly} disabled={saving} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></section>;
    })}
    <div className="row" style={{ marginTop: 16, alignItems: "center" }}><Button type="button" primary style={{ borderColor: "transparent", background: "var(--primary)", boxShadow: "none", color: "var(--primary-ink)" }} disabled={readOnly || saving} busy={saving} onClick={() => actions.onSave(values)}>{saving ? "Đang lưu…" : "Lưu prompt"}</Button>{view.saveError && <span className="small" role="alert" style={{ color: "var(--danger)" }}>{view.saveError}</span>}</div>
  </OperatorPage>;
}
