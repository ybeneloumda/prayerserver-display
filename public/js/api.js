async function loadSettingsFromServer() {
    try {

        var server = localStorage.getItem('admin-server-ip');
        if (server === null){
            server = document.getElementById('admin-server-ip').value;
        }

        var port = localStorage.getItem('admin-server-port');
        if (port === null){
            port = document.getElementById('admin-server-port').value;
        }

        var secured = localStorage.getItem('admin-server-secured');
        if (secured === null){
            secured = document.getElementById('admin-server-secured').value;
        }
        

        const res = await fetch(secured+'://'+server+':'+port+'/api/get-settings');
        if (!res.ok) throw new Error('Network error');
        const data = await res.json();
        console.log('Loaded settings from server', data);
        return data;
    } catch (err) {
        console.warn('Falling back to localStorage due to error:', err);
        return JSON.parse(localStorage.getItem('prayerSettings') || '{}');
    }
}

async function saveSettingsToServer(settings) {
    try {
        

        var server = localStorage.getItem('admin-server-ip');
        if (server === null){
            server = document.getElementById('admin-server-ip').value;
        }

        var port = localStorage.getItem('admin-server-port');
        if (port === null){
            port = document.getElementById('admin-server-port').value;
        }

        var secured = localStorage.getItem('admin-server-secured');
        if (secured === null){
            secured = document.getElementById('admin-server-secured').value;
        }
        
        const res = await fetch(secured+'://'+server+':'+port+'/api/get-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!res.ok) throw new Error('Network error');
        console.log('Saved settings to server', settings);
    } catch (err) {
        console.warn('Saving to localStorage due to error:', err);
        localStorage.setItem('prayerSettings', JSON.stringify(settings));
    }
}

// Replace localStorage GET
function getSetting(key, defaultValue) {
    if (window.serverSettings && key in window.serverSettings) {
        return window.serverSettings[key];
    }
    return defaultValue;
}

// Replace localStorage SET
function setSetting(key, value) {
    window.serverSettings[key] = value;
    saveSettingsToServer(window.serverSettings);
}

// Load settings on startup
(async function initSettings() {
    window.serverSettings = await loadSettingsFromServer();
    // call your existing render/init function here after settings are loaded
    render(); // assuming render() is your UI function
})();