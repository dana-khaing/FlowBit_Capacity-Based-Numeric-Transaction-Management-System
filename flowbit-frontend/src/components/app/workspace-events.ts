"use client";

export const TICKETS_UPDATED_EVENT = "flowbit:tickets-updated";

export function notifyTicketsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TICKETS_UPDATED_EVENT));
  }
}
