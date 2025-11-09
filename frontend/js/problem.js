// Global variables
let currentProblem = null;
let allProblems = [];
let problemCache = {};  // Cache individual problems for fast switching

// DOM elements
const loadingOverlay = document.getElementById('loading-overlay');
const problemTitle = document.getElementById('problem-title');
const problemStatement = document.getElementById('problem-statement');
const problemInput = document.getElementById('problem-input');
const problemOutput = document.getElementById('problem-output');
const problemConstraints = document.getElementById('problem-constraints');
const problemConstraintsSection = document.getElementById('problem-constraints-section');
const problemExamples = document.getElementById('problem-examples');
const problemNoteSection = document.getElementById('problem-note-section');
const problemNote = document.getElementById('problem-note');
const submitBtn = document.getElementById('submit-btn');
const pageTitle = document.getElementById('page-title');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('id') || 'A';
    
    // ✅ STATIC: No contest status checking - just load problems directly
    // Load all problems once and cache them
    loadAllProblems().then(() => {
        loadProblem(problemId);
        setupProblemNavigation();
        initializeAnimations();
        
        // ✅ After displaying first problem, batch fetch ALL remaining problems
        // This preloads them for instant switching later
        setTimeout(() => {
            batchPreloadAllProblems(problemId);
        }, 100);  // Small delay to let UI render first
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

// Load all problems from local JSON files (static)
async function loadAllProblems() {
    try {
        // List of all problem IDs
        const problemIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        allProblems = [];
        
        // Load each problem JSON file
        for (const id of problemIds) {
            try {
                const response = await fetch(`./problems/${id}.json`);
                if (response.ok) {
                    const problem = await response.json();
                    allProblems.push(problem);
                }
            } catch (error) {
                // Continue loading other problems
            }
        }
        
    } catch (error) {
        showError('Failed to load problems.');
    }
}

// ✅ BATCH PRELOAD: Load ALL available problems (A-G) into cache
async function batchPreloadAllProblems(currentProblemId) {
    try {
        // All problems are already loaded by loadAllProblems()
        // Just cache them if not already cached
        allProblems.forEach(problem => {
            if (!problemCache[problem.id]) {
                problemCache[problem.id] = problem;
            }
        });
        
    } catch (error) {
        // Cache preload error
    }
}

// Load a specific problem from API
function loadProblem(problemId) {
    // Check cache FIRST before showing spinner
    if (problemCache[problemId]) {
        currentProblem = problemCache[problemId];
        updateActiveNavLink(problemId);
        
        // Display instantly (no loading overlay)
        displayProblem(currentProblem);
        
        return;  // ← EARLY EXIT: NO SPINNER SHOWN ✨
    }
    
    // Problem not in cache - show loading and wait for batch preload to complete
    showLoading(true);
    
    // Wait for batch preload with timeout (max 2 seconds)
    const waitStart = Date.now();
    const checkCache = setInterval(() => {
        if (problemCache[problemId]) {
            clearInterval(checkCache);
            currentProblem = problemCache[problemId];
            updateActiveNavLink(problemId);
            displayProblem(currentProblem);
            showLoading(false);
        } else if (Date.now() - waitStart > 2000) {
            // Timeout - show error
            clearInterval(checkCache);
            showError(`Problem ${problemId} not found.`);
            showLoading(false);
        }
    }, 50);
}

// Display problem content
function displayProblem(problem) {
    // CLEAR ALL FIELDS FIRST to prevent any cached data from showing
    problemStatement.innerHTML = '';
    problemInput.innerHTML = '';
    problemOutput.innerHTML = '';
    problemConstraints.innerHTML = '';
    problemExamples.innerHTML = '';
    problemNote.innerHTML = '';
    if (problemNoteSection) {
        problemNoteSection.style.display = 'none';
    }
    if (problemConstraintsSection) {
        problemConstraintsSection.style.display = 'none';
    }
    
    // Update page title
    if (pageTitle) {
        pageTitle.textContent = `${problem.id} - ${problem.title} - ACM Skill Prep`;
    }
    
    // Update problem header - VJudge style simple title
    problemTitle.textContent = `${problem.id} - ${problem.title}`;
    
    // Update problem content - only use what's in the API response
    problemStatement.innerHTML = problem.statement || '';
    problemInput.innerHTML = problem.input || '';
    problemOutput.innerHTML = problem.output || '';
    
    // Update constraints - hide entire section if not present in API response
    if (problem.constraints) {
        problemConstraints.innerHTML = problem.constraints;
        if (problemConstraintsSection) {
            problemConstraintsSection.style.display = 'block';
        }
    } else {
        // Hide constraints section completely if not available
        if (problemConstraintsSection) {
            problemConstraintsSection.style.display = 'none';
        }
    }
    
    // Update examples - show only if present in API response
    if (problem.samples && problem.samples.length > 0) {
        problemExamples.innerHTML = createExamplesTable(problem.samples);
    } else {
        problemExamples.innerHTML = 'No examples provided.';
    }
    
    // Show note section if problem has notes (only if present in API response)
    if (problem.note) {
        problemNote.innerHTML = problem.note;
        if (problemNoteSection) {
            problemNoteSection.style.display = 'block';
        }
    } else {
        // Keep note hidden and empty
        problemNote.innerHTML = '';
        if (problemNoteSection) {
            problemNoteSection.style.display = 'none';
        }
    }
    
    // Update sidebar info - use ONLY what's in the API response
    const timeLimitElement = document.getElementById('problem-time-limit');
    const memoryLimitElement = document.getElementById('problem-memory-limit');
    
    // Only display if field exists in API response, otherwise show '-'
    if (timeLimitElement) {
        timeLimitElement.textContent = (problem.timeLimit !== undefined ? problem.timeLimit : 
                                        problem.time_limit !== undefined ? problem.time_limit : '-');
    }
    if (memoryLimitElement) {
        memoryLimitElement.textContent = (problem.memoryLimit !== undefined ? problem.memoryLimit : 
                                          problem.memory_limit !== undefined ? problem.memory_limit : '-');
    }
    
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

// ==================== End of File ====================