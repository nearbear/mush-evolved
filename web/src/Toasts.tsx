// Transient messages (rate limits, rejected actions). The viewport is portaled and fixed-positioned,
// so showing one never shifts the layout.

import { Toast } from "@base-ui/react/toast";

const toastManager = Toast.createToastManager();

/** Latest wins: a repeated message replaces the one on screen instead of stacking. */
let lastId: string | undefined;
export function showError(message: string): void {
  if (lastId) toastManager.close(lastId);
  lastId = toastManager.add({ description: message, type: "error", timeout: 4000 });
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className="toast">
      <Toast.Description className="toast-text" />
    </Toast.Root>
  ));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={1}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="toast-viewport">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
