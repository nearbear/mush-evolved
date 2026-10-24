import PartySocket from "partysocket";
import type { LobbyLanguage } from "@mush2/shared";

// host:port of the server. Production builds are served by the same Worker as the
// server (static assets), so they connect to their own origin unless overridden.
export const PARTY_HOST: string =
  import.meta.env.VITE_PARTY_HOST ?? (import.meta.env.DEV ? "localhost:8787" : location.host);

export function matchmakerSocket(language: LobbyLanguage): PartySocket {
  return new PartySocket({ host: PARTY_HOST, party: "matchmaker", room: language });
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
