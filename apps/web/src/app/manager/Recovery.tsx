import { OperationalCards, type TrashedAccount } from "./shared.js";

export type ManagerRecoveryProps = {
  trashedAccounts: readonly TrashedAccount[];
  onRestore?: (accountId: string) => void;
  onPurge?: (accountId: string) => void;
  error?: string;
  loading?: boolean;
  busy?: boolean;
};

export function ManagerRecovery({ trashedAccounts, onRestore, onPurge, error, loading, busy }: ManagerRecoveryProps) {
  const onOpenOperationalItem = onRestore
    ? (kind: "pin" | "delete" | "trash", id: string) => {
      if (kind === "trash") void onRestore(id);
    }
    : undefined;

  return <div className="manager-recovery-inline">
    <OperationalCards
      trashedAccounts={trashedAccounts}
      {...(onOpenOperationalItem ? { onOpenOperationalItem } : {})}
      {...(onPurge ? { onPurgeOperationalItem: onPurge } : {})}
      {...(error ? { error } : {})}
      {...(loading ? { loading } : {})}
      {...(busy ? { busy } : {})}
    />
    {!loading && !trashedAccounts.length ? <div className="manager-recovery-empty"><b>Thùng rác trống</b><p className="small muted">Hiện không có tài khoản nào cần khôi phục.</p></div> : null}
  </div>;
}
