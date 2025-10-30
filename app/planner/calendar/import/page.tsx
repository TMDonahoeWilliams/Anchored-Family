'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

type ImportSource = 'google' | 'outlook' | 'apple' | 'ical' | 'csv' | null;

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
}

export default function CalendarImportPage() {
  const [selectedSource, setSelectedSource] = useState<ImportSource>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Google Calendar OAuth
  const handleGoogleImport = async () => {
    setLoading(true);
    setStatus('Connecting to Google Calendar...');
    
    try {
      // This would typically involve OAuth flow
      const response = await fetch('/api/calendar/import/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setEvents(result.events || []);
        setStatus(`Successfully imported ${result.events?.length || 0} events from Google Calendar`);
      } else {
        setStatus(`Error: ${result.error || 'Failed to import from Google Calendar'}`);
      }
    } catch (error) {
      setStatus('Error connecting to Google Calendar');
      console.error('Google import error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle Outlook Calendar import
  const handleOutlookImport = async () => {
    setLoading(true);
    setStatus('Connecting to Outlook Calendar...');
    
    try {
      const response = await fetch('/api/calendar/import/outlook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setEvents(result.events || []);
        setStatus(`Successfully imported ${result.events?.length || 0} events from Outlook Calendar`);
      } else {
        setStatus(`Error: ${result.error || 'Failed to import from Outlook Calendar'}`);
      }
    } catch (error) {
      setStatus('Error connecting to Outlook Calendar');
      console.error('Outlook import error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle file upload (iCal, CSV)
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus('Processing file...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', selectedSource || 'ical');

    try {
      const response = await fetch('/api/calendar/import/file', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setEvents(result.events || []);
        setStatus(`Successfully imported ${result.events?.length || 0} events from ${file.name}`);
      } else {
        setStatus(`Error: ${result.error || 'Failed to process file'}`);
      }
    } catch (error) {
      setStatus('Error processing file');
      console.error('File import error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle manual URL input for calendar subscriptions
  const handleUrlImport = async () => {
    const url = prompt('Enter calendar URL (iCal/webcal):');
    if (!url) return;

    setLoading(true);
    setStatus('Importing from URL...');

    try {
      const response = await fetch('/api/calendar/import/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (response.ok) {
        setEvents(result.events || []);
        setStatus(`Successfully imported ${result.events?.length || 0} events from calendar URL`);
      } else {
        setStatus(`Error: ${result.error || 'Failed to import from URL'}`);
      }
    } catch (error) {
      setStatus('Error importing from URL');
      console.error('URL import error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Save imported events to the family calendar
  const saveEvents = async () => {
    if (events.length === 0) {
      alert('No events to save');
      return;
    }

    setLoading(true);
    setStatus('Saving events to family calendar...');

    try {
      const response = await fetch('/api/calendar/events/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events,
          user_id: 'demo-user', // Replace with actual user ID
          calendar_id: 'family-calendar',
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setStatus(`Successfully saved ${result.saved || 0} events to family calendar`);
        setEvents([]);
      } else {
        setStatus(`Error: ${result.error || 'Failed to save events'}`);
      }
    } catch (error) {
      setStatus('Error saving events');
      console.error('Save error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">Import Calendar</h1>
        <Link href="/planner/calendar" className="btn accent-blue">
          ← Back to Calendar
        </Link>
      </div>

      {/* Import Sources */}
      <section className="card section">
        <h2 className="section-title">Choose Import Source</h2>
        
        <div className="categories">
          {/* Google Calendar */}
          <div className="category-card">
            <div style={{ width: '100%' }}>
              <div className="section-title" style={{ marginBottom: '.5rem' }}>
                📅 Google Calendar
              </div>
              <div className="subtitle" style={{ marginBottom: '.5rem' }}>
                Import events from your Google Calendar account
              </div>
              <button
                onClick={handleGoogleImport}
                disabled={loading}
                className="btn accent-blue"
              >
                {loading && selectedSource === 'google' ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
            </div>
          </div>

          {/* Outlook Calendar */}
          <div className="category-card">
            <div style={{ width: '100%' }}>
              <div className="section-title" style={{ marginBottom: '.5rem' }}>
                📧 Outlook Calendar
              </div>
              <div className="subtitle" style={{ marginBottom: '.5rem' }}>
                Import events from your Microsoft Outlook calendar
              </div>
              <button
                onClick={handleOutlookImport}
                disabled={loading}
                className="btn accent-violet"
              >
                {loading && selectedSource === 'outlook' ? 'Connecting...' : 'Connect Outlook Calendar'}
              </button>
            </div>
          </div>

          {/* Apple Calendar */}
          <div className="category-card">
            <div style={{ width: '100%' }}>
              <div className="section-title" style={{ marginBottom: '.5rem' }}>
                🍎 Apple Calendar
              </div>
              <div className="subtitle" style={{ marginBottom: '.5rem' }}>
                Import from Apple Calendar using iCal export
              </div>
              <button
                onClick={() => setSelectedSource('apple')}
                className="btn accent-amber"
              >
                Export from Apple Calendar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* File Upload */}
      <section className="card section">
        <h2 className="section-title">Upload Calendar File</h2>
        
        <div className="subcategories">
          <button
            onClick={() => {
              setSelectedSource('ical');
              fileInputRef.current?.click();
            }}
            className="btn accent-green"
          >
            📄 Upload iCal File (.ics)
          </button>
          
          <button
            onClick={() => {
              setSelectedSource('csv');
              fileInputRef.current?.click();
            }}
            className="btn accent-cyan"
          >
            📊 Upload CSV File
          </button>
          
          <button
            onClick={handleUrlImport}
            disabled={loading}
            className="btn accent-magenta"
          >
            🔗 Import from URL
          </button>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".ics,.csv"
          style={{ display: 'none' }}
        />
      </section>

      {/* Instructions */}
      {selectedSource === 'apple' && (
        <section className="card section">
          <h3 className="section-title">Apple Calendar Export Instructions</h3>
          <div className="subtitle">
            <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
              <li>Open Apple Calendar on your Mac</li>
              <li>Select the calendar you want to export</li>
              <li>Go to File → Export → Export...</li>
              <li>Save the .ics file to your computer</li>
              <li>Click "Upload iCal File" above and select the exported file</li>
            </ol>
          </div>
        </section>
      )}

      {/* Status */}
      {status && (
        <section className="card section">
          <div className={`p-4 rounded ${
            status.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {status}
          </div>
        </section>
      )}

      {/* Preview Events */}
      {events.length > 0 && (
        <section className="card section">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Preview Events ({events.length})</h3>
            <button
              onClick={saveEvents}
              disabled={loading}
              className="btn accent-green"
            >
              {loading ? 'Saving...' : `Save ${events.length} Events`}
            </button>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.slice(0, 10).map((event, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded border">
                <div className="font-medium">{event.title}</div>
                <div className="text-sm text-gray-600">
                  {new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}
                </div>
                {event.location && (
                  <div className="text-sm text-gray-500">📍 {event.location}</div>
                )}
                {event.description && (
                  <div className="text-sm text-gray-500 mt-1">{event.description}</div>
                )}
              </div>
            ))}
            {events.length > 10 && (
              <div className="text-center text-gray-500 py-2">
                ... and {events.length - 10} more events
              </div>
            )}
          </div>
        </section>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span>Processing...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}