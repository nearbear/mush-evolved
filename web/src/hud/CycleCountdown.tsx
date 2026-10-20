import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** Time left in the cycle as h:mm:ss, ticking each second. */
export function CycleCountdown({ nextCycleAt, clockOffset }: { nextCycleAt: number; clockOffset: number }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((nextCycleAt - (now + clockOffset)) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${Math.floor(left / 3600)}:${pad(Math.floor(left / 60) % 60)}:${pad(left % 60)}`;
  return (
    <>
      {" · "}
      <span className="cycle-countdown" role="img" aria-label={t("stat.nextCycle", { time })}>
        {time}
      </span>
    </>
  );
}
