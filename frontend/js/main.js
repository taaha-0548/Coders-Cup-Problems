// ==================== PASSWORD AUTHENTICATION ====================
// Check if user has already authenticated (stored in sessionStorage)
const API_URL = window.location.origin + '/api';

function isUserAuthenticated() {
    return sessionStorage.getItem('contestPasswordValid') === 'true';
}

function setUserAuthenticated() {
    sessionStorage.setItem('contestPasswordValid', 'true');
}

async function handlePasswordSubmit(event) {
    event.preventDefault();
    
    const password = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('passwordError');
    const submitButton = event.target.querySelector('button[type="submit"]');
    
    try {
        submitButton.disabled = true;
        submitButton.textContent = 'Verifying...';
        
        const response = await fetch(`${API_URL}/validate-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✓ Password correct, setting authenticated state');
            setUserAuthenticated();
            document.getElementById('passwordModal').classList.add('hidden');
            hideLoading(); // Make sure loading is hidden
            // Reload to show main content
            location.reload();
        } else {
            errorDiv.textContent = data.error || 'Invalid password';
            errorDiv.style.display = 'block';
            document.getElementById('passwordInput').value = '';
        }
    } catch (error) {
        console.error('Password validation error:', error);
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.style.display = 'block';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Access Contest';
    }
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('passwordInput');
    const toggleBtn = document.getElementById('passwordToggle');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        // Change icon to closed eye (hide password)
        toggleBtn.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    } else {
        passwordInput.type = 'password';
        // Change icon back to open eye (show password)
        toggleBtn.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;
    }
}

// Global variables
let allProblems = [];
let lastProblemsUpdateTime = 0; // Track when problems were last fetched
const PROBLEMS_CACHE_DURATION = 60000; // 1 minute in milliseconds

// Contest status variables
let statusPollingInterval = null;
let timerCountdownInterval = null;
let phaseCheckTimer = null;
let lastContestStatus = null;
let localRemainingTime = 0;
let lastUpdateCheck = 0;  // Track last-update timestamp for smart polling
let updateCheckInterval = null;  // Poll for updates every 5 seconds

// API URL - dynamically set based on current domain
// (Already defined above in password section)

// Broadcast contest state changes to other tabs/windows
function broadcastContestStateChange(action, source = 'index-page') {
    const event = {
        type: 'contestStateChange',
        action: action,
        source: source,
        timestamp: Date.now()
    };
    
    localStorage.setItem('contestStateChange', JSON.stringify(event));
    
    setTimeout(() => {
        localStorage.removeItem('contestStateChange');
    }, 100);
}

// DOM elements
const problemsTbody = document.getElementById('problems-tbody');
const loadingElement = document.getElementById('loading');
const loadingOverlay = document.getElementById('loading-overlay');

// Show/hide loading spinner
function showLoading(message = 'Loading problems...') {
    if (loadingOverlay) {
        loadingOverlay.querySelector('.loading-content p').textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Check password authentication first
    if (!isUserAuthenticated()) {
        // Hide loading overlay and show password modal
        hideLoading();
        document.getElementById('passwordModal').classList.remove('hidden');
        document.getElementById('passwordInput').focus();
        return; // Stop further initialization
    }
    
    // Hide password modal if somehow still visible
    document.getElementById('passwordModal').classList.add('hidden');
    
    // Show loading spinner immediately
    showLoading('Loading contest...');
    
    initializeTabClicks();  // Add click handlers to tab links
    initializeAnimations();
    
    // Initialize contest status and timer FIRST (before showing any tab content)
    initializeContestStatus().then(() => {
        // Now initialize navigation (which may show problems tab)
        // This will call showProblems() which will handle loading and displaying problems
        initializeNavigation();
    }).catch(() => {
        // Even if contest status fails, show navigation
        initializeNavigation();
        hideLoading();
    });
    
    // Set a timeout to ensure spinner is hidden after 10 seconds (failsafe)
    setTimeout(() => {
        hideLoading();
    }, 10000);
    
    // Define reusable storage event handler
    window.handleStorageEvent = function(e) {
        if (e.key === 'contestStateChange') {
            try {
                const event = JSON.parse(e.newValue);
                if (event && event.type === 'contestStateChange') {
                    console.log(`Received broadcast from ${event.source}: ${event.action}`);
                    // Store the source to avoid re-broadcasting external transitions
                    window.lastBroadcastSource = event.source;
                    // Immediately refresh contest status (but don't re-broadcast if from admin)
                    checkContestStatusOnce();
                }
            } catch (err) {
                console.error('Error parsing broadcast event:', err);
            }
        }
    };
    
    // Listen for admin broadcast events (when admin changes contest state)
    window.addEventListener('storage', window.handleStorageEvent);
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', function() {
        window.removeEventListener('storage', window.handleStorageEvent);
        if (updateCheckInterval) clearInterval(updateCheckInterval);
        if (timerCountdownInterval) clearInterval(timerCountdownInterval);
        if (phaseCheckTimer) clearInterval(phaseCheckTimer);
    });
});

// Setup tab click handlers to prevent page reload
function initializeTabClicks() {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();  // Prevent page reload
            
            // Get the tab name from the href
            const href = tab.getAttribute('href');
            const tabName = new URLSearchParams(href.split('?')[1]).get('tab');
            
            // Update URL without reload
            window.history.pushState({}, '', href);
            
            // Track current tab
            setCurrentTab(tabName);
            
            // Show appropriate content
            if (tabName === 'problems') {
                showProblems();
            } else {
                showInstructions();
            }
            
            // Update active tab styling
            setActiveTab(tabName);
        });
    });
}

// Initialize navigation and handle URL parameters
function initializeNavigation() {
    const urlParams = new URLSearchParams(window.location.search);
    const activeTab = urlParams.get('tab') || 'instructions';

    // Track current tab
    setCurrentTab(activeTab);

    // Set initial tab state
    if (activeTab === 'instructions') {
        showInstructions();
        setActiveTab('instructions');
    } else {
        // Call showProblems() first to create the DOM structure
        showProblems();
        setActiveTab('problems');
    }
}

// Set active tab visual state
function setActiveTab(tabName) {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.classList.remove('active');
        const tabText = tab.textContent.toLowerCase();
        if (tabText === tabName || (tabName === 'problems' && tabText === 'problem')) {
            tab.classList.add('active');
        }
    });
}

// Initialize animations and interactions
function initializeAnimations() {
    // Make logo clickable
    const logo = document.querySelector('.contest-logo');
    if (logo) {
        logo.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    
    // Simple fade-in animation for table container
    const tableContainer = document.querySelector('.problems-table-container');
    if (tableContainer) {
        tableContainer.style.opacity = '0';
        tableContainer.style.transform = 'translateY(20px)';
        setTimeout(() => {
            tableContainer.style.opacity = '1';
            tableContainer.style.transform = 'translateY(0)';
        }, 300);
    }
}

// Load all problems from API
async function loadProblems() {
    try {
        // Always fetch fresh data from API
        const response = await fetch(`${API_URL}/problems`);
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }

        allProblems = await response.json();
        lastProblemsUpdateTime = Date.now(); // Update timestamp when fetched
        console.log(`✓ Loaded ${allProblems.length} problems from API`);
        displayProblems(); // Ensure DOM updates
    } catch (error) {
        console.error('Error loading problems:', error);
        showError('Failed to load problems. Make sure the backend server is running at ' + API_URL);
        hideLoading(); // Ensure spinner is hidden
    }
}

// Display problems in the table
function displayProblems() {
    // Get fresh reference to the tbody element
    const tbody = document.getElementById('problems-tbody');
    if (!tbody) {
        console.error('Problems tbody not found');
        return;
    }
    
    if (allProblems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">No problems found</td></tr>';
        return;
    }
    
    tbody.innerHTML = allProblems.map(problem => createProblemRow(problem)).join('');
}

// Create HTML for a single problem row
function createProblemRow(problem) {
    const points = getPointsForProblem(problem.id);
    
    return `
        <tr>
            <td class="problem-id">${problem.id}</td>
            <td class="problem-title" onclick="openProblem('${problem.id}')">
                ${problem.title}
            </td>
            <td class="problem-points">${points} pts</td>
        </tr>
    `;
}

// Get points for a problem based on its position
function getPointsForProblem(problemId) {
    const pointsMap = {
        'A': 1,
        'B': 1,
        'C': 1,
        'D': 1,
        'E': 1,
        'F': 1,
        'G': 1,
        'H': 1
    };
    return pointsMap[problemId] || 1;
}

// Open problem page
function openProblem(problemId) {
    // Reload problems before navigating
    loadProblems().then(() => {
        window.location.href = `problem.html?id=${problemId}`;
    });
}

// Show/hide loading spinner
function showLoading(show) {
    // Get fresh reference to the loading element
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

// Show error message
function showError(message) {
    // Get fresh reference to the tbody element
    const tbody = document.getElementById('problems-tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 40px; color: #e74c3c;">
                    <strong>Error:</strong> ${message}
                    <br><br>
                    <button onclick="loadProblems()" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </td>
            </tr>
        `;
    }
}

// Navigation tab handlers
document.addEventListener('DOMContentLoaded', function() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all tabs
            navTabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Handle different tab actions
            const tabText = this.textContent.toLowerCase();
            switch(tabText) {
                case 'instructions':
                    // Show instructions content and update URL
                    showInstructions();
                    window.history.pushState({tab: 'instructions'}, '', '?tab=instructions');
                    break;
                case 'problem':
                    // Show problems table and update URL
                    showProblems();
                    window.history.pushState({tab: 'problems'}, '', '?tab=problems');
                    break;
            }
        });
    });
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.tab) {
            if (e.state.tab === 'instructions') {
                showInstructions();
                setActiveTab('instructions');
            } else {
                showProblems();
                setActiveTab('problems');
            }
        }
    });
});

