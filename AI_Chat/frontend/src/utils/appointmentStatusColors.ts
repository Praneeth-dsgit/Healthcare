/**
 * Consistent color-coded status for appointments across Patient Portal,
 * General Practitioner Dashboard, and Frontdesk.
 * Four status types: scheduled, pending, completed, cancelled
 */
export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-blue-100 text-blue-800', // legacy: same as scheduled
  pending: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800', // legacy: same as cancelled
};

/** Full container/card background + border based on status */
export const APPOINTMENT_STATUS_CONTAINER: Record<string, string> = {
  scheduled: 'bg-blue-50 border-blue-200',
  confirmed: 'bg-blue-50 border-blue-200',
  pending: 'bg-amber-50 border-amber-200',
  completed: 'bg-green-50 border-green-200',
  cancelled: 'bg-red-50 border-red-200',
  no_show: 'bg-red-50 border-red-200',
};

export function getAppointmentStatusColor(status: string): string {
  return APPOINTMENT_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
}

export function getAppointmentStatusContainer(status: string): string {
  return APPOINTMENT_STATUS_CONTAINER[status] ?? 'bg-gray-50 border-gray-200';
}
