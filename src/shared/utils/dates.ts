import { format } from 'date-fns';

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');