// Show instructions content
function showInstructions() {
    const container = document.querySelector('#main-container');
    container.innerHTML = `
        <div class="instructions-content">
            <h2>Coder's Cup - Round 1</h2>
            <div class="instruction-section">
                <h3>Rules</h3>
                <ul>
                    <li>This is the round 1 for Coders cup</li>
                    <li>The problems are sorted by difficulty</li>
                    <li>Click on any problem title to view the full problem statement</li>
                    <li>Submit your solutions on VJudge using the provided links</li>
                </ul>
            </div>
            
            <div class="instruction-section" style="border-left: 4px solid #3498db; background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h3 style="color: #2c3e50; margin-top: 0;">📝 Note</h3>
                <p style="color: #34495e; margin: 10px 0;">Use the VJudge account that you provided when registering for the Coder's cup. Do not use any other account.</p>
            </div>
            
            <div class="instruction-section">
                <h3>How to Submit</h3>
                <ol>
                    <li>Click on any problem title to open the problem page</li>
                    <li>Read the problem statement carefully</li>
                    <li>Click the "Submit" button to open VJudge</li>
                    <li>Submit your solution on the VJudge platform</li>
                </ol>
            </div>
            
            <div class="instruction-section">
                <h3>Problem Scoring</h3>
                <ul>
                    <li>Problem A: 1 point</li>
                    <li>Problem B: 1 point</li>
                    <li>Problem C: 1 point</li>
                    <li>Problem D: 1 point</li>
                    <li>Problem E: 1 point</li>
                    <li>Problem F: 1 point</li>
                    <li>Problem G: 1 point</li>
                </ul>
            </div>
            
            <div class="instruction-section">
                <h3>Getting Started</h3>
                <p>Click on the "Problem" tab above to view all available problems and start solving!</p>
            </div>
        </div>
    `;
    
    // Hide main loading overlay
    hideLoading();
}

