// Kafka topics (domain events).
export const TOPICS = {
  channelReservations: 'channel.reservations',
  reservations: 'reservations',
  payments: 'payments',
  calendar: 'calendar',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

// RabbitMQ topic exchange for jobs.
export const EXCHANGES = {
  ops: 'ops',
} as const;

export type Exchange = (typeof EXCHANGES)[keyof typeof EXCHANGES];

// Routing keys a publisher sends with.
export const ROUTING_KEYS = {
  guestMessageWelcome: 'guest.message.welcome',
  guestMessageCheckInReminder: 'guest.message.check-in-reminder',
  housekeepingTaskCleaning: 'housekeeping.task.cleaning',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

// Binding patterns a consumer's queue binds with (* matches exactly one word).
export const ROUTING_PATTERNS = {
  guestMessages: 'guest.message.*',
  housekeepingTasks: 'housekeeping.task.*',
} as const;

export type RoutingPattern = (typeof ROUTING_PATTERNS)[keyof typeof ROUTING_PATTERNS];

// Service names carried in the envelope's `producer` field.
export const SERVICES = {
  gateway: 'gateway',
  propertySvc: 'property-svc',
  reservationSvc: 'reservation-svc',
  paymentSvc: 'payment-svc',
  analyticsSvc: 'analytics-svc',
  channelSvc: 'channel-svc',
  channelSimulator: 'channel-simulator',
  opsDispatcher: 'ops-dispatcher',
  messagingWorker: 'messaging-worker',
  housekeepingSvc: 'housekeeping-svc',
  scratch: 'scratch',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];

// Event type names carried in the envelope's `type` field.
export const EVENT_TYPES = {
  channelReservationReceived: 'channel.reservation.received',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
