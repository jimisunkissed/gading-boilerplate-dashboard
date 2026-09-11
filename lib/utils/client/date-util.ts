import {
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isAfter,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export const getMinuteDifference = (start?: string | number, end?: string | number): number => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return differenceInMinutes(endDate, startDate);
};

export type CalendarMonthsType = {
  name: string;
  abb: string;
  num: string;
};
export const CalendarMonths: CalendarMonthsType[] = [
  { name: 'January', abb: 'Jan', num: '01' },
  { name: 'February', abb: 'Feb', num: '02' },
  { name: 'March', abb: 'Mar', num: '03' },
  { name: 'April', abb: 'Apr', num: '04' },
  { name: 'May', abb: 'May', num: '05' },
  { name: 'June', abb: 'Jun', num: '06' },
  { name: 'July', abb: 'Jul', num: '07' },
  { name: 'August', abb: 'Aug', num: '08' },
  { name: 'September', abb: 'Sep', num: '09' },
  { name: 'October', abb: 'Oct', num: '10' },
  { name: 'November', abb: 'Nov', num: '11' },
  { name: 'December', abb: 'Dec', num: '12' },
];

type CalendarDate = {
  date: Date;
  padding: boolean;
};

export const getCalendarDates = (month: number, year: number) => {
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12');
  }
  if (year < 1900 || year > 2100) {
    throw new Error('Year must be between 1900 and 2100');
  }

  const firstDayOfMonth: Date = startOfMonth(new Date(year, month - 1));
  const lastDayOfMonth: Date = endOfMonth(firstDayOfMonth);

  const calendarStart: Date = startOfWeek(firstDayOfMonth, { weekStartsOn: 0 });
  const calendarEnd: Date = endOfWeek(lastDayOfMonth, { weekStartsOn: 0 });

  return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map(
    (date): CalendarDate => ({
      date,
      padding: !isWithinInterval(date, {
        start: firstDayOfMonth,
        end: lastDayOfMonth,
      }),
    })
  );
};

export const isDateRangeOverlap = (
  range1: { start_date: string; end_date: string | null },
  range2: { start_date: string; end_date: string | null }
): boolean => {
  const start1 = parseISO(range1.start_date);
  const end1 = range1.end_date ? parseISO(range1.end_date) : parseISO('9999-12-31');

  const start2 = parseISO(range2.start_date);
  const end2 = range2.end_date ? parseISO(range2.end_date) : parseISO('9999-12-31');

  return !isAfter(start1, end2) && !isAfter(start2, end1);
};