// Show problems table
function showProblems() {
    const container = document.querySelector('#main-container');
    
    // Immediately show loading state to provide instant feedback
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <p style="font-size: 18px; color: #666;">Loading problems...</p>
            <div style="margin-top: 20px; display: inline-block;">
                <div style="border: 4px solid #f3f3f3; border-top: 4px solid #e74c3c; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </div>
    `;
    
    // Check if cache is still fresh or if we need to refetch
    const now = Date.now();
    const isCacheStale = (now - lastProblemsUpdateTime) > PROBLEMS_CACHE_DURATION;
    
    // Always fetch fresh data if cache is stale or problems are not yet loaded
    if (allProblems.length === 0 || isCacheStale) {
        // Fetch fresh problems
        loadProblems().then(() => {
            hideLoading(); // Hide main overlay after problems are loaded
            // After loading, check contest status and display accordingly
            if (lastContestStatus) {
                displayProblemsBasedOnStatus(lastContestStatus);
            } else {
                checkContestStatusAndDisplay();
            }
        }).catch(() => {
            hideLoading(); // Hide main overlay even if there's an error
        });
    } else {
        // Cache is fresh, just display loaded problems
        hideLoading();
        if (lastContestStatus) {
            displayProblemsBasedOnStatus(lastContestStatus);
        } else {
            checkContestStatusAndDisplay();
        }
    }
}

async function checkContestStatusAndDisplay() {
    try {
        const response = await fetch(`${API_URL}/contest/status`);
        if (!response.ok) throw new Error('Failed to check contest status');
        
        const contest = await response.json();
        displayProblemsBasedOnStatus(contest);
    } catch (error) {
        console.error('Error checking contest status:', error);
        // If error, just display problems normally without contest status
        displayProblemsTable();
        // Problems should already be loaded at this point
        displayProblems();
        hideLoading(); // Ensure spinner is hidden after error
    }
}

function displayProblemsBasedOnStatus(contest) {
    const container = document.querySelector('#main-container');
    
    // If contest timer is visible to participants
    if (contest.is_visible) {
        if (contest.status === 'pending') {
            // Pre-contest: ONLY show countdown, NO problems
            displayPreContestCountdown(contest);
            startPhaseCheckTimer();  // Start checking for transition to running
            hideLoading();
        } else if (contest.status === 'running') {
            // Contest is running: Show problems + remaining time
            displayProblemsTable();
            // Show timer on page
            updateContestTimerOnPage(contest);
            // Display the already-loaded problems
            displayProblems();
            hideLoading();
            startPhaseCheckTimer();  // Start checking for transition to ended
        } else if (contest.status === 'ended') {
            // Contest ended: ONLY show message, NO problems
            displayContestEnded();
            stopPhaseCheckTimer();  // Stop checking, contest is over
            hideLoading();
        }
    } else {
        // Timer not visible to participants - show problems only if running
        if (contest.status === 'running') {
            displayProblemsTable();
            // Display the already-loaded problems
            displayProblems();
            hideLoading();
        } else if (contest.status === 'pending') {
            // Contest hasn't started yet, show nothing
            const container = document.querySelector('#main-container');
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <p style="font-size: 18px; color: #666;">Contest has not started yet.</p>
                </div>
            `;
            hideLoading();
        } else if (contest.status === 'ended') {
            // Contest ended, show message
            displayContestEnded();
            hideLoading();
        }
    }
}

