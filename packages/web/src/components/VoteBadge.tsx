import { THERMAL_VOTE_LABELS, type ThermalVote } from "@hitl/shared";
import { Icon, type IconName } from "./Icon";

export const VOTE_STYLE: Record<ThermalVote, { cls: string; icon: IconName }> = {
  too_cold: { cls: "badge-cold", icon: "cloud-snow" },
  perfect: { cls: "badge-ok", icon: "smile" },
  too_hot: { cls: "badge-danger", icon: "sun" },
};

export function VoteBadge({ vote, count }: { vote: ThermalVote; count?: number }) {
  const s = VOTE_STYLE[vote];
  return (
    <span className={`badge ${s.cls}`}>
      <Icon name={s.icon} size={12} />
      {count !== undefined ? `${count} ${THERMAL_VOTE_LABELS[vote].toLowerCase()}` : THERMAL_VOTE_LABELS[vote]}
    </span>
  );
}
