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
            return;
        }
        
        const envText = await response.text();
        const lines = envText.split('\n');
        
        lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=').trim();
                
                if (key.trim() === 'CONTEST_PASSWORD') {
                    CONFIG.CONTEST_PASSWORD = value;
                }
                if (key.trim() === 'ADMIN_PASSWORD') {
                    CONFIG.ADMIN_PASSWORD = value;
                }
            }
        });
        
        CONFIG.LOADED = true;
        window.resolveConfig();
    } catch (error) {
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

