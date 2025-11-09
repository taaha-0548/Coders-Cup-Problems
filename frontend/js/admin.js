// Admin Panel JavaScript - Static Version
let isLoggedIn = false;
let editingProblemId = null;
let sampleCount = 0;

// Local problems data storage (from JSON files)
let allProblems = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    // Add sample input on load
    addSampleInput();
});

// Check if user is already logged in
function checkLoginStatus() {
    const isAdmin = sessionStorage.getItem('adminLoggedIn');
    if (isAdmin === 'true') {
        isLoggedIn = true;
        showAdminPanel();
        loadProblemsForManagement();
    }
}

// Login function
async function loginAdmin() {
    const password = document.getElementById('adminPassword').value;
    
    if (!password) {
        showMessage('error', 'Please enter a password', 'loginMessage');
        return;
    }
    
    try {
        // ⚠️ IMPORTANT: Wait for config to load from .env
        await configReady;
        
        // Check password from CONFIG (loaded from .env)
        if (password === CONFIG.ADMIN_PASSWORD) {
            sessionStorage.setItem('adminLoggedIn', 'true');
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
        showMessage('error', 'Error: ' + error.message, 'loginMessage');
    }
}

// Logout function
function logoutAdmin() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminLoggedIn');
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

// Save problem to local JSON files
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
    if (!problemId || !title || !statement || !input || !output || !vjLink) {
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
        
        // Store in local memory/localStorage
        allProblems[problemId] = problemData;
        
        // Save to localStorage for persistence
        localStorage.setItem(`problem_${problemId}`, JSON.stringify(problemData));
        
        // Also update the main problems list
        updateProblemsDirectory();
        
        showMessage('success', editingProblemId ? 'Problem updated successfully!' : 'Problem added successfully!', 'message');
        
        // Generate download link for JSON file
        const jsonText = JSON.stringify(problemData, null, 2);
        const blob = new Blob([jsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${problemId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showMessage('success', `Problem saved! JSON file downloaded. Replace ${problemId}.json in frontend/problems/`, 'message');
        
        resetForm();
        editingProblemId = null;
        setTimeout(() => loadProblemsForManagement(), 500);
        
    } catch (error) {
        showMessage('error', `Error: ${error.message}`, 'message');
    }
}

// Load problems from local JSON files
async function loadProblemsForManagement() {
    try {
        // Clear existing
        allProblems = {};
        
        // Load all problems from frontend/problems directory
        const problemIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        
        for (const id of problemIds) {
            try {
                const response = await fetch(`./problems/${id}.json`);
                if (response.ok) {
                    const data = await response.json();
                    allProblems[id] = data;
                } else {
                    // Problem file doesn't exist yet
                }
            } catch (error) {
                // Error loading problem file
            }
        }
        
        // Also load from localStorage (saved via admin panel)
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('problem_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    allProblems[data.id] = data;
                } catch (error) {
                    // Error parsing stored problem
                }
            }
        }
        
        displayProblemsTable(Object.values(allProblems).sort((a, b) => a.id.localeCompare(b.id)));
        
    } catch (error) {
        const container = document.getElementById('problemsTableContainer');
        container.innerHTML = `<div class="message error">Error loading problems: ${error.message}</div>`;
    }
}

// Display problems table
function displayProblemsTable(problems) {
    const container = document.getElementById('problemsTableContainer');
    
    if (problems.length === 0) {
        container.innerHTML = '<p style="padding: 20px;">No problems found. Create one to get started!</p>';
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
                <td>${problem.timeLimit || '-'}</td>
                <td>${problem.memoryLimit || '-'}</td>
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
        // Try to get from memory first
        let problem = allProblems[problemId];
        
        // If not in memory, try to fetch from JSON file
        if (!problem) {
            const response = await fetch(`./problems/${problemId}.json`);
            if (response.ok) {
                problem = await response.json();
            } else {
                throw new Error('Problem not found');
            }
        }
        
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
        // Remove from memory
        delete allProblems[problemId];
        
        // Remove from localStorage
        localStorage.removeItem(`problem_${problemId}`);
        
        showMessage('success', 'Problem deleted successfully!', 'managingMessage');
        setTimeout(() => loadProblemsForManagement(), 500);
        
    } catch (error) {
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

// Update problems directory (used to sync saved problems)
function updateProblemsDirectory() {
    // In a static setup, we'd need to download the JSON
    // For now, just store in localStorage
}
