import PartySocket from "partysocket";

export const PARTY_HOST: string = import.meta.env.VITE_PARTY_HOST ?? "localhost:8787";

export function matchmakerSocket(): PartySocket {
  return new PartySocket({ host: PARTY_HOST, party: "matchmaker", room: "global" });
}

export function gameSocket(roomId: string, token: string): PartySocket {
  return new PartySocket({ host: PARTY_HOST, party: "game-room", room: roomId, query: { token } });
}

/** Seat stored per tab so a refresh rejoins the same game. */
export interface SeatTicket {
  roomId: string;
  token: string;
}

const TICKET_KEY = "mush2.seat";

export function loadTicket(): SeatTicket | null {
  const raw = sessionStorage.getItem(TICKET_KEY);
  return raw ? (JSON.parse(raw) as SeatTicket) : null;
}

export function saveTicket(ticket: SeatTicket | null): void {
  if (ticket) sessionStorage.setItem(TICKET_KEY, JSON.stringify(ticket));
  else sessionStorage.removeItem(TICKET_KEY);
}
