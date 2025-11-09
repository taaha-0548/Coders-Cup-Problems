// Configuration file - Load contest password from .env file
// This file should be loaded BEFORE main.js

let CONFIG = {
    CONTEST_PASSWORD: 'admin123',  // Default fallback
    ADMIN_PASSWORD: 'admin123',    // Default fallback
    LOADED: false                   // Track if .env was loaded
};

// Promise to track when config is ready
let configReady = new Promise((resolve) => {
    window.resolveConfig = resolve;
});

// Load .env file
async function loadEnv() {
    try {
        // Try multiple paths to find .env file
        const paths = [
            '.env',
            '/.env',
            './frontend/.env',
            '../.env'
        ];
        
        let response = null;
        let successPath = null;
        
        for (const path of paths) {
            try {
                const res = await fetch(path, { cache: 'no-store' });
                if (res.ok) {
                    response = res;
                    successPath = path;
                    break;
                }
            } catch (e) {
                // Try next path
                continue;
            }
        }
        
        if (!response) {
            console.warn('⚠ .env file not found in any location, using default passwords');
            console.log('Paths tried:', paths);
            return;
        }
        
        const envText = await response.text();
        console.log(`✓ .env file found at: ${successPath}`);
        const lines = envText.split('\n');
        
        lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                
                if (key.trim() === 'CONTEST_PASSWORD') {
                    CONFIG.CONTEST_PASSWORD = value;
                    console.log('✓ CONTEST_PASSWORD loaded from .env:', value);
                }
                if (key.trim() === 'ADMIN_PASSWORD') {
                    CONFIG.ADMIN_PASSWORD = value;
                    console.log('✓ ADMIN_PASSWORD loaded from .env:', value);
                }
            }
        });
        
        console.log('✓ CONFIG initialized:', CONFIG);
        CONFIG.LOADED = true;
        window.resolveConfig();
    } catch (error) {
        console.warn('⚠ Could not load .env file:', error.message);
        CONFIG.LOADED = true;
        window.resolveConfig();
    }
}

// Load environment on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadEnv);
} else {
    loadEnv();
}

// Log CONFIG after a small delay to ensure it's loaded
setTimeout(() => {
    console.log('=== FINAL CONFIG STATE ===');
    console.log('CONTEST_PASSWORD:', CONFIG.CONTEST_PASSWORD);
    console.log('ADMIN_PASSWORD:', CONFIG.ADMIN_PASSWORD);
    console.log('========================');
}, 500);

