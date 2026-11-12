import type { RoomView } from "@pbg/protocol";

const PALETTE = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
  "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080", "#9a6324",
];

export function seatColor(view: RoomView, seatId: string): string {
  const index = view.seats.findIndex((s) => s.seatId === seatId);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length]!;
}
