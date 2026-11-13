import { useTranslation } from "react-i18next";
import { useCountdown } from "./useCountdown.ts";

/** Time left in the cycle as h:mm:ss, ticking each second, in tabular figures so it doesn't jitter. `dot` puts " · " before it, for running text (the phone's line under the name). */
export function CycleCountdown({ nextCycleAt, dot = false }: { nextCycleAt: number; dot?: boolean }) {
  const { t } = useTranslation();
  const time = useCountdown(nextCycleAt);
  return (
    <>
      {dot && " · "}
      <span className="cycle-countdown" role="img" aria-label={t("stat.nextCycle", { time })}>
        {time}
      </span>
    </>
  );
}
