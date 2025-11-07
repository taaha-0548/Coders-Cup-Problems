// Admin Panel JavaScript
const API_URL = window.location.origin + '/api';

let isLoggedIn = false;
let adminToken = null;  // Store the token after login
let editingProblemId = null;
let sampleCount = 0;
let currentContestStatus = null; // Store current contest status for auto-reset logic

// Timer countdown variables
let adminTimerInterval = null;
let adminLocalRemainingTime = 0;
let lastUpdateCheck = 0;  // Track last-update timestamp for smart polling
let updateCheckInterval = null;  // Poll for updates every 10 seconds

// Broadcast contest state changes to all tabs/windows
function broadcastContestStateChange(action) {
    // Use localStorage to notify other tabs/windows
    const event = {
        type: 'contestStateChange',
        action: action,  // 'started', 'stopped', 'scheduled', 'reset', etc.
        source: 'admin',  // Mark that this is from the admin panel
        timestamp: Date.now()
    };
    
    // Broadcast via localStorage
    localStorage.setItem('contestStateChange', JSON.stringify(event));
    
    // Also clear it after a short delay so it can be triggered again
    setTimeout(() => {
        localStorage.removeItem('contestStateChange');
    }, 100);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    // Add sample input on load
    addSampleInput();
});

// Check if user is already logged in
function checkLoginStatus() {
    const sessionToken = sessionStorage.getItem('adminToken');
    if (sessionToken) {
        adminToken = sessionToken;
        isLoggedIn = true;
        showAdminPanel();
        loadProblemsForManagement();
        
        // Set up smart polling: Check for updates every 10 seconds (lightweight)
        if (!updateCheckInterval) {
            updateCheckInterval = setInterval(checkForUpdates, 10000);
        }
    }
}

// Login function
async function loginAdmin() {
    const password = document.getElementById('adminPassword').value;
    
    if (!password) {
        alert('Please enter a password');
        return;
    }
    
    try {
        // Validate password with backend before logging in
        const response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'X-Admin-Token': password
            }
        });
        
        // If backend accepts the token, proceed
        if (response.ok) {
            adminToken = password;
            sessionStorage.setItem('adminToken', password);
            isLoggedIn = true;
            showAdminPanel();
            loadProblemsForManagement();
            document.getElementById('adminPassword').value = '';
            showMessage('success', 'Login successful!', 'loginMessage');
        } else {
            showMessage('error', 'Invalid password!', 'loginMessage');
            document.getElementById('adminPassword').value = '';
        }
    } catch (error) {
        showMessage('error', 'Connection error. Please try again.', 'loginMessage');
        console.error('Login error:', error);
    }
}

// Logout function
function logoutAdmin() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminToken');
        adminToken = null;
        isLoggedIn = false;
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('adminPanel').style.display = 'none';
        resetForm();
    }
}

// Show admin panel and hide login form
function showAdminPanel() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    // Load contest status when admin panel is shown
    loadContestStatus();
    
    // Set up JSON file upload handler
    const jsonFileInput = document.getElementById('jsonFileUpload');
    if (jsonFileInput) {
        jsonFileInput.addEventListener('change', handleJsonFileUpload);
    }
}

// Handle JSON file upload
function handleJsonFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        showMessage('error', 'Please select a valid JSON file', 'message');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const problemData = JSON.parse(e.target.result);
            populateFormFromJson(problemData);
            showMessage('success', 'Problem data loaded from JSON!', 'message');
        } catch (error) {
            showMessage('error', 'Invalid JSON file: ' + error.message, 'message');
        }
    };
    reader.readAsText(file);
}

