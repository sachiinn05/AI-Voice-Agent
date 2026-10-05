import { useEffect, useState } from "react";
import type { Booking } from "../lib/types";

export default function Bookings() {
  const [rows, setRows] = useState<Booking[]>([]);

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">Booked meetings</h2>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && <p className="text-xs text-muted">No bookings yet.</p>}
        {rows.map((b, i) => {
          const when = [b.meeting?.date, b.meeting?.time].filter(Boolean);
          const slot = when[0] === when[1] ? when[0] : when.join(" ");
          return (
            <div key={i} className="rounded-lg border border-line px-3 py-2 text-xs">
              <strong className="block text-ink">
                {b.contactName} · {b.companyName}
              </strong>
              <span className="text-muted">{slot || ""}</span>
              {b.meeting?.booking?.via === "cal.com" ? (
                <span className="mt-1 block text-brand">
                  ✓ On the calendar{b.meeting.booking.emailedTo ? ` · invite + reminder sent to ${b.meeting.booking.emailedTo}` : ""}
                </span>
              ) : (
                <span className="mt-1 block text-muted/70">Logged only{b.meeting?.booking?.note ? ` — ${b.meeting.booking.note}` : ""}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
