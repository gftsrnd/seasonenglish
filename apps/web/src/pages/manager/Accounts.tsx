import { useState, type FormEvent } from "react";
import type { ManagerAccountView, ManagerAccountsView } from "@e4s/contracts";
import { ModalProvider, useModal } from "../../app/shared/ModalProvider.js";

const roleLabel: Record<ManagerAccountView["role"], string> = {
  learner: "Người học",
  operator: "Người vận hành",
  manager: "Quản lý"
};

type ManagerAccountsProps = {
  view: ManagerAccountsView;
  currentUserId: string;
  changingAccountId?: string | undefined;
  error?: string | undefined;
  onChangeRole: (accountId: string, role: ManagerAccountView["role"]) => void;
  onCreate: (input: { displayName: string; email: string; role: ManagerAccountView["role"]; password: string }) => Promise<void>;
  onChangeStatus: (accountId: string, status: "active" | "disabled" | "deleted") => Promise<void>;
  onResetPassword: (accountId: string, password: string) => Promise<void>;
};

export function ManagerAccounts(props: ManagerAccountsProps) {
  return <ModalProvider><ManagerAccountsContent {...props} /></ModalProvider>;
}

function ManagerAccountsContent({
  view,
  currentUserId,
  changingAccountId,
  error,
  onChangeRole,
  onCreate,
  onChangeStatus,
  onResetPassword
}: ManagerAccountsProps) {
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<ManagerAccountView>();
  const modal = useModal();
  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    try {
      await onCreate({
        displayName: String(form.get("displayName") ?? ""), email: String(form.get("email") ?? ""),
        role: String(form.get("role") ?? "learner") as ManagerAccountView["role"], password: String(form.get("password") ?? "")
      });
      formElement.reset();
    } finally { setCreating(false); }
  };
  return <section className="operator-section manager-accounts" aria-label="Quản lý tài khoản và phân quyền">
    <header><div><h2>Quản lý tài khoản và phân quyền</h2><p>Thay đổi vai trò trong {view.organizationName}; mọi thay đổi đều được ghi nhận.</p></div></header>
    {error ? <p className="operator-warning">{error}</p> : null}
    <form className="manager-account-create" onSubmit={(event) => void submitAccount(event)}>
      <label>Họ tên<input name="displayName" required minLength={2} /></label>
      <label>Email<input name="email" type="email" required /></label>
      <label>Vai trò<select name="role" defaultValue="learner">{Object.entries(roleLabel).map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label>
      <label>Mật khẩu ban đầu<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
      <button className="button button--primary" disabled={creating}>{creating ? "Đang tạo…" : "Tạo tài khoản"}</button>
    </form>
    <ul className="manager-account-list">{view.accounts.map((account) => {
      const isCurrentManager = account.id === currentUserId && account.role === "manager";
      return <li key={account.id}>
        <div><strong>{account.displayName}</strong><span>{account.email ?? "Chưa có email"} · {account.status === "active" ? "Đang hoạt động" : account.status}</span></div>
        <label>Vai trò của {account.displayName}
          <select
            value={account.role}
            disabled={isCurrentManager || changingAccountId === account.id}
            onChange={(event) => onChangeRole(account.id, event.target.value as ManagerAccountView["role"])}
          >
            {Object.entries(roleLabel).map(([role, label]) => <option value={role} key={role}>{label}</option>)}
          </select>
        </label>
        {!isCurrentManager ? <div className="manager-account-actions">
          <button type="button" disabled={changingAccountId === account.id} onClick={() => void onChangeStatus(account.id, account.status === "active" ? "disabled" : "active")}>{account.status === "active" ? "Khóa" : "Mở khóa"}</button>
          <button type="button" onClick={() => setResetTarget(account)}>Đặt lại mật khẩu</button>
          <button className="button--danger" type="button" onClick={() => void modal.confirm({ title: "Xóa quyền truy cập", message: <>Xóa quyền truy cập của <b>{account.displayName}</b>? Dữ liệu học và audit vẫn được giữ để đối soát.</>, confirmLabel: "Xóa tài khoản", cancelLabel: "Hủy", tone: "danger" }).then((confirmed) => { if (confirmed) void onChangeStatus(account.id, "deleted"); })}>Xóa tài khoản</button>
        </div> : null}
        {isCurrentManager ? <small>Không thể tự hạ quyền.</small> : null}
      </li>;
    })}</ul>
    {resetTarget ? <div className="review-dialog-backdrop" role="presentation"><form className="review-dialog" onSubmit={(event) => {
      event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password") ?? "");
      void onResetPassword(resetTarget.id, password).then(() => setResetTarget(undefined));
    }}><h3>Đặt lại mật khẩu · {resetTarget.displayName}</h3><label>Mật khẩu mới<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label><div><button type="button" onClick={() => setResetTarget(undefined)}>Hủy</button><button className="button--primary" type="submit">Lưu mật khẩu</button></div></form></div> : null}
  </section>;
}