// Populate form fields from JSON data
function populateFormFromJson(data) {
    // Map JSON fields to form fields
    if (data.id) document.getElementById('problemId').value = data.id;
    if (data.title) document.getElementById('problemTitle').value = data.title;
    if (data.origin) document.getElementById('problemOrigin').value = data.origin;
    if (data.timeLimit) document.getElementById('problemTimeLimit').value = data.timeLimit;
    if (data.memoryLimit) document.getElementById('problemMemoryLimit').value = data.memoryLimit;
    if (data.statement) document.getElementById('problemStatement').value = data.statement;
    if (data.input) document.getElementById('problemInput').value = data.input;
    if (data.output) document.getElementById('problemOutput').value = data.output;
    if (data.constraints) document.getElementById('problemConstraints').value = data.constraints;
    if (data.note) document.getElementById('problemNote').value = data.note;
    if (data.vj_link || data.vjLink) document.getElementById('problemVjLink').value = data.vj_link || data.vjLink;
    
    // Clear existing samples and add new ones from JSON
    document.getElementById('samplesContainer').innerHTML = '';
    sampleCount = 0;
    
    if (data.samples && Array.isArray(data.samples)) {
        data.samples.forEach(sample => {
            addSampleInput();
            const lastSampleId = sampleCount - 1;
            const inputTextarea = document.querySelector(`#sample-${lastSampleId} .sample-input-text`);
            const outputTextarea = document.querySelector(`#sample-${lastSampleId} .sample-output-text`);
            
            if (inputTextarea) inputTextarea.value = sample.input || '';
            if (outputTextarea) outputTextarea.value = sample.output || '';
        });
    } else {
        addSampleInput(); // Add at least one empty sample
    }
    
    // Scroll to top of form
    document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
}

// Switch between tabs
function switchTab(tabName, event) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active from all buttons
    const buttons = document.querySelectorAll('.admin-tab');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab and mark button active
    document.getElementById(tabName).classList.add('active');
    
    // Mark button as active if called from click event
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    if (tabName === 'manage-problems') {
        loadProblemsForManagement();
    } else if (tabName === 'contest-settings') {
        loadContestOnTabSwitch();
    }
}

// Add sample input
function addSampleInput() {
    const container = document.getElementById('samplesContainer');
    const sampleId = sampleCount++;
    
    const sampleHtml = `
        <div class="sample-input" id="sample-${sampleId}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>Sample ${sampleId + 1}</strong>
                <button type="button" class="btn-remove-sample" onclick="removeSample(${sampleId})">Remove</button>
            </div>
            <div class="form-group" style="margin-top: 10px;">
                <label>Input</label>
                <textarea class="sample-input-text" placeholder="Sample input"></textarea>
            </div>
            <div class="form-group">
                <label>Output</label>
                <textarea class="sample-output-text" placeholder="Expected output"></textarea>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', sampleHtml);
}

// Remove sample input
function removeSample(sampleId) {
    const element = document.getElementById(`sample-${sampleId}`);
    if (element) {
        element.remove();
    }
}

// Save problem (add or update)
async function saveProblem() {
    if (!isLoggedIn) {
        showMessage('error', 'You must be logged in!', 'message');
        return;
    }
    
    const problemId = document.getElementById('problemId').value.trim().toUpperCase();
    const title = document.getElementById('problemTitle').value.trim();
    const origin = document.getElementById('problemOrigin').value.trim();
    const timeLimit = document.getElementById('problemTimeLimit').value.trim();
    const memoryLimit = document.getElementById('problemMemoryLimit').value.trim();
    const statement = document.getElementById('problemStatement').value.trim();
    const input = document.getElementById('problemInput').value.trim();
    const output = document.getElementById('problemOutput').value.trim();
    const constraints = document.getElementById('problemConstraints').value.trim();
    const note = document.getElementById('problemNote').value.trim();
    const vjLink = document.getElementById('problemVjLink').value.trim();
    
    // Validation
    if (!problemId || !title || !statement || !input || !output || !constraints || !vjLink) {
        showMessage('error', 'Please fill in all required fields!', 'message');
        return;
    }
    
    // Collect samples
    const samples = [];
    const sampleInputs = document.querySelectorAll('.sample-input-text');
    const sampleOutputs = document.querySelectorAll('.sample-output-text');
    
    for (let i = 0; i < sampleInputs.length; i++) {
        if (sampleInputs[i].value.trim() && sampleOutputs[i].value.trim()) {
            samples.push({
                input: sampleInputs[i].value.trim(),
                output: sampleOutputs[i].value.trim()
            });
        }
    }
    
    if (samples.length === 0) {
        showMessage('error', 'Add at least one sample!', 'message');
        return;
    }
    
    // Prepare data
    const problemData = {
        id: problemId,
        title,
        origin: origin || null,
        timeLimit: timeLimit || null,
        memoryLimit: memoryLimit || null,
        statement,
        input,
        output,
        constraints,
        note: note || null,
        vjLink,
        samples
    };
    
    try {
        showMessage('info', 'Saving problem...', 'message');
        
        const endpoint = editingProblemId ? `/admin/problems/${problemId}` : '/admin/problems';
        const method = editingProblemId ? 'PUT' : 'POST';
        
        const response = await fetch(`${API_URL}${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify(problemData)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        showMessage('success', editingProblemId ? 'Problem updated successfully!' : 'Problem added successfully!', 'message');
        resetForm();
        editingProblemId = null;
        setTimeout(() => loadProblemsForManagement(), 1000);
        
    } catch (error) {
        console.error('Error saving problem:', error);
        showMessage('error', `Error: ${error.message}`, 'message');
    }
}

