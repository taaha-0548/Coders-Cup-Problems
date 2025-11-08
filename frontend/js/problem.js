// Global variables
let currentProblem = null;
let allProblems = [];
let lastContestStatus = null;  // Track previous status to detect transitions
let statusPollingInterval = null;
let timerCountdownInterval = null;
let phaseCheckTimer = null;
let localRemainingTime = 0;
let lastUpdateCheck = 0;  // Track last-update timestamp for smart polling
let updateCheckInterval = null;  // Poll for updates every 5 seconds

// API URL - dynamically set based on current domain
const API_URL = window.location.origin + '/api';

// Broadcast contest state changes to other tabs/windows
function broadcastContestStateChange(action, source = 'problem-page') {
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
const loadingOverlay = document.getElementById('loading-overlay');
const problemTitle = document.getElementById('problem-title');
const problemStatement = document.getElementById('problem-statement');
const problemInput = document.getElementById('problem-input');
const problemOutput = document.getElementById('problem-output');
const problemConstraints = document.getElementById('problem-constraints');
const problemExamples = document.getElementById('problem-examples');
const problemNoteSection = document.getElementById('problem-note-section');
const problemNote = document.getElementById('problem-note');
const submitBtn = document.getElementById('submit-btn');
const pageTitle = document.getElementById('page-title');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('id') || 'A';
    
    // Initialize contest status and timer
    checkContestStatus().then(contest => {
        // Only allow access if contest is running
        if (contest && contest.status !== 'running') {
            // Block access - redirect to index
            showAccessDenied(contest);
            return;  // Don't load problem
        }
        
        // Contest is running - proceed with loading
        // Load all problems once and cache them
        loadAllProblems().then(() => {
            loadProblem(problemId);
            setupProblemNavigation();
            initializeAnimations();
        });
    });
    
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
    
    // Listen for broadcast events from admin or other tabs
    window.addEventListener('storage', window.handleStorageEvent);
    
    // Cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', function() {
        window.removeEventListener('storage', window.handleStorageEvent);
        if (updateCheckInterval) clearInterval(updateCheckInterval);
        if (timerCountdownInterval) clearInterval(timerCountdownInterval);
    });
});

// Initialize animations and interactions
function initializeAnimations() {
    // Make logo clickable
    const logo = document.querySelector('.contest-logo');
    if (logo) {
        logo.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    
    // Add scroll animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    });
    
    // Observe problem sections
    setTimeout(() => {
        const sections = document.querySelectorAll('.problem-section');
        sections.forEach((section, index) => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(20px)';
            section.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
            observer.observe(section);
        });
    }, 300);
}

// Load all problems from API to support navigation
async function loadAllProblems() {
    try {
        console.log('Loading all problems from API...');
        const response = await fetch(`${API_URL}/problems`);
        
        if (!response.ok) {
            throw new Error(`API returned status ${response.status}`);
        }
        
        allProblems = await response.json();
        console.log(`✓ Loaded ${allProblems.length} problems from API`);
        
    } catch (error) {
        console.error('Error loading problems:', error);
        showError('Failed to load problems. Make sure the backend server is running at ' + API_URL);
    }
}

// Load a specific problem from API
function loadProblem(problemId) {
    console.log('Loading problem:', problemId);
    console.log('Available problems:', allProblems.map(p => p.id));
    showLoading(true);
    
    const problem = allProblems.find(p => p.id === problemId);
    if (!problem) {
        console.error(`Problem ${problemId} not found in`, allProblems);
        showError(`Problem ${problemId} not found.`);
        return;
    }
    
    // Fetch full problem details from API
    fetch(`${API_URL}/problems/${problemId}`)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to fetch problem ${problemId}`);
            return response.json();
        })
        .then(fullProblem => {
            currentProblem = fullProblem;
            displayProblem(fullProblem);
            updateActiveNavLink(problemId);
            showLoading(false);
        })
        .catch(error => {
            console.error(`Error loading problem ${problemId}:`, error);
            showError(`Failed to load problem. ${error.message}`);
            showLoading(false);
        });
}

// Display problem content
function displayProblem(problem) {
    // Update page title
    if (pageTitle) {
        pageTitle.textContent = `${problem.id} - ${problem.title} - ACM Skill Prep`;
    }
    
    // Update problem header - VJudge style simple title
    problemTitle.textContent = `${problem.id} - ${problem.title}`;
    
    // Update problem content - direct HTML rendering
    problemStatement.innerHTML = problem.statement;
    problemInput.innerHTML = problem.input;
    problemOutput.innerHTML = problem.output;
    
    // Update constraints
    if (problem.constraints) {
        problemConstraints.innerHTML = problem.constraints;
    } else {
        problemConstraints.innerHTML = "No constraints specified.";
    }
    
    // Update examples
    if (problem.samples && problem.samples.length > 0) {
        problemExamples.innerHTML = createExamplesTable(problem.samples);
    } else {
        problemExamples.innerHTML = 'No examples provided.';
    }
    
    // Show note section if problem has notes
    if (problem.note) {
        problemNote.innerHTML = problem.note;
        if (problemNoteSection) {
            problemNoteSection.style.display = 'block';
        }
    } else {
        if (problemNoteSection) {
            problemNoteSection.style.display = 'none';
        }
    }
    
    // Update sidebar info - simplified (difficulty removed)
    const timeLimitElement = document.getElementById('problem-time-limit');
    const memoryLimitElement = document.getElementById('problem-memory-limit');
    
    if (timeLimitElement) timeLimitElement.textContent = problem.timeLimit || problem.time_limit || '-';
    if (memoryLimitElement) memoryLimitElement.textContent = problem.memoryLimit || problem.memory_limit || '-';
    
    // Update submit button
    if (submitBtn) {
        submitBtn.onclick = () => {
            window.open(problem.vjLink || problem.vj_link, '_blank');
        };
    }
}

// Create examples table
function createExamplesTable(samples) {
    let html = '<table class="examples-table">';
    html += '<thead><tr><th>Input</th><th>Output</th></tr></thead>';
    html += '<tbody>';
    
    samples.forEach((sample, index) => {
        const inputId = `input-${index}`;
        const outputId = `output-${index}`;
        
        html += `
            <tr>
                <td>
                    <div style="position: relative;">
                        <pre id="${inputId}">${sample.input}</pre>
                        <button class="copy-btn" onclick="copyToClipboard(document.getElementById('${inputId}').textContent, 'Input')" title="Copy Input">Copy</button>
                    </div>
                </td>
                <td>
                    <div style="position: relative;">
                        <pre id="${outputId}">${sample.output}</pre>
                        <button class="copy-btn" onclick="copyToClipboard(document.getElementById('${outputId}').textContent, 'Output')" title="Copy Output">Copy</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    return html;
}

