import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  countdownSeconds?: number;
}

export interface PromptOptions {
  title: string;
  label: string;
  message?: ReactNode;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: "text" | "password" | "number";
  tone?: "primary" | "danger";
}

interface ModalApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  prompt(options: PromptOptions): Promise<string | null>;
}

type ModalState =
  | ({ id: number; kind: "confirm"; phase: "confirm" | "countdown"; remaining: number; resolve: (value: boolean) => void } & ConfirmOptions)
  | ({ id: number; kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

const ModalContext = createContext<ModalApi | undefined>(undefined);

export function useModal(): ModalApi {
  const value = useContext(ModalContext);
  if (!value) throw new Error("useModal must be used inside ModalProvider");
  return value;
}

/**
 * Gives app-owned dialogs the same shared-device guarantees as the
 * promise modal: scroll lock, Escape, a local Tab loop, initial focus and
 * return focus. It is intentionally separate so feature previews that do not
 * need the promise API can still use the canonical dialog behaviour.
 */
export function useDialog(open: boolean, dialogRef: RefObject<HTMLElement | null>, onClose: () => void, initialFocusRef?: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    returnFocus.current = previouslyFocused;
    const bodyAlreadyLocked = document.body.classList.contains("app-modal-open");
    document.body.classList.add("app-modal-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [contenteditable='true'], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (!bodyAlreadyLocked) document.body.classList.remove("app-modal-open");
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
    };
  }, [dialogRef, open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (!returnFocus.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const initialFocus = initialFocusRef?.current
      ?? dialog.querySelector<HTMLElement>("[data-modal-initial-focus]")
      ?? dialog.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)");
    (initialFocus ?? dialog).focus();
  }, [dialogRef, initialFocusRef, open]);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const inheritedModal = useContext(ModalContext);
  return inheritedModal ? <>{children}</> : <ModalRoot>{children}</ModalRoot>;
}

function ModalRoot({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | undefined>(undefined);
  const [promptValue, setPromptValue] = useState("");
  const activeModal = useRef<ModalState | undefined>(undefined);
  const returnFocus = useRef<HTMLElement | null>(null);
  const modalSequence = useRef(0);
  const dialogRef = useRef<HTMLFormElement>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();

  const settle = useCallback((current: ModalState, value: boolean | string | null) => {
    if (activeModal.current !== current) return;
    activeModal.current = undefined;
    setModal((visible) => visible === current ? undefined : visible);
    if (current.kind === "confirm") current.resolve(value as boolean);
    else current.resolve(value as string | null);
  }, []);

  const replace = useCallback((next: ModalState) => {
    const previous = activeModal.current;
    if (!previous && !returnFocus.current) {
      const focused = document.activeElement;
      returnFocus.current = focused instanceof HTMLElement ? focused : null;
    }
    activeModal.current = next;
    setModal(next);
    if (!previous) return;
    if (previous.kind === "confirm") previous.resolve(false);
    else previous.resolve(null);
  }, []);

  const cancel = useCallback(() => {
    const current = activeModal.current;
    if (current) settle(current, current.kind === "confirm" ? false : null);
  }, [settle]);

  const modalOpen = Boolean(modal);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const previouslyFocused = returnFocus.current;
    const bodyAlreadyLocked = document.body.classList.contains("app-modal-open");
    document.body.classList.add("app-modal-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [contenteditable='true'], [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (!bodyAlreadyLocked) document.body.classList.remove("app-modal-open");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      returnFocus.current = null;
    };
  }, [cancel, modalOpen]);

  useLayoutEffect(() => {
    if (!modal) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const initialFocus = dialog.querySelector<HTMLElement>("[data-modal-initial-focus]")
      ?? dialog.querySelector<HTMLElement>("[data-action='modal-cancel']")
      ?? dialog.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)");
    (initialFocus ?? dialog).focus();
    return undefined;
  }, [modal?.id]);

  useEffect(() => {
    if (!modal || modal.kind !== "confirm" || modal.phase !== "countdown") return undefined;
    if (modal.remaining <= 0) {
      settle(modal, true);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (activeModal.current !== modal) return;
      const next = { ...modal, remaining: modal.remaining - 1 };
      activeModal.current = next;
      setModal(next);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [modal, settle]);

  useEffect(() => () => {
    const current = activeModal.current;
    activeModal.current = undefined;
    if (!current) return;
    if (current.kind === "confirm") current.resolve(false);
    else current.resolve(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    replace({ id: ++modalSequence.current, kind: "confirm", phase: "confirm", remaining: options.countdownSeconds ?? (options.tone === "danger" ? 5 : 0), ...options, resolve });
  }), [replace]);
  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    setPromptValue(options.initialValue ?? "");
    replace({ id: ++modalSequence.current, kind: "prompt", ...options, resolve });
  }), [replace]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const current = activeModal.current;
    if (!current) return;
    if (current.kind === "prompt") {
      settle(current, promptValue);
      return;
    }
    if (current.remaining > 0 && current.phase === "confirm") {
      const next = { ...current, phase: "countdown" as const };
      activeModal.current = next;
      setModal(next);
      return;
    }
    settle(current, true);
  };

  const countdown = modal?.kind === "confirm" && modal.phase === "countdown";
  const confirmLabel = modal?.kind === "confirm" ? modal.confirmLabel ?? "Xác nhận" : "";
  const dialogLabel = countdown ? `${confirmLabel} sau ${modal.remaining} giây…` : modal?.title;
  const hasDescription = Boolean(modal && (countdown || modal.message));

  return <ModalContext.Provider value={{ confirm, prompt }}>
    {children}
    <div id="modal" className={modal ? "modal-backdrop" : undefined} role={modal ? "presentation" : undefined} onClick={(event) => { if (event.target === event.currentTarget) cancel(); }}>{modal ?
      <form ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} aria-describedby={hasDescription ? dialogDescriptionId : undefined} aria-busy={countdown ? "true" : undefined} tabIndex={-1} onSubmit={submit}>
        <button className="app-modal-close" data-action="modal-close" type="button" aria-label="Đóng hộp thoại" title="Đóng" onClick={cancel}>×</button>
        {countdown ? <>
          <h3 id={dialogTitleId}>{dialogLabel}</h3>
          <p id={dialogDescriptionId} className="small">Thao tác này không hoàn tác được. Bấm <b>Dừng lại</b> nếu bạn đổi ý.</p>
          <div className="countdown" aria-live="assertive">{modal.remaining}</div>
          <div className="row" style={{ justifyContent: "center" }}><button data-action="modal-cancel" type="button" onClick={cancel}>Dừng lại</button></div>
        </> : <>
          <h3 id={dialogTitleId}>{modal.title}</h3>
          {modal.message ? <div id={dialogDescriptionId} className="small">{modal.message}</div> : null}
          {modal.kind === "prompt" ? <label className="field"><span>{modal.label}</span><input data-modal-initial-focus aria-label={modal.label} type={modal.inputType ?? "text"} placeholder={modal.placeholder ?? ""} value={promptValue} onChange={(event) => setPromptValue(event.target.value)} /></label> : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button data-action="modal-cancel" type="button" onClick={cancel}>{modal.cancelLabel ?? "Huỷ"}</button>
            <button className={modal.tone === "danger" ? "btn-danger" : "btn-primary"} type="submit">{modal.kind === "confirm" ? confirmLabel : modal.confirmLabel ?? "Xác nhận"}</button>
          </div>
        </>}
      </form>
    : null}</div>
  </ModalContext.Provider>;
}
