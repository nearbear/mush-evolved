import { useEffect, useState } from "react";

/** Time left until `at` (server ms) as h:mm:ss, ticking each second. `clockOffset` is the server's clock minus ours. */
export function useCountdown(at: number, clockOffset: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((at - (now + clockOffset)) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(left / 3600)}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`;
}