// Load problems for management
async function loadProblemsForManagement() {
    try {
        const response = await fetch(`${API_URL}/problems`);
        if (!response.ok) throw new Error('Failed to load problems');
        
        const problems = await response.json();
        displayProblemsTable(problems);
        
    } catch (error) {
        console.error('Error loading problems:', error);
        const container = document.getElementById('problemsTableContainer');
        container.innerHTML = `<div class="message error">Error loading problems: ${error.message}</div>`;
    }
}

// Display problems table
function displayProblemsTable(problems) {
    const container = document.getElementById('problemsTableContainer');
    
    if (problems.length === 0) {
        container.innerHTML = '<p>No problems found.</p>';
        container.classList.remove('loading');
        return;
    }
    
    let html = `
        <table class="problems-list">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Origin</th>
                    <th>Time Limit</th>
                    <th>Memory Limit</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    problems.forEach(problem => {
        html += `
            <tr>
                <td><strong>${problem.id}</strong></td>
                <td>${problem.title}</td>
                <td>${problem.origin || '-'}</td>
                <td>${problem.time_limit || '-'}</td>
                <td>${problem.memory_limit || '-'}</td>
                <td>
                    <button class="btn-edit" onclick="editProblem('${problem.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteProblem('${problem.id}')">Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
    container.classList.remove('loading');
}

// Edit problem
async function editProblem(problemId) {
    if (!isLoggedIn) return;
    
    try {
        const response = await fetch(`${API_URL}/problems/${problemId}`);
        if (!response.ok) throw new Error('Problem not found');
        
        const problem = await response.json();
        
        // Fill form with problem data
        document.getElementById('problemId').value = problem.id;
        document.getElementById('problemTitle').value = problem.title;
        document.getElementById('problemOrigin').value = problem.origin || '';
        document.getElementById('problemTimeLimit').value = problem.timeLimit || '';
        document.getElementById('problemMemoryLimit').value = problem.memoryLimit || '';
        document.getElementById('problemStatement').value = problem.statement;
        document.getElementById('problemInput').value = problem.input;
        document.getElementById('problemOutput').value = problem.output;
        document.getElementById('problemConstraints').value = problem.constraints;
        document.getElementById('problemNote').value = problem.note || '';
        document.getElementById('problemVjLink').value = problem.vjLink;
        
        // Clear and add samples
        document.getElementById('samplesContainer').innerHTML = '';
        sampleCount = 0;
        problem.samples.forEach(sample => {
            addSampleInput();
            const sampleInputs = document.querySelectorAll('.sample-input-text');
            const sampleOutputs = document.querySelectorAll('.sample-output-text');
            const lastIndex = sampleInputs.length - 1;
            sampleInputs[lastIndex].value = sample.input;
            sampleOutputs[lastIndex].value = sample.output;
        });
        
        editingProblemId = problemId;
        switchTab('add-problem');
        showMessage('info', `Editing problem ${problemId}...`, 'message');
        
    } catch (error) {
        console.error('Error loading problem:', error);
        showMessage('error', `Error: ${error.message}`, 'managingMessage');
    }
}

