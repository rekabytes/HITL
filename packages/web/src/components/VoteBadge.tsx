import { THERMAL_VOTE_LABELS, type ThermalVote } from "@hitl/shared";

const CLASS: Record<ThermalVote, string> = { too_cold: "badge-cold", perfect: "badge-ok", too_hot: "badge-danger" };

export function VoteBadge({ vote }: { vote: ThermalVote }) {
  return <span className={`badge ${CLASS[vote]}`}>{THERMAL_VOTE_LABELS[vote]}</span>;
}
