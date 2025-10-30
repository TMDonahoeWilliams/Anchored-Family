'use client';

import React, { forwardRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import type FullCalendarClass from '@fullcalendar/react';

type FullCalendarProps = React.ComponentProps<typeof FullCalendar>;

const FullCalendarClient = forwardRef<FullCalendarClass, FullCalendarProps>(function FullCalendarClient(
  props,
  ref
) {
  return <FullCalendar ref={ref} {...props} />;
});

export default FullCalendarClient;