// Delete problem
async function deleteProblem(problemId) {
    if (!isLoggedIn) return;
    
    if (!confirm(`Are you sure you want to delete problem ${problemId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/problems/${problemId}`, {
            method: 'DELETE',
            headers: {
                'X-Admin-Token': adminToken
            }
        });
        
        if (!response.ok) throw new Error(`Failed to delete: ${response.status}`);
        
        showMessage('success', 'Problem deleted successfully!', 'managingMessage');
        setTimeout(() => loadProblemsForManagement(), 1000);
        
    } catch (error) {
        console.error('Error deleting problem:', error);
        showMessage('error', `Error: ${error.message}`, 'managingMessage');
    }
}

// Reset form
function resetForm() {
    document.getElementById('problemId').value = '';
    document.getElementById('problemTitle').value = '';
    document.getElementById('problemOrigin').value = '';
    document.getElementById('problemTimeLimit').value = '';
    document.getElementById('problemMemoryLimit').value = '';
    document.getElementById('problemStatement').value = '';
    document.getElementById('problemInput').value = '';
    document.getElementById('problemOutput').value = '';
    document.getElementById('problemConstraints').value = '';
    document.getElementById('problemNote').value = '';
    document.getElementById('problemVjLink').value = '';
    
    document.getElementById('samplesContainer').innerHTML = '';
    sampleCount = 0;
    addSampleInput();
    editingProblemId = null;
    
    document.getElementById('message').className = 'message';
    document.getElementById('message').textContent = '';
}

// Show message
function showMessage(type, text, elementId) {
    const element = document.getElementById(elementId || 'message');
    element.className = `message ${type}`;
    element.textContent = text;
}

// ==================== CONTEST TIMER FUNCTIONS ====================