// Copy text to clipboard
function copyToClipboard(text, type) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${type} to clipboard!`);
    }).catch(() => {
        showToast('Failed to copy to clipboard.');
    });
}

// Setup problem navigation
function setupProblemNavigation() {
    const navLinks = document.querySelectorAll('.problem-nav-link');
    
    navLinks.forEach(link => {
        const problemId = link.getAttribute('data-problem');
        
        // Check if problem exists
        const problemExists = allProblems.some(p => p.id === problemId);
        if (!problemExists) {
            link.style.display = 'none';
            return;
        }
        
        link.href = `problem.html?id=${problemId}`;
        
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update URL without page reload
            const newUrl = `problem.html?id=${problemId}`;
            window.history.pushState({problemId}, '', newUrl);
            
            loadProblem(problemId);
        });
    });
}

// Update active navigation link
function updateActiveNavLink(problemId) {
    const navLinks = document.querySelectorAll('.problem-nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-problem') === problemId) {
            link.classList.add('active');
        }
    });
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.problemId) {
        loadProblem(e.state.problemId);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const problemId = urlParams.get('id') || 'A';
        loadProblem(problemId);
    }
});

// Show/hide loading overlay
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Show error message
function showError(message) {
    if (problemStatement) {
        problemStatement.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #e74c3c;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="window.location.href='index.html'" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 15px;">
                    Back to Practice
                </button>
            </div>
        `;
    }
    showLoading(false);
}

// Show toast notification
function showToast(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        font-weight: 500;
        z-index: 3000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Arrow keys for navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        navigateProblem(e.key === 'ArrowLeft' ? -1 : 1);
    }
    
    // Escape to go back to practice
    if (e.key === 'Escape') {
        window.location.href = 'index.html';
    }
});

// Navigate to next/previous problem
function navigateProblem(direction) {
    if (!currentProblem) return;
    
    const currentIndex = allProblems.findIndex(p => p.id === currentProblem.id);
    const newIndex = currentIndex + direction;
    
    if (newIndex >= 0 && newIndex < allProblems.length) {
        const newProblemId = allProblems[newIndex].id;
        const newUrl = `problem.html?id=${newProblemId}`;
        window.history.pushState({problemId: newProblemId}, '', newUrl);
        loadProblem(newProblemId);
    }
}

// Show access denied message
function showAccessDenied(contest) {
    const container = document.querySelector('.problem-view') || document.querySelector('#main-container');
    if (!container) return;
    
    let message = '';
    if (!contest) {
        message = 'Unable to verify contest status. Please try again.';
    } else if (contest.status === 'pending') {
        message = 'Contest has not started yet. Please wait for the countdown to end.';
    } else if (contest.status === 'ended') {
        message = 'Contest has ended. No longer accepting solutions.';
    } else {
        message = 'You do not have permission to access this problem.';
    }
    
    container.innerHTML = `
        <div style="
            text-align: center;
            padding: 60px 20px;
            min-height: 400px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 8px;
            margin: 20px;
        ">
            <div style="
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                max-width: 500px;
            ">
                <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                <p style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 10px;">Access Denied</p>
                <p style="font-size: 16px; color: #666; margin-bottom: 20px;">${message}</p>
                <a href="index.html" style="
                    display: inline-block;
                    padding: 10px 20px;
                    background: #3498db;
                    color: white;
                    text-decoration: none;
                    border-radius: 4px;
                    font-weight: bold;
                    transition: background 0.3s;
                ">Return to Home</a>
            </div>
        </div>
    `;
}

