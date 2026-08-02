// Shared between AlertsService (publisher) and AlertsGateway (subscriber) so
// the channel name and the permission gate can't drift apart between the two.
export const LOW_STOCK_CHANNEL = 'inventory:low_stock_alerts';
export const ALERTS_REQUIRED_PERMISSION = 'stock:view';
