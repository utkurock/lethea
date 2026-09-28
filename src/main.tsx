import './polyfills';

// Load the app only after globals exist; static imports would be hoisted above the polyfill.
void import('./bootstrap');
