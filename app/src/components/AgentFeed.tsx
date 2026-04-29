import React from 'react';
import { AgentEvent } from '../App';

interface Props {
  events: AgentEvent[];
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export function AgentFeed({ events }: Props) {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="agent-feed">
      <div className="agent-feed__header">
        <div className="loading__spinner" style={{ borderTopColor: 'var(--accent)', width: 10, height: 10, borderWidth: 1.5 }} />
        Agent ODAR loop · {events.length} events
      </div>

      {sorted.length === 0 && (
        <div className="empty">
          <div className="empty__icon">⬡</div>
          <p>Agent starting up...</p>
        </div>
      )}

      {sorted.map((event) => (
        <div key={event.id} className="agent-event">
          <div className="agent-event__ts">{formatTs(event.timestamp)}</div>
          <div className={`agent-event__type agent-event__type--${event.type}`}>
            {event.type}
          </div>
          <div className="agent-event__message">{event.message}</div>
        </div>
      ))}
    </div>
  );
}

