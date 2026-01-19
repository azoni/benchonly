# BenchPressOnly 🏋️

AI-powered workout tracking for serious lifters. Track workouts, set goals, manage groups, and get AI recommendations.

## Features

- **Workout Tracking** - Log exercises with sets, reps, weight, RPE, and pain levels
- **AI Recommendations** - Get personalized workout suggestions based on your goals and history
- **Goal Setting** - Set strength targets with timelines and track progress
- **Group Management** - Create workout groups and track team attendance
- **Calendar View** - Schedule workouts, mark vacations, track consistency
- **AI Assistant** - Ask questions about your workouts, progress, and form
- **Token Usage Dashboard** - Monitor AI API usage by user

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion
- **Backend**: Firebase (Auth + Firestore), Netlify Functions
- **AI**: OpenAI GPT-4 Turbo
- **State**: Zustand with persistence
- **PWA**: Service worker, offline support

## Setup Instructions

### 1. Clone and Install

```bash
cd benchpressonly
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project called "benchpressonly"
3. Enable **Authentication** → Sign-in method → Google
4. Enable **Firestore Database** → Start in production mode
5. Go to Project Settings → Your Apps → Add Web App
6. Copy the config values

### 3. Firestore Security Rules

In Firestore → Rules, add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Workouts - users can manage their own
    match /workouts/{workoutId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    
    // Goals - users can manage their own
    match /goals/{goalId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    
    // Groups - members can read, admins can write
    match /groups/{groupId} {
      allow read: if request.auth != null && 
        request.auth.uid in resource.data.members;
      allow write: if request.auth != null && 
        request.auth.uid in resource.data.admins;
      allow create: if request.auth != null;
    }
    
    // Schedules
    match /schedules/{scheduleId} {
      allow read, write: if request.auth != null;
    }
    
    // Attendance
    match /attendance/{attendanceId} {
      allow read, write: if request.auth != null;
    }
    
    // Token usage - only for admin reads
    match /tokenUsage/{usageId} {
      allow read: if request.auth != null;
      allow write: if false; // Only server writes
    }
  }
}
```

### 4. Environment Variables

Create a `.env` file in the root directory:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# OpenAI (used by Netlify Functions - set in Netlify dashboard)
OPENAI_API_KEY=your_openai_api_key
```

### 5. Local Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 6. Deploy to Netlify

#### Option A: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

#### Option B: GitHub Integration

1. Push to GitHub
2. Go to [Netlify](https://app.netlify.com/)
3. New site from Git → Select repo
4. Build settings are auto-detected from `netlify.toml`

#### Configure Environment Variables in Netlify

1. Site Settings → Environment Variables
2. Add all the Firebase config variables (VITE_FIREBASE_*)
3. Add OPENAI_API_KEY

### 7. Custom Domain

1. Domain Settings → Add custom domain
2. Add DNS records for `benchpressonly.com`:
   - A record: Netlify's load balancer IP
   - Or CNAME: your-site.netlify.app

## Project Structure

```
benchpressonly/
├── public/
│   ├── favicon.svg          # App icon
│   ├── pwa-192x192.png      # PWA icon
│   ├── pwa-512x512.png      # PWA icon
│   └── apple-touch-icon.png # iOS icon
├── src/
│   ├── components/
│   │   ├── Layout.jsx       # Main layout with sidebar
│   │   └── AIChatPanel.jsx  # Floating AI assistant
│   ├── context/
│   │   └── AuthContext.jsx  # Firebase auth provider
│   ├── pages/
│   │   ├── LoginPage.jsx    # Google sign-in
│   │   ├── DashboardPage.jsx
│   │   ├── WorkoutsPage.jsx
│   │   ├── NewWorkoutPage.jsx
│   │   ├── WorkoutDetailPage.jsx
│   │   ├── CalendarPage.jsx
│   │   ├── GroupsPage.jsx
│   │   ├── GroupDetailPage.jsx
│   │   ├── GoalsPage.jsx
│   │   ├── UsagePage.jsx
│   │   └── SettingsPage.jsx
│   ├── services/
│   │   ├── firebase.js      # Firebase config
│   │   ├── firestore.js     # Database operations
│   │   └── api.js           # Netlify Functions client
│   ├── store/
│   │   └── index.js         # Zustand stores
│   ├── App.jsx              # Routes
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── netlify/
│   └── functions/
│       ├── generate-workout.js
│       ├── ask-assistant.js
│       ├── autofill-workout.js
│       ├── analyze-progress.js
│       └── token-usage.js
├── netlify.toml             # Netlify config
├── vite.config.js           # Vite + PWA config
├── tailwind.config.js       # Design system
└── package.json
```

## Design System

The app uses a "brutalist-fitness" aesthetic:

- **Colors**: Iron grays, flame orange/red accents
- **Typography**: Bebas Neue (display), Outfit (body)
- **Theme**: Dark theme with noise texture
- **Components**: Steel cards, flame accents, subtle glows

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## License

Private project - All rights reserved
