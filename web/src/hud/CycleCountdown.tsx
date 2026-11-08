import { useTranslation } from "react-i18next";
import { useCountdown } from "./useCountdown.ts";

/** Time left in the cycle as h:mm:ss, ticking each second. */
export function CycleCountdown({ nextCycleAt, clockOffset }: { nextCycleAt: number; clockOffset: number }) {
  const { t } = useTranslation();
  const time = useCountdown(nextCycleAt, clockOffset);
  return (
    <>
      {" · "}
      <span className="cycle-countdown" role="img" aria-label={t("stat.nextCycle", { time })}>
        {time}
      </span>
    </>
  );
}
