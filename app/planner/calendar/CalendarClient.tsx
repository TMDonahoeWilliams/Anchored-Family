"use client";

import React, { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateSelectArg, EventInput } from "@fullcalendar/core";

/**
 * Simple FullCalendar client component.
 * - initialEvents: optional initial EventInput[] passed from the server component
 * - selectable/select handler for quick-add events (example)
 *
 * Optional: import FullCalendar CSS in a global CSS file or here if using module styles:
 * import "@fullcalendar/daygrid/main.css";
 * import "@fullcalendar/timegrid/main.css";
 */

export default function CalendarClient({
  initialEvents = [],
}: {
  initialEvents?: EventInput[];
}) {
  const [events, setEvents] = useState<EventInput[]>(initialEvents);

  const handleSelect = (selInfo: DateSelectArg) => {
    const title = prompt("New event title?");
    if (!title) return;
    const newEvent: EventInput = {
      id: String(Date.now()),
      title,
      start: selInfo.startStr,
      end: selInfo.endStr,
      allDay: selInfo.allDay,
    };
    setEvents((prev) => [...prev, newEvent]);
  };

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      selectable={true}
      select={handleSelect}
      events={events}
    />
  );
}
