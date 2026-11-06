// Transient messages (rate limits, rejected actions). The viewport is portaled and fixed-positioned,
// so showing one never shifts the layout.

import { Toast } from "@base-ui/react/toast";

const toastManager = Toast.createToastManager();

/** Latest wins: a repeated message replaces the one on screen instead of stacking. */
let lastId: string | undefined;
function show(message: string, type: "error" | "warning" | "success"): void {
  if (lastId) toastManager.close(lastId);
  lastId = toastManager.add({ description: message, type, timeout: 4000 });
}
export const showError = (message: string): void => show(message, "error");
export const showSuccess = (message: string): void => show(message, "success");
export const showWarning = (message: string): void => show(message, "warning");

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className="toast" data-type={toast.type}>
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
