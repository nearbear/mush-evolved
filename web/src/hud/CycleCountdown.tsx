import { useTranslation } from "react-i18next";
import { useCountdown } from "./useCountdown.ts";

/** Time left in the cycle as h:mm:ss, ticking each second, with fixed-width digit cells so Pixel Square doesn't jitter. */
export function CycleCountdown({ nextCycleAt }: { nextCycleAt: number }) {
  const { t } = useTranslation();
  const time = useCountdown(nextCycleAt);
  return (
    <span className="cycle-countdown" role="img" aria-label={t("stat.nextCycle", { time })}>
      {Array.from(time, (ch, i) =>
        ch === ":" ? (
          <span key={i} aria-hidden="true">
            :
          </span>
        ) : (
          <span key={i} className="clock-digit" aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