// ==================== Contest Timer Functions ====================

// Check contest status periodically
async function checkContestStatus() {
    try {
        const response = await fetch(`${API_URL}/contest/status`);
        if (!response.ok) throw new Error('Failed to check contest status');
        
        const contest = await response.json();
        lastContestStatus = contest;
        updateTimerDisplay(contest);
        
        // Handle problem visibility based on status
        handleProblemVisibilityByStatus(contest);
        
        // Set up smart polling: Check for updates every 30 seconds (optimized for 400+ users)
        // Only fetch full status if something changed (lightweight check)
        if (!updateCheckInterval) {
            updateCheckInterval = setInterval(checkForUpdates, 30000);
        }
        
        // Return contest so caller can check status
        return contest;
    } catch (error) {
        console.error('Error checking contest status:', error);
        return null;  // Return null so caller knows there was an error
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
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}

// Check status once
async function checkContestStatusOnce() {
    try {
        console.log('Checking contest status once (from problem.js)');
        const response = await fetch(`${API_URL}/contest/status`);
        if (!response.ok) throw new Error('Failed to check contest status');
        
        const contest = await response.json();
        
        // Detect status transitions and broadcast them (only if we detected the transition, not from external broadcast)
        if (lastContestStatus && lastContestStatus.status !== contest.status) {
            console.log(`Contest state changed: ${lastContestStatus.status} → ${contest.status}`);
            
            // Only broadcast if this transition wasn't from an external admin broadcast
            if (window.lastBroadcastSource !== 'admin') {
                if (lastContestStatus.status === 'pending' && contest.status === 'running') {
                    broadcastContestStateChange('countdown-ended', 'problem-page');
                } else if (lastContestStatus.status === 'running' && contest.status === 'ended') {
                    broadcastContestStateChange('time-ended', 'problem-page');
                }
            }
        }
        
        lastContestStatus = contest;
        window.lastBroadcastSource = null;  // Clear after processing
        updateTimerDisplay(contest);
        
        // Handle contest state visibility
        handleProblemVisibilityByStatus(contest);
        
    } catch (error) {
        console.error('Error checking contest status:', error);
    }
}

// Handle showing/hiding problem based on contest status
function handleProblemVisibilityByStatus(contest) {
    const problemContainer = document.querySelector('.problem-view');
    const pageTitle = document.getElementById('page-title');
    
    if (!problemContainer) return;
    
    if (contest.is_visible && contest.status === 'pending') {
        // Contest is pending - hide problem, show countdown message
        problemContainer.style.display = 'none';
        if (pageTitle) {
            pageTitle.innerHTML = '<p style="text-align: center; color: #888; font-size: 16px;">Contest will start soon...</p>';
        }
    } else if (contest.status === 'ended') {
        // Contest ended - hide problem, show ended message
        problemContainer.style.display = 'none';
        if (pageTitle) {
            pageTitle.innerHTML = '<p style="text-align: center; color: #d9534f; font-size: 16px; font-weight: bold;">Contest Ended</p>';
        }
    } else if (contest.status === 'running' || !contest.is_visible) {
        // Contest is running or timer not visible - show problem
        problemContainer.style.display = 'block';
    }
}

// Update timer display on problem page
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
        
        // Disable submit button
        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Contest Ended';
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';
        }
    }
}

function displayTimeFormatted(seconds, element) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    element.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Local countdown that ticks every 100ms for smooth animation
function startTimerCountdown() {
    if (timerCountdownInterval) return;  // Already running
    
    timerCountdownInterval = setInterval(() => {
        if (localRemainingTime > 0) {
            localRemainingTime -= 0.1;  // Decrease by 100ms
            updateAllTimerDisplays();
        }
    }, 100);  // Update every 100ms for smooth animation
}

function stopTimerCountdown() {
    if (timerCountdownInterval) {
        clearInterval(timerCountdownInterval);
        timerCountdownInterval = null;
    }
}

function updateAllTimerDisplays() {
    const timerBarDisplay = document.getElementById('contestTimerDisplay');
    if (timerBarDisplay) {
        displayTimeFormatted(localRemainingTime, timerBarDisplay);
    }
}

// Phase check timer - only check when necessary
function startPhaseCheckTimer() {
    if (phaseCheckTimer) return;
    
    phaseCheckTimer = setInterval(() => {
        // Only check during last 10 seconds of a RUNNING contest
        // Don't check if timer is 0, not initialized, or if contest hasn't started
        if (localRemainingTime > 0 && localRemainingTime <= 10) {
            console.log(`Near end of contest (${localRemainingTime}s remaining), checking status for transition to ended`);
            checkContestStatusOnce();
        }
    }, 1000);
}

function stopPhaseCheckTimer() {
    if (phaseCheckTimer) {
        clearInterval(phaseCheckTimer);
        phaseCheckTimer = null;
    }
}