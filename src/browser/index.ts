/**
 * Standalone desktop app entry point
 * Bundles R2 client for browser use without backend server
 */

import * as R2 from './r2-client';

// Expose R2 client to global scope for use in app.js
(window as any).R2Client = R2;

// Auto-initialize from localStorage config if available
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cfg = JSON.parse(localStorage.getItem('r2cfg') || '{}');
        if (cfg.r2Endpoint && cfg.r2AccessKey && cfg.r2SecretKey && cfg.r2Bucket) {
            R2.initR2Client({
                endpoint: cfg.r2Endpoint,
                accessKeyId: cfg.r2AccessKey,
                secretAccessKey: cfg.r2SecretKey,
                bucket: cfg.r2Bucket,
                publicBaseUrl: cfg.publicBaseOverride || undefined,
            });
            console.log('R2 client initialized from saved config');
        }
    } catch (e) {
        console.warn('Failed to auto-initialize R2 client:', e);
    }
});