function displayProblemsTable() {
    const container = document.querySelector('#main-container');
    container.innerHTML = `
        <div class="problems-table-container">
            <table class="problems-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Title</th>
                        <th>Points</th>
                    </tr>
                </thead>
                <tbody id="problems-tbody">
                    <!-- Problems will be loaded here -->
                </tbody>
            </table>
        </div>
        
        <div class="loading" id="loading" style="display: none;">
            <p>Loading problems...</p>
        </div>
    `;
}

// Display pre-contest countdown
function displayPreContestCountdown(contest) {
    const container = document.querySelector('#main-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <h2 style="color: #1a1a2e; margin-bottom: 30px;">Contest Starting Soon</h2>
            <div style="font-size: 20px; color: #666; margin-bottom: 20px;">Starting in</div>
            <div style="font-size: 80px; font-weight: bold; color: #3498db; font-family: 'Courier New', monospace; letter-spacing: 3px; margin: 40px 0;">
                <span id="preContestTimer">00:00:00</span>
            </div>
            <p style="font-size: 16px; color: #999; margin-top: 30px;">Problems will be displayed once the contest begins</p>
        </div>
    `;
    updatePreContestTimer(contest);
    updateTimerDisplay(contest);  // Set timer bar to blue
    startTimerCountdown();  // Start smooth countdown
}

// Display contest countdown
function displayContestCountdown(contest) {
    const container = document.querySelector('#main-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <h2 style="color: #1a1a2e; margin-bottom: 30px;">Contest Running</h2>
            <div style="font-size: 20px; color: #666; margin-bottom: 20px;">Time Remaining</div>
            <div style="font-size: 80px; font-weight: bold; color: #e74c3c; font-family: 'Courier New', monospace; letter-spacing: 3px; margin: 40px 0;">
                <span id="timerDisplay">00:00:00</span>
            </div>
        </div>
    `;
    updateTimerDisplay(contest);
    startTimerCountdown();  // Start smooth countdown
}

// Display contest ended message
function displayContestEnded() {
    const container = document.querySelector('#main-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
            <h2 style="color: #e74c3c; margin-bottom: 30px;">🏁 Contest Finished</h2>
            <p style="font-size: 18px; color: #666; margin-top: 20px;">Thank you for participating!</p>
        </div>
    `;
}

function updatePreContestTimer(contest) {
    const display = document.getElementById('preContestTimer');
    if (display && contest.remaining_time) {
        localRemainingTime = contest.remaining_time;  // Sync with API
        displayTimeFormatted(localRemainingTime, display);
    }
}

function updateTimerDisplay(contest) {
    const display = document.getElementById('timerDisplay');
    if (display && contest.remaining_time) {
        localRemainingTime = contest.remaining_time;  // Sync with API
        displayTimeFormatted(localRemainingTime, display);
    }
}

function displayTimeFormatted(seconds, element) {
    // Prevent negative time display
    if (seconds < 0) seconds = 0;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    element.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Update timer on problems page (when contest is running)
function updateContestTimerOnPage(contest) {
    const timerBar = document.getElementById('contestTimerBar');
    const timerDisplay = document.getElementById('contestTimerDisplay');
    
    if (!timerBar || !timerDisplay) return;
    
    if (contest.status === 'running') {
        // Show timer bar
        timerBar.style.display = 'block';
        
        // Sync local timer with API
        localRemainingTime = contest.remaining_time;
        displayTimeFormatted(localRemainingTime, timerDisplay);
        
        // Start smooth countdown if not already running
        startTimerCountdown();
    } else {
        // Hide timer bar if not running
        timerBar.style.display = 'none';
        stopTimerCountdown();
    }
}

// Local countdown that ticks every 100ms for smooth animation
function startTimerCountdown() {
    if (timerCountdownInterval) return;  // Already running
    
    timerCountdownInterval = setInterval(() => {
        if (localRemainingTime > 0) {
            localRemainingTime -= 0.1;  // Decrease by 100ms
            // Clamp to 0 to prevent negative values
            if (localRemainingTime < 0) {
                localRemainingTime = 0;
            }
            updateAllTimerDisplays();
        }
    }, 100);  // Update every 100ms for smooth animation
}

function updateAllTimerDisplays() {
    // Update pre-contest timer (if visible)
    const preContestDisplay = document.getElementById('preContestTimer');
    if (preContestDisplay) {
        displayTimeFormatted(localRemainingTime, preContestDisplay);
    }
    
    // Update running contest timer displays (if visible)
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        displayTimeFormatted(localRemainingTime, timerDisplay);
    }
    
    const timerBarDisplay = document.getElementById('contestTimerDisplay');
    if (timerBarDisplay) {
        displayTimeFormatted(localRemainingTime, timerBarDisplay);
        
        // Update color based on time remaining
        const timerBar = document.getElementById('contestTimerBar');
        if (timerBar) {
            if (localRemainingTime <= 300) {
                // Less than 5 minutes - red warning
                timerBar.style.background = 'linear-gradient(135deg, #c0392b 0%, #a93226 100%)';
                timerBarDisplay.style.color = '#ff6b6b';
            } else {
                // Normal - red
                timerBar.style.background = 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
                timerBarDisplay.style.color = 'white';
            }
        }
    }
}

function stopTimerCountdown() {
    if (timerCountdownInterval) {
        clearInterval(timerCountdownInterval);
        timerCountdownInterval = null;
    }
}

let contestPollingInterval = null;
let currentTab = 'instructions'; // Track current tab

// Update current tab when user navigates
function setCurrentTab(tabName) {
    currentTab = tabName;
}

// Check contest status once (on-demand, not polling)
async function checkContestStatusOnce() {
    try {
        const response = await fetch(`${API_URL}/contest/status`);
        if (!response.ok) throw new Error('Failed to check status');
        
        const contest = await response.json();
        
        // Check if status changed
        const statusChanged = lastContestStatus && lastContestStatus.status !== contest.status;
        const visibilityChanged = lastContestStatus && lastContestStatus.is_visible !== contest.is_visible;
        
        if (statusChanged) {
            console.log(`Contest state changed: ${lastContestStatus?.status || 'unknown'} → ${contest.status}`);
            
            // Only broadcast if this transition wasn't from an external admin broadcast
            if (window.lastBroadcastSource !== 'admin') {
                // Broadcast the phase transition so all tabs/windows update
                if (lastContestStatus?.status === 'pending' && contest.status === 'running') {
                    broadcastContestStateChange('countdown-ended', 'index-page');
                } else if (lastContestStatus?.status === 'running' && contest.status === 'ended') {
                    broadcastContestStateChange('time-ended', 'index-page');
                }
            }
        }
        
        lastContestStatus = contest;
        window.lastBroadcastSource = null;  // Clear after processing
        
        // Always update timer display (for visibility sync)
        updateTimerDisplay(contest);
        
        // If state changed, refresh display based on status
        if (statusChanged || visibilityChanged) {
            // Always update problems display when status changes, regardless of active tab
            // This ensures problems appear when contest starts (pending→running)
            await checkContestStatusAndDisplay();
        } else {
            // State unchanged - just sync timer for accuracy
            if (contest.status === 'pending' || contest.status === 'running') {
                localRemainingTime = contest.remaining_time;
            }
        }
    } catch (error) {
        console.error('Error checking contest status:', error);
    }
}

// Timer interval that checks for phase transitions
let phaseCheckInterval = null;

function startPhaseCheckTimer() {
    if (phaseCheckInterval) return; // Already running
    
    // Check status when contest is running (to detect end time)
    // Only check when contest might be ending (last 10 seconds)
    phaseCheckInterval = setInterval(async () => {
        if (lastContestStatus && lastContestStatus.status === 'running' && lastContestStatus.remaining_time <= 10) {
            // Only 10 seconds left, check for end
            await checkContestStatusOnce();
        }
    }, 1000);  // Every second when near end
}

function stopPhaseCheckTimer() {
    if (phaseCheckInterval) {
        clearInterval(phaseCheckInterval);
        phaseCheckInterval = null;
    }
}

// Initialize contest status and set up periodic checking
async function initializeContestStatus() {
    try {
        const response = await fetch(`${API_URL}/contest/status`);
        if (!response.ok) throw new Error('Failed to check contest status');
        
        const contest = await response.json();
        lastContestStatus = contest;
        updateTimerDisplay(contest);
        
        // Set up smart polling: Check for updates every 30 seconds (optimized for 400+ users)
        // Only fetch full status if something changed (lightweight check)
        if (!updateCheckInterval) {
            updateCheckInterval = setInterval(checkForUpdates, 30000);
        }
        
    } catch (error) {
        console.error('Error initializing contest status:', error);
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
            checkContestStatusOnce();  // Fetch full status and detect transitions
        }
        
        // Dynamically adjust update frequency based on remaining time
        adjustUpdateCheckInterval();
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

// Adjust update check interval based on remaining time
function adjustUpdateCheckInterval() {
    // If no interval is set, don't adjust
    if (!updateCheckInterval) return;
    
    // Clear existing interval
    clearInterval(updateCheckInterval);
    
    let newInterval = 30000; // Default: 30 seconds
    
    // When timer is under 30 seconds, check more frequently
    if (localRemainingTime > 0 && localRemainingTime <= 30) {
        // Under 30 seconds: check every 5 seconds
        newInterval = 5000;
        console.log(`⚡ Critical: checking for updates every 5 seconds (${localRemainingTime}s remaining)`);
    }
    
    // Set new interval
    updateCheckInterval = setInterval(checkForUpdates, newInterval);
}

// Update timer display on index page
function updateTimerDisplay(contest) {
    const timerBar = document.getElementById('contestTimerBar');
    const timerDisplay = document.getElementById('contestTimerDisplay');
    
    if (!timerBar || !timerDisplay) return;
    
    if (contest.status === 'running' || contest.status === 'pending') {
        // Show timer bar
        timerBar.style.display = 'block';
        
        // Update label based on status
        const timerLabel = timerBar.querySelector('div:first-child');
        if (timerLabel) {
            timerLabel.textContent = contest.status === 'pending' 
                ? 'Contest Starting In' 
                : 'Contest Time Remaining';
        }
        
        // Update background color based on status
        timerBar.style.background = contest.status === 'pending' 
            ? 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)' 
            : 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)';
        
        // Sync local timer with API
        localRemainingTime = contest.remaining_time;
        displayTimeFormatted(localRemainingTime, timerDisplay);
        
        // Start smooth countdown if not already running
        startTimerCountdown();
        
        // Only enable phase check timer if contest is actually RUNNING (not pending)
        if (contest.status === 'running') {
            startPhaseCheckTimer();
        } else {
            stopPhaseCheckTimer();  // Stop if only pending
        }
    } else if (contest.status === 'ended') {
        // Hide timer bar completely when contest ends
        timerBar.style.display = 'none';
        
        stopTimerCountdown();
        stopPhaseCheckTimer();
    }
}

// Legacy function - now just calls checkContestStatusOnce for backward compatibility
function startContestPolling() {
    // No longer polling - check is event-driven
    // This function is kept for compatibility with admin.js if needed
}

function stopContestPolling() {
    stopPhaseCheckTimer();
    if (contestPollingInterval) {
        clearInterval(contestPollingInterval);
        contestPollingInterval = null;
    }
    lastContestStatus = null;
}