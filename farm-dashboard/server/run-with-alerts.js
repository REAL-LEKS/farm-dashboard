/**
 * Compatibility launcher for the new nested payload flow.
 *
 * This boots the notification backend and the MQTT simulator together so the
 * alert pipeline can be exercised with the new payload shape.
 */

console.log('\nLaunching backend notifier and simulator with the nested payload model...\n');

await import('./index.js');
await import('./simulator.js');
