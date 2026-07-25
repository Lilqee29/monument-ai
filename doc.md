# Monument AI (Relica) Documentation

Welcome to the comprehensive documentation for **Monument AI** (internally referenced as **Relica**). This document serves as a guide to the project's architecture, file structure, and technical capabilities.

---

## 📂 Project Structure Overview

The project is an **Expo (React Native)** application utilizing a modern stack for cross-platform mobile development, AI integration, and real-time backend services.

### 📍 Root Directory Contents

| File / Folder | Description |
| :--- | :--- |
| `app/` | Core application routing and screen components using Expo Router. |
| `components/` | Reusable UI components and themed elements. |
| `lib/` | Infrastructure layer: AI services, database clients, and business logic. |
| `constants/` | Global configuration: Colors, landmarks data, and theme tokens. |
| `hooks/` | Custom React hooks for stateful logic (Gallery, Theme, etc.). |
| `assets/` | Static resources (images, fonts, adaptive icons). |
| `supabase_schema.sql` | PostgreSQL schema for the Supabase backend. |
| `features_roadmap.md` | Tracking document for development progress and future plans. |
| `app.json` | Expo configuration file for app identity and plugins. |
| `tailwind.config.js` | Configuration for **NativeWind** (Tailwind CSS). |

---

## 🏗️ Application Architecture (`/app`)

This project uses **Expo Router** for file-based navigation, ensuring a clean and predictable routing structure.

### 📂 Directory Breakdown

#### `(auth)/`
Handles user identity and session management.
- Integrates with **Clerk** for secure authentication.
- Contains screens for Sign-in and Sign-up.

#### `(tabs)/`
The primary navigation hub of the app.
- **Home (`index`)**: Dashboard with overview and quick actions.
- **Map (`worldmap`)**: Interactive explorer using **React Native Maps**.
- **Collection (`collection`)**: A gallery of "Captured Memories" and visited landmarks.
- **Profile (`settings`)**: User preferences, account management, and language settings.

#### 🎮 Game & Interaction Screens
- **`quiz.tsx`**: Interactive AI-generated quizzes about specific monuments.
- **`result.tsx`**: Dynamic feedback screen showing XP gained and quiz performance.
- **`onboarding.tsx`**: Guided entry for new users, explaining the core loop.

---

## ⚙️ Core Infrastructure (`/lib`)

The `lib` directory contains the engine that powers Monument AI's unique features.

- **`ai.ts` / `aiReal.ts`**: Handles prompts and responses for generating monument history and interactive Q&A.
- **`supabase.ts`**: Configures the connection to **Supabase** for persistent storage.
- **`geofencing.ts`**: Uses `expo-location` and `expo-task-manager` to detect when a user is physically present at a landmark.
- **`notifications.ts`**: Manages push notifications to alert users about nearby monuments or streak reminders.
- **`streak.ts`**: Logic for calculating consecutive days of interaction to drive user retention.
- **`translations.ts`**: Centralized dictionary and logic for multi-language support.

---

## 🚀 Key Capabilities

### 1. AI-Driven Exploration
Integrates advanced AI models to provide real-time, context-aware information about monuments. It can generate personalized quizzes based on the user's location and history.

### 2. Intelligent Geofencing
Runs background tasks to monitor user location. When a user arrives at a historical site, the app triggers a "Check-in" flow, unlocking specific rewards and content.

### 3. Gamified Progression
Features an XP (Experience Points) system, achievement badges, and a global leaderboard to encourage competition and discovery.

### 4. Media Capture & Management
Allows users to take photos of monuments and store them in a secure "Memory Vault" (Supabase Storage), automatically linking them to the specific landmark and date.

### 5. Multi-Language Support
Architecture built from the ground up to support multiple languages, making historical information accessible to a global audience.

---

## 🛡️ Security & Performance

- **Secure Storage**: Sensitive data and tokens are managed via `expo-secure-store`.
- **Row Level Security (RLS)**: The Supabase backend ensures that users can only access their own session data and photos.
- **Optimized Imaging**: Uses `expo-image` for high-performance image loading and caching.
- **Adaptive UI**: Built with **NativeWind** for consistent styling across iOS and Android, with full support for Dark Mode.

---

## 🛠 Getting Started

1.  **Install dependencies**: `npm install`
2.  **Configure Environment**: Add `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and Clerk keys to `.env`.
3.  **Run Development**: `npx expo start`
