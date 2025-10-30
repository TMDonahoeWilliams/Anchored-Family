"use client";

import dynamic from 'next/dynamic';
// import FullCalendarClient from '@/components/FullCalendarClient'; // Removed, use dynamic import below

// ...your code...
import React, { useState, useEffect, useRef } from 'react';

/** FullCalendar must be dynamically imported to avoid SSR issues in Next.js */
const FullCalendar = dynamic(() => import('@/components/FullCalendarClient/page'), { ssr: false });
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import multiMonthPlugin from "@fullcalendar/multimonth";
import FullCalendarClient from '@/components/FullCalendarClient/page';

export default function CalendarPage() {
  const calendarRef = useRef<any>(null);
calendarRef.current?.getApi().changeView('timeGridWeek');

  // Toolbar state
  const [syncStatus, setSyncStatus] = useState("");
  const [view, setView] = useState<"timeGridDay" | "timeGridWeek" | "dayGridMonth" | "multiMonthYear">("dayGridMonth");

  // Manual add
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [calendarId, setCalendarId] = useState("");

  // OCR
  const [file, setFile] = useState<File | null>(null);

  // Example: load events from your API (hook up to your Supabase later if desired)
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      // Replace this with your real loader if you have /api/events
      setEvents([]);
    })();
  }, []);

  function changeView(nextView: typeof view) {
    setView(nextView);
    const api = calendarRef.current?.getApi();
    if (api) api.changeView(nextView);
  }

  async function syncCurrentMonth() {
    setSyncStatus("Syncing…");
    const now = new Date();
    const startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endISO = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const r = await fetch("/api/calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: startISO, timeMax: endISO })
    });
    const j = await r.json();
    setSyncStatus(r.ok ? `Imported ${j.imported || 0} events` : `Error: ${j.error || "Failed"}`);
  }

  async function addManual() {
    if (!title || !start || !end || !calendarId) {
      alert("Please fill Title, Start, End, and Calendar ID.");
      return;
    }
    const r = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // In production, read user from the server session
        user_id: "demo-user",
        calendar_id: calendarId,
        title,
        start_at: start,
        end_at: end
      })
    });
    const j = await r.json();
    if (r.ok) {
      setTitle(""); setStart(""); setEnd("");
      alert("Event added.");
      // Optionally, refresh events here and update `events` state
    } else {
      alert(j.error || "Failed to add event");
    }
  }

  async function submitOCR() {
    if (!file || !calendarId) {
      alert("Pick a photo and provide a Calendar ID.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("user_id", "demo-user");
    fd.append("calendar_id", calendarId);
    fd.append("year", String(new Date().getFullYear()));

    const r = await fetch("/api/calendar/ocr", { method: "POST", body: fd });
    const j = await r.json();
    if (r.ok) {
      alert(`Created ${j.created || 0} events from photo`);
      // Optionally, refresh events here and update `events` state
    } else {
      alert(j.error || "OCR import failed");
    }
  }

  return (
    <div className="container">
      {/* Toolbar */}
      <section className="card section">
        <h2 className="section-title">Family Calendar</h2>

        {/* Buttons row (smaller buttons) */}
        <div className="subcategories" style={{ marginBottom: 8 }}>
          <button className="btn btn--sm accent-blue" onClick={syncCurrentMonth}>🔄 Import Calendar</button>

          {/* Manual add toggleable inputs (kept compact) */}
          <input className="btn btn--sm" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
          <input className="btn btn--sm" placeholder="Start (YYYY-MM-DDTHH:mmZ)" value={start} onChange={e=>setStart(e.target.value)} />
          <input className="btn btn--sm" placeholder="End (YYYY-MM-DDTHH:mmZ)" value={end} onChange={e=>setEnd(e.target.value)} />
          <input className="btn btn--sm" placeholder="Calendar ID" value={calendarId} onChange={e=>setCalendarId(e.target.value)} />
          <button className="btn btn--sm accent-green" onClick={addManual}>➕ Add Manually</button>

          {/* OCR photo */}
          <input type="file" accept="image/*" className="btn btn--sm" onChange={e=>setFile(e.target.files?.[0] || null)} />
          <button className="btn btn--sm accent-amber" onClick={submitOCR}>📷 Take/Upload Photo</button>
        </div>

        {/* View dropdown + month navigation controls */}
        <div className="subcategories" style={{ marginTop: 8 }}>
          <select
            className="btn btn--sm"
            value={view}
            onChange={(e) => changeView(e.target.value as any)}
            aria-label="Calendar view"
          >
            <option value="timeGridDay">Daily view</option>
            <option value="timeGridWeek">Weekly view</option>
            <option value="dayGridMonth">Monthly view</option>
            <option value="multiMonthYear">Year view</option>
          </select>

          <button
            className="btn btn--sm"
            onClick={() => calendarRef.current?.getApi().prev()}
          >
            ◀ Prev
          </button>
          <button
            className="btn btn--sm"
            onClick={() => calendarRef.current?.getApi().today()}
          >
            • Today
          </button>
          <button
            className="btn btn--sm"
            onClick={() => calendarRef.current?.getApi().next()}
          >
            Next ▶
          </button>

          <span className="subtitle" style={{ alignSelf: "center" }}>{syncStatus}</span>
        </div>
      </section>

      {/* Calendar as the main view */}
      <section className="card section" style={{ overflow: "hidden" }}>
        <FullCalendarClient
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]}
          initialView={view}
          headerToolbar={false}
          height="auto"
          selectable={true}
          selectMirror={true}
          dayMaxEventRows={true}
          events={events}
          // optional: create events by selecting on the calendar
          select={(selInfo: import('@fullcalendar/core').DateSelectArg) => {
            // Example quick-add on select; keep or remove:
            const t = prompt("New event title?");
            if (!t) return;
            setEvents(prev => [
              ...prev,
              { title: t, start: selInfo.startStr, end: selInfo.endStr }
            ]);
            // You can also POST to /api/calendar/events here to persist
          }}
          // Style tweaks so it feels spacious inside your .card
          contentHeight="auto"
          expandRows
        />
      </section>
    </div>
  );
}