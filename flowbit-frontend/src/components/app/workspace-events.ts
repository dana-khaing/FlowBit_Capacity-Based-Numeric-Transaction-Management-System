"use client";

export const TICKETS_UPDATED_EVENT = "flowbit:tickets-updated";
export const PERIODS_UPDATED_EVENT = "flowbit:periods-updated";
export const DASHBOARD_UPDATED_EVENT = "flowbit:dashboard-updated";
export const REPEAT_TICKETS_UPDATED_EVENT = "flowbit:repeat-tickets-updated";

const WORKSPACE_SYNC_CHANNEL = "flowbit-workspace-sync";

let workspaceChannel: BroadcastChannel | null = null;
let workspaceListenerCount = 0;

function dispatchWorkspaceEvent(eventName: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(eventName));
  }
}

function broadcastWorkspaceEvents(eventNames: string[]) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }

  if (!workspaceChannel) {
    workspaceChannel = new BroadcastChannel(WORKSPACE_SYNC_CHANNEL);
  }

  workspaceChannel.postMessage({ events: eventNames });
}

export function notifyTicketsUpdated() {
  const events = [TICKETS_UPDATED_EVENT, DASHBOARD_UPDATED_EVENT];
  events.forEach(dispatchWorkspaceEvent);
  broadcastWorkspaceEvents(events);
}

export function notifyPeriodsUpdated() {
  const events = [PERIODS_UPDATED_EVENT, DASHBOARD_UPDATED_EVENT];
  events.forEach(dispatchWorkspaceEvent);
  broadcastWorkspaceEvents(events);
}

export function notifyDashboardUpdated() {
  dispatchWorkspaceEvent(DASHBOARD_UPDATED_EVENT);
  broadcastWorkspaceEvents([DASHBOARD_UPDATED_EVENT]);
}

export function notifyRepeatTicketsUpdated() {
  const events = [REPEAT_TICKETS_UPDATED_EVENT];
  events.forEach(dispatchWorkspaceEvent);
  broadcastWorkspaceEvents(events);
}

export function startWorkspaceLiveSync() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  workspaceListenerCount += 1;

  if (!workspaceChannel) {
    workspaceChannel = new BroadcastChannel(WORKSPACE_SYNC_CHANNEL);
    workspaceChannel.onmessage = (event: MessageEvent<{ events?: string[] }>) => {
      const eventNames = event.data?.events ?? [];
      eventNames.forEach((eventName) => dispatchWorkspaceEvent(eventName));
    };
  }

  return () => {
    workspaceListenerCount = Math.max(0, workspaceListenerCount - 1);
    if (workspaceListenerCount === 0 && workspaceChannel) {
      workspaceChannel.close();
      workspaceChannel = null;
    }
  };
}
