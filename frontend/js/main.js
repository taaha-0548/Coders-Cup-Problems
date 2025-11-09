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
        
        // ⚠️ IMPORTANT: Wait for config to load from .env
        await configReady;
        
        // ✅ STATIC: Check password from CONFIG (environment variable or default)
        if (password === CONFIG.CONTEST_PASSWORD) {
            setUserAuthenticated();
            document.getElementById('passwordModal').classList.add('hidden');
            hideLoading();
            // Reload to show main content
            location.reload();
        } else {
            errorDiv.textContent = 'Invalid password';
            errorDiv.style.display = 'block';
            document.getElementById('passwordInput').value = '';
        }
    } catch (error) {
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

// API URL - dynamically set based on current domain
// (Already defined above in password section)

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
    showLoading('Loading problems...');
    
    initializeTabClicks();  // Add click handlers to tab links
    initializeAnimations();
    initializeNavigation();  // Initialize navigation
    loadProblems();  // Load problems from JSON
    hideLoading();
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

// Load all problems from local JSON files (static)
async function loadProblems() {
    try {
        // List of all problem IDs available
        const problemIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        
        // Load each problem JSON file
        allProblems = [];
        
        for (const id of problemIds) {
            try {
                const response = await fetch(`./problems/${id}.json`);
                if (response.ok) {
                    const problem = await response.json();
                    allProblems.push(problem);
                }
            } catch (error) {
                // Continue loading other problems even if one fails
            }
        }
        
        lastProblemsUpdateTime = Date.now();
        displayProblems(); // Display loaded problems
    } catch (error) {
        showError('Failed to load problems.');
        hideLoading();
    }
}

// Display problems in the table
function displayProblems() {
    // Get fresh reference to the tbody element
    const tbody = document.getElementById('problems-tbody');
    if (!tbody) {
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
    displayProblemsTable();
    displayProblems();
    hideLoading();
}

// Display the problems table
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
    `;
}



// Display problems from JSON

let currentTab = 'instructions'; // Track current tab


// Update current tab when user navigates
function setCurrentTab(tabName) {
    currentTab = tabName;
}

// Check contest status once (on-demand, not polling)
async function checkContestStatusOnce() {
    // ✅ STATIC: No backend - just display problems
    // No status checking needed
}

// Timer interval that checks for phase transitions
let phaseCheckInterval = null;

function startPhaseCheckTimer() {
    // ✅ STATIC: No timer checking needed
}

function stopPhaseCheckTimer() {
    if (phaseCheckInterval) {
        clearInterval(phaseCheckInterval);
        phaseCheckInterval = null;
    }
}

// Initialize contest status and set up periodic checking