// Load contest status on contest settings tab
async function loadContestStatus() {
    try {
        const response = await fetch(`${API_URL}/contest/status`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}: Failed to load contest status`);
        }
        
        const contest = await response.json();
        updateContestUI(contest);
        
    } catch (error) {
        console.error('Error loading contest status:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Fast check: Poll the last-update endpoint (very lightweight)
async function checkForUpdates() {
    try {
        const response = await fetch(`${API_URL}/contest/last-update`);
        if (!response.ok) return;
        
        const data = await response.json();
        
        // If something changed since we last checked, fetch full status
        if (data.last_update > lastUpdateCheck) {
            lastUpdateCheck = data.last_update;
            loadContestStatus();  // Fetch full status and update UI
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

function updateContestUI(contest) {
    // Store the current contest status in global variable for auto-reset logic
    currentContestStatus = contest;
    
    const statusBadge = document.getElementById('contestStatus');
    const timeDisplay = document.getElementById('timeRemaining');
    const btnSchedule = document.getElementById('btnSchedule');
    const btnStartNow = document.getElementById('btnStartNow');
    const btnStop = document.getElementById('btnStop');
    const btnAddTime = document.getElementById('btnAddTime');
    const btnAddPreCountdownTime = document.getElementById('btnAddPreCountdownTime');
    const btnReset = document.getElementById('btnReset');
    
    // Update status
    statusBadge.textContent = contest.status.toUpperCase();
    statusBadge.className = `status-badge ${contest.status}`;
    
    // Update time display and start countdown if contest is active
    adminLocalRemainingTime = contest.remaining_time;
    updateAdminTimerDisplay();
    
    // Start countdown if contest is running or pending
    if (contest.status === 'running' || contest.status === 'pending') {
        startAdminTimerCountdown();
    } else {
        stopAdminTimerCountdown();
    }
    
    // Update button states based on contest status
    if (contest.status === 'running') {
        // Contest is running: can add time and stop, but not schedule/start
        if (btnSchedule) btnSchedule.disabled = true;
        if (btnStartNow) btnStartNow.disabled = true;
        if (btnStop) btnStop.disabled = false;
        if (btnAddTime) btnAddTime.disabled = false;
        if (btnAddPreCountdownTime) btnAddPreCountdownTime.disabled = true;
        if (btnReset) btnReset.disabled = false;
    } else if (contest.status === 'pending') {
        // Contest is pending: can schedule/start or stop, can add pre-countdown time
        if (btnSchedule) btnSchedule.disabled = false;
        if (btnStartNow) btnStartNow.disabled = false;
        if (btnStop) btnStop.disabled = false;
        if (btnAddTime) btnAddTime.disabled = true;
        if (btnAddPreCountdownTime) btnAddPreCountdownTime.disabled = false;
        if (btnReset) btnReset.disabled = false;
    } else {
        // Contest ended: all disabled except reset
        if (btnSchedule) btnSchedule.disabled = true;
        if (btnStartNow) btnStartNow.disabled = true;
        if (btnStop) btnStop.disabled = true;
        if (btnAddTime) btnAddTime.disabled = true;
        if (btnReset) btnReset.disabled = false;
    }
    
    // Update visibility checkbox
    document.getElementById('contestVisibility').checked = contest.is_visible;
}

// Admin timer countdown functions
function updateAdminTimerDisplay() {
    const timeDisplay = document.getElementById('timeRemaining');
    if (!timeDisplay) return;
    
    const hours = Math.floor(adminLocalRemainingTime / 3600);
    const minutes = Math.floor((adminLocalRemainingTime % 3600) / 60);
    const seconds = Math.floor(adminLocalRemainingTime % 60);
    timeDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startAdminTimerCountdown() {
    if (adminTimerInterval) return;  // Already running
    
    adminTimerInterval = setInterval(() => {
        if (adminLocalRemainingTime > 0) {
            adminLocalRemainingTime -= 0.1;  // Decrease by 100ms
            updateAdminTimerDisplay();
        }
    }, 100);  // Update every 100ms for smooth countdown
}

function stopAdminTimerCountdown() {
    if (adminTimerInterval) {
        clearInterval(adminTimerInterval);
        adminTimerInterval = null;
    }
}

// Add time to contest
async function addTime() {
    const minutes = parseInt(document.getElementById('addMinutes').value);
    
    if (!minutes || minutes < 1) {
        showMessage('error', 'Please enter valid minutes', 'contestMessage');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/contest/add-time`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({ minutes: minutes })
        });
        
        if (!response.ok) throw new Error('Failed to add time');
        
        showMessage('success', `Added ${minutes} minutes to contest!`, 'contestMessage');
        await loadContestStatus();
        
        // Notify all participant pages
        broadcastContestStateChange('timeAdded');
        
    } catch (error) {
        console.error('Error adding time:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Add time to pre-countdown phase
async function addPreCountdownTime() {
    const minutes = parseInt(document.getElementById('addPreCountdownMinutes').value);
    
    if (!minutes || minutes < 1) {
        showMessage('error', 'Please enter valid minutes', 'contestMessage');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/contest/add-precountdown-time`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({ minutes: minutes })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add pre-countdown time');
        }
        
        showMessage('success', `Added ${minutes} minutes to pre-countdown!`, 'contestMessage');
        await loadContestStatus();
        
        // Notify all participant pages
        broadcastContestStateChange('preCountdownExtended');
        
    } catch (error) {
        console.error('Error adding pre-countdown time:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Stop contest
async function stopContest() {
    if (!confirm('Are you sure you want to stop the contest immediately?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/contest/stop`, {
            method: 'POST',
            headers: {
                'X-Admin-Token': adminToken
            }
        });
        
        if (!response.ok) throw new Error('Failed to stop contest');
        
        showMessage('success', 'Contest stopped!', 'contestMessage');
        await loadContestStatus();
        
        // Notify all participant pages to refresh
        broadcastContestStateChange('stopped');
        
    } catch (error) {
        console.error('Error stopping contest:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Toggle visibility
async function toggleVisibility() {
    const isVisible = document.getElementById('contestVisibility').checked;
    
    try {
        const response = await fetch(`${API_URL}/admin/contest/visibility`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({ is_visible: isVisible })
        });
        
        if (!response.ok) throw new Error('Failed to update visibility');
        
        showMessage('success', isVisible ? 'Timer visible to participants' : 'Timer hidden from participants', 'contestMessage');
        
    } catch (error) {
        console.error('Error updating visibility:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
        document.getElementById('contestVisibility').checked = !isVisible; // Revert
    }
}

let timerPollingInterval = null;

// Timer polling is not needed on admin panel - status is only loaded on-demand
// These functions are kept for backward compatibility but not used

// Load contest status when switching to contest settings tab
function loadContestOnTabSwitch() {
    // Just load once when switching to the tab, no continuous polling
    loadContestStatus();
}

// Schedule contest with pre-contest countdown
async function scheduleContest() {
    const countdownMinutes = parseInt(document.getElementById('preContestCountdown').value);
    const durationMinutes = parseInt(document.getElementById('contestDuration').value);
    
    if (!countdownMinutes || countdownMinutes < 1) {
        showMessage('error', 'Please enter valid countdown time', 'contestMessage');
        return;
    }
    
    if (!durationMinutes || durationMinutes < 1) {
        showMessage('error', 'Please enter valid duration', 'contestMessage');
        return;
    }
    
    try {
        console.log('Schedule clicked. Current status:', currentContestStatus?.status || 'UNDEFINED');
        
        // If contest is ended, reset it first before scheduling new one
        if (currentContestStatus && currentContestStatus.status === 'ended') {
            console.log('Contest is ended. Resetting before scheduling new contest...');
            
            const resetResponse = await fetch(`${API_URL}/admin/contest/reset`, {
                method: 'POST',
                headers: {
                    'X-Admin-Token': adminToken
                }
            });
            
            if (!resetResponse.ok) {
                throw new Error('Failed to reset contest before scheduling');
            }
            
            console.log('Reset successful');
            
            // Wait a moment for reset to complete
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('Now scheduling contest with countdown:', countdownMinutes, 'duration:', durationMinutes);
        
        // Now schedule the new contest
        const response = await fetch(`${API_URL}/admin/contest/schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({
                countdown_minutes: countdownMinutes,
                duration_minutes: durationMinutes
            })
        });
        
        if (!response.ok) throw new Error('Failed to schedule contest');
        
        console.log('Schedule successful');
        
        showMessage('success', `Contest scheduled! Countdown in ${countdownMinutes}m, then ${durationMinutes}m contest`, 'contestMessage');
        await loadContestStatus();
        
        // Notify all participant pages
        broadcastContestStateChange('scheduled');
        
    } catch (error) {
        console.error('Error scheduling contest:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Start contest immediately (no countdown)
async function startContestNow() {
    const duration = parseInt(document.getElementById('quickDuration').value);
    
    if (!duration || duration < 1) {
        showMessage('error', 'Please enter a valid duration', 'contestMessage');
        return;
    }
    
    try {
        console.log('Start Now clicked. Current status:', currentContestStatus?.status || 'UNDEFINED');
        
        // If contest is ended, reset it first before starting new one
        if (currentContestStatus && currentContestStatus.status === 'ended') {
            console.log('Contest is ended. Resetting before starting new contest...');
            
            const resetResponse = await fetch(`${API_URL}/admin/contest/reset`, {
                method: 'POST',
                headers: {
                    'X-Admin-Token': adminToken
                }
            });
            
            if (!resetResponse.ok) {
                throw new Error('Failed to reset contest before starting');
            }
            
            console.log('Reset successful');
            
            // Wait a moment for reset to complete
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('Now starting contest for', duration, 'minutes');
        
        // Now start the new contest
        const response = await fetch(`${API_URL}/admin/contest/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify({ duration_minutes: duration })
        });
        
        if (!response.ok) throw new Error('Failed to start contest');
        
        console.log('Start successful');
        
        showMessage('success', `Contest started immediately for ${duration} minutes!`, 'contestMessage');
        
        // Refresh status (once, not continuously)
        await loadContestStatus();
        
        // Notify all participant pages (broadcast the transition, not just a generic 'started')
        broadcastContestStateChange('countdown-ended');
        
    } catch (error) {
        console.error('Error starting contest:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}

// Start contest (original function, now just calls startContestNow)
async function startContest() {
    return startContestNow();
}

// Reset contest
async function resetContest() {
    if (!confirm('Reset contest to pending state? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/contest/reset`, {
            method: 'POST',
            headers: {
                'X-Admin-Token': adminToken
            }
        });
        
        if (!response.ok) throw new Error('Failed to reset contest');
        
        showMessage('success', 'Contest reset to pending state', 'contestMessage');
        await loadContestStatus();
        
        // Notify all participant pages
        broadcastContestStateChange('reset');
        
    } catch (error) {
        console.error('Error resetting contest:', error);
        showMessage('error', `Error: ${error.message}`, 'contestMessage');
    }
}
