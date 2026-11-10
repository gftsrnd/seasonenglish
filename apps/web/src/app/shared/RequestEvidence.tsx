import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { requestEvidenceMaxBytes, type RequestEvidenceInput, type RequestEvidenceKind, type RequestEvidenceView } from "@e4s/contracts";
import { apiUrl } from "../../api/runtime.js";
import "./request-workspace.css";

const supportedTypes = ["image/png", "image/jpeg", "image/webp"] as const;
type Screenshot = NonNullable<RequestEvidenceInput["screenshot"]>;

export type RequestEvidenceDraft = RequestEvidenceInput & { blocked?: boolean };
export function requestEvidenceArgs(draft: RequestEvidenceDraft): [] | [RequestEvidenceInput] {
  const scope = draft.scope?.trim();
  return scope || draft.screenshot ? [{ ...(scope ? { scope } : {}), ...(draft.screenshot ? { screenshot: draft.screenshot } : {}) }] : [];
}

export function RequestEvidenceFields({ value, onChange, label, placeholder, disabled, english = false }: {
  value: RequestEvidenceDraft;
  onChange: Dispatch<SetStateAction<RequestEvidenceDraft>>;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  english?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  useEffect(() => () => { selection.current += 1; }, []);

  async function selectFile(file: File | undefined) {
    const revision = ++selection.current;
    setError("");
    setPreparing(Boolean(file));
    onChange(current => ({ ...current, blocked: Boolean(file), screenshot: undefined }));
    if (!file) return;
    try {
      const screenshot = await encodeScreenshot(file);
      if (revision === selection.current) onChange(current => ({ ...current, blocked: false, screenshot }));
    } catch {
      if (revision === selection.current) {
        if (input.current) input.current.value = "";
        onChange(current => ({ ...current, blocked: false }));
        setError(english ? "Could not read this image. Choose a PNG, JPEG or WebP image under 10 MB." : "Không đọc được ảnh này. Hãy chọn ảnh PNG, JPEG hoặc WebP dưới 10 MB.");
      }
    } finally {
      if (revision === selection.current) setPreparing(false);
    }
  }

  return <>
    <label>{label}<input type="text" maxLength={180} value={value.scope ?? ""} placeholder={placeholder}
      disabled={disabled} onChange={event => { const scope = event.target.value; onChange(current => ({ ...current, scope })); }} /></label>
    <div className="request-evidence-upload">
      <div className="request-evidence-upload__actions">
        <label className="request-evidence-picker">
          <input ref={input} className="sr-only" type="file" accept={supportedTypes.join(",")} disabled={disabled}
            aria-label={english ? "Screenshot (optional)" : "Ảnh minh chứng (không bắt buộc)"}
            onChange={event => void selectFile(event.target.files?.[0])} />
          <span className="btn">{english ? "Choose image" : "Chọn ảnh minh chứng"}</span>
        </label>
        {value.screenshot ? <button type="button" className="btn-sm" disabled={disabled} onClick={() => {
          if (input.current) input.current.value = "";
          void selectFile(undefined);
        }}>{english ? "Remove image" : "Bỏ ảnh"}</button> : null}
      </div>
      {preparing ? <p className="small muted" role="status">{english ? "Preparing image…" : "Đang chuẩn bị ảnh…"}</p> : null}
      {value.screenshot ? <p className="small muted" role="status">{input.current?.files?.[0]?.name || (english ? "Image attached" : "Đã đính kèm ảnh")}</p> : null}
      {error ? <p className="small danger-text" role="alert">{error}</p> : null}
    </div>
  </>;
}

export function RequestEvidenceDetails({ kind, item }: { kind: RequestEvidenceKind; item: RequestEvidenceView & { id: string } }) {
  return <>
    {item.scope ? <p className="small"><b>Liên quan</b> · {item.scope}</p> : null}
    {item.hasEvidence ? <a className="btn btn-sm" href={apiUrl(`/api/v1/request-evidence/${kind}/${encodeURIComponent(item.id)}`)} target="_blank" rel="noopener noreferrer">Xem ảnh minh chứng</a> : null}
  </>;
}

async function encodeScreenshot(file: File): Promise<Screenshot> {
  const mimeType = supportedTypes.find(type => type === file.type);
  if (!mimeType || file.size > 10 * 1024 * 1024) throw new Error("invalid screenshot");
  const image = await createImageBitmap(file);
  try {
    if (file.size <= requestEvidenceMaxBytes && Math.max(image.width, image.height) <= 4096) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.readAsDataURL(file);
      });
      return { mimeType, base64 };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("cannot resize screenshot");
    const maxEncodedSize = Math.floor(requestEvidenceMaxBytes / 3) * 4;
    for (const longEdge of [2000, 1500, 1100, 800]) {
      const scale = Math.min(1, longEdge / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", .85).split(",", 2)[1];
      if (base64 && base64.length <= maxEncodedSize) return { mimeType: "image/jpeg", base64 };
    }
    throw new Error("screenshot too large");
  } finally {
    image.close();
  }
}
