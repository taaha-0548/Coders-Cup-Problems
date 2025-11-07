# Coder's Cup - Problems Platform

A modern, competitive programming practice platform featuring the Coder's Cup theme with a professional interface for solving algorithmic challenges.

## 🚀 Features

- **Modern Dark Theme** - Professional gradient design with red/dark navy color scheme
- **Coder's Cup Branding** - Themed hero section with trophy logo
- **Problem Display** - Complete problem statements with input/output specs and examples
- **Responsive Design** - Seamlessly works on desktop, tablet, and mobile
- **Clean Navigation** - Easy tab switching between Instructions and Problems
- **VJudge Integration** - Direct submission links for solutions
- **Offline Capable** - Fully functional without backend dependencies

## 📁 Project Structure

```
acmskill_prep_problems/
├── index.html                    # Main page with hero section
├── problem.html                  # Individual problem display
├── problems/                     # Problem data files
│   ├── A.json
│   ├── B.json
│   ├── C.json
│   ├── D.json
│   └── E.json
├── js/
│   ├── main.js                  # Main page logic
│   └── problem.js               # Problem page logic
├── css/
│   ├── style.css                # Main styling (1140+ lines)
│   ├── problem-clean.css        # Problem page styling
│   └── theme.css                # Design system with components
├── assets/
│   ├── acm-logo.png             # ACM logo (header)
│   ├── coderscup-hero.png       # Coder's Cup trophy (hero section)
│   └── favicon.ico
├── server.py                    # Optional local server
└── README.md
```

## 🎨 Design System

### Color Palette
- **Primary Red**: `#DC143C` (Crimson - buttons, highlights, active states)
- **Dark Navy**: `#1a1a2e` (Headers, text, dark backgrounds)
- **Light Red**: `#FF4444` (Hover states, accents)
- **Cream Background**: `#FEFDFB` (Main page background)
- **White**: Cards and content sections with red borders

### Typography
- **Montserrat**: Hero section titles and headings
- **Cascadia Code**: Body text and problem content
- **Geist**: UI elements and navigation

## 🏃‍♂️ How to Run

### Method 1: Python HTTP Server (Recommended)

```bash
cd acmskill_prep_problems
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

### Method 2: Live Server (VS Code)

1. Install "Live Server" extension
2. Right-click on `index.html`
3. Select "Open with Live Server"

### Method 3: Direct File Opening

Double-click `index.html` (Note: Some features may have CORS restrictions)

## 📋 Page Structure

### index.html
- **Header**: Coder's Cup branding with ACM logo and tagline
- **Navigation**: Instructions and Problem tabs
- **Hero Section**: Cup logo with title "CODER'S CUP: Competitive Programming"
- **Content Area**: Dynamically loaded instructions or problems table

### problem.html
- **Header**: Same as index.html
- **Navigation**: Instructions tab + Problem tabs (A-E)
- **Main Content**: Problem statement, input/output, constraints, examples
- **Sidebar**: Submit button and problem metadata (time/memory limits)

## 📝 Adding New Problems

Create a JSON file in the `problems/` folder following this structure:

```json
{
  "id": "F",
  "title": "Problem Title",
  "timeLimit": "2000ms",
  "memoryLimit": "512MB",
  "statement": "Problem description...",
  "input": "Input format...",
  "output": "Output format...",
  "constraints": "Constraints...",
  "samples": [
    {
      "input": "sample input",
      "output": "expected output"
    }
  ],
  "vj_link": "https://vjudge.net/problem/..."
}
```

Then update `js/main.js`:
```javascript
const problemFiles = ['A.json', 'B.json', 'C.json', 'D.json', 'E.json', 'F.json'];
```

## � Key Features

### Responsive Design
- Desktop optimized at 1200px+
- Tablet layouts at 768px-1023px
- Mobile layouts below 768px

### Theme Consistency
- Red borders on instruction and problem sections
- Unified cream background throughout
- Dark navy header/navigation
- Animated chevrons and hover effects

### User Experience
- One-click problem navigation (A-E buttons)
- Tab-based content switching with URL history support
- Smooth animations and transitions
- Clean, readable typography

## 🔧 Customization

### Change Colors
Edit CSS variables in the files:
- Main colors in `css/style.css` lines 1-20
- Problem page colors in `css/problem-clean.css` lines 1-20

### Update Branding
- Replace `assets/coderscup-hero.png` with your logo
- Modify hero section text in `index.html` lines 42-46
- Update header tagline from "Code. Compete. Conquer."

### Modify Instructions
Edit the `showInstructions()` function in `js/main.js` (around line 130)

## 🌐 Network Sharing

Share over local network:

```bash
# Find your IP
ipconfig          # Windows
ifconfig          # Mac/Linux

# Start server
python -m http.server 8000

# Access from other device
http://YOUR_IP:8000
```

## 📱 Browser Support

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers
- ⚠️ IE11 (not supported)

## � Troubleshooting

| Issue | Solution |
|-------|----------|
| Problems not loading | Verify JSON files are valid, check file names match `problemFiles` array |
| CSS not applying | Clear cache (Ctrl+Shift+R), verify `css/` folder exists |
| Hero section too large | Adjust hero section padding/sizing in `css/style.css` lines 243-250 |
| Navigation not centered | Check `.contest-nav .container` has `justify-content: center` |
| Red borders missing | Verify `.instructions-content` and `.problems-table-container` have border CSS |

## � Statistics

- **CSS Lines**: 1140+ (style.css) + 641+ (problem-clean.css)
- **JavaScript**: 300+ lines per page
- **Responsive Breakpoints**: 3 (desktop, tablet, mobile)
- **Color Palette**: 6 main colors + gradients
- **Animation Keyframes**: 5+ custom animations

## 💡 Tips

1. Test problems locally before competitions
2. Verify VJudge links work correctly
3. Keep JSON files organized and validated
4. Keep problem metadata consistent across problems
5. Add meaningful problem notes for participants

## 📄 License

Open source project for educational use.

---

**Welcome to Coder's Cup! � Code. Compete. Conquer.